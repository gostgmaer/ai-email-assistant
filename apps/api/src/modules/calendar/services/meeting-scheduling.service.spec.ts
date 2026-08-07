import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AiClientService } from '../../ai/services/ai-client.service';
import type { ComposeService } from '../../email/services/compose.service';
import type { TasksService } from '../../tasks/services/tasks.service';
import { CalendarAccountService } from './calendar-account.service';
import { CalendarService } from './calendar.service';
import { MeetingSchedulingService } from './meeting-scheduling.service';

describe('MeetingSchedulingService', () => {
  const userId = 'user-1';
  const taskId = 'task-1';

  function buildDeps() {
    const tasksService = {
      getOwnedTaskWithMessage: jest.fn(),
      setScheduledEvent: jest.fn(),
    } as unknown as jest.Mocked<TasksService>;

    const calendarAccountService = {
      listForUser: jest.fn(),
      getOwnedAccountOrThrow: jest.fn(),
    } as unknown as jest.Mocked<CalendarAccountService>;

    const calendarService = {
      getFreeBusy: jest.fn(),
      createEvent: jest.fn(),
    } as unknown as jest.Mocked<CalendarService>;

    const aiClientService = {
      suggestMeetingTime: jest.fn(),
      generateReply: jest.fn(),
    } as unknown as jest.Mocked<AiClientService>;

    const composeService = {
      reply: jest.fn(),
    } as unknown as jest.Mocked<ComposeService>;

    const service = new MeetingSchedulingService(
      tasksService,
      calendarAccountService,
      calendarService,
      aiClientService,
      composeService,
    );

    return {
      service,
      tasksService,
      calendarAccountService,
      calendarService,
      aiClientService,
      composeService,
    };
  }

  describe('suggestTime', () => {
    it('throws BadRequestException for a non-meeting-request task', async () => {
      const { service, tasksService } = buildDeps();
      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        type: 'ACTION_ITEM',
      } as never);

      await expect(service.suggestTime(userId, taskId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when no calendar is connected', async () => {
      const { service, tasksService, calendarAccountService } = buildDeps();
      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        type: 'MEETING_REQUEST',
        description: 'Sync sometime next week',
      } as never);
      calendarAccountService.listForUser.mockResolvedValue([]);

      await expect(service.suggestTime(userId, taskId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('prefers the primary calendar account and returns the suggested attendee from the sender', async () => {
      const { service, tasksService, calendarAccountService, calendarService, aiClientService } =
        buildDeps();

      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        type: 'MEETING_REQUEST',
        description: 'Sync sometime next week',
        emailMessage: { from: [{ address: 'sender@example.com', name: 'Sender' }] },
      } as never);
      calendarAccountService.listForUser.mockResolvedValue([
        { id: 'acct-secondary', isPrimary: false, provider: 'GOOGLE', email: 'a@x.com' },
        { id: 'acct-primary', isPrimary: true, provider: 'GOOGLE', email: 'b@x.com' },
      ] as never);
      calendarService.getFreeBusy.mockResolvedValue([]);
      aiClientService.suggestMeetingTime.mockResolvedValue({
        suggestion: {
          start: '2026-08-09T14:00:00Z',
          end: '2026-08-09T14:30:00Z',
          title: 'Sync',
        },
        provider: 'anthropic',
        model: 'claude',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      } as never);

      const result = await service.suggestTime(userId, taskId);

      expect(calendarService.getFreeBusy).toHaveBeenCalledWith(
        'acct-primary',
        'GOOGLE',
        'b@x.com',
        expect.any(Date),
        expect.any(Date),
      );
      expect(result).toMatchObject({
        calendarAccountId: 'acct-primary',
        suggestedAttendeeEmail: 'sender@example.com',
        title: 'Sync',
      });
    });
  });

  describe('schedule', () => {
    it('creates the event, marks the task DONE, and sends a confirmation reply via the AI agent when an attendee is given', async () => {
      const { service, tasksService, calendarAccountService, calendarService, aiClientService, composeService } =
        buildDeps();

      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        emailMessageId: 'msg-1',
        description: 'Sync sometime next week',
        emailMessage: {
          from: [{ address: 'sender@example.com', name: 'Sender' }],
          subject: 'Syncing up',
          bodyText: 'Can we sync next week?',
        },
      } as never);
      calendarAccountService.getOwnedAccountOrThrow.mockResolvedValue({
        id: 'acct-1',
        provider: 'GOOGLE',
      } as never);
      calendarService.createEvent.mockResolvedValue({
        id: 'evt-1',
        htmlLink: 'https://calendar.google.com/x',
      });
      tasksService.setScheduledEvent.mockResolvedValue({ id: taskId, status: 'DONE' } as never);
      aiClientService.generateReply.mockResolvedValue({
        reply: 'Confirmed — see you then!',
        provider: 'anthropic',
        model: 'claude',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      } as never);

      const result = await service.schedule(userId, taskId, {
        calendarAccountId: 'acct-1',
        start: '2026-08-09T14:00:00Z',
        end: '2026-08-09T14:30:00Z',
        title: 'Sync',
        attendeeEmail: 'sender@example.com',
      });

      expect(calendarService.createEvent).toHaveBeenCalledWith('acct-1', 'GOOGLE', {
        summary: 'Sync',
        start: '2026-08-09T14:00:00Z',
        end: '2026-08-09T14:30:00Z',
        attendeeEmail: 'sender@example.com',
      });
      expect(tasksService.setScheduledEvent).toHaveBeenCalledWith(taskId, {
        calendarEventId: 'evt-1',
        calendarEventUrl: 'https://calendar.google.com/x',
      });
      expect(aiClientService.generateReply).toHaveBeenCalled();
      expect(composeService.reply).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          messageId: 'msg-1',
          bodyText: 'Confirmed — see you then!',
        }),
      );
      expect(result).toEqual({
        task: { id: taskId, status: 'DONE' },
        event: { id: 'evt-1', htmlLink: 'https://calendar.google.com/x' },
      });
    });

    it('does not send a reply when no attendee is given', async () => {
      const { service, tasksService, calendarAccountService, calendarService, aiClientService, composeService } =
        buildDeps();

      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        emailMessageId: 'msg-1',
        description: 'Sync sometime next week',
      } as never);
      calendarAccountService.getOwnedAccountOrThrow.mockResolvedValue({
        id: 'acct-1',
        provider: 'GOOGLE',
      } as never);
      calendarService.createEvent.mockResolvedValue({
        id: 'evt-1',
        htmlLink: 'https://calendar.google.com/x',
      });
      tasksService.setScheduledEvent.mockResolvedValue({ id: taskId, status: 'DONE' } as never);

      await service.schedule(userId, taskId, {
        calendarAccountId: 'acct-1',
        start: '2026-08-09T14:00:00Z',
        end: '2026-08-09T14:30:00Z',
        title: 'Sync',
      });

      expect(aiClientService.generateReply).not.toHaveBeenCalled();
      expect(composeService.reply).not.toHaveBeenCalled();
    });

    it('does not let a confirmation-reply failure turn a successful schedule into an error', async () => {
      const { service, tasksService, calendarAccountService, calendarService, aiClientService } =
        buildDeps();

      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        emailMessageId: 'msg-1',
        description: 'Sync sometime next week',
        emailMessage: { from: [{ address: 'sender@example.com' }] },
      } as never);
      calendarAccountService.getOwnedAccountOrThrow.mockResolvedValue({
        id: 'acct-1',
        provider: 'GOOGLE',
      } as never);
      calendarService.createEvent.mockResolvedValue({
        id: 'evt-1',
        htmlLink: 'https://calendar.google.com/x',
      });
      tasksService.setScheduledEvent.mockResolvedValue({ id: taskId, status: 'DONE' } as never);
      aiClientService.generateReply.mockRejectedValue(new Error('AI service down'));

      const result = await service.schedule(userId, taskId, {
        calendarAccountId: 'acct-1',
        start: '2026-08-09T14:00:00Z',
        end: '2026-08-09T14:30:00Z',
        title: 'Sync',
        attendeeEmail: 'sender@example.com',
      });

      expect(result.event).toEqual({ id: 'evt-1', htmlLink: 'https://calendar.google.com/x' });
    });
  });

  describe('autoSchedule', () => {
    it('skips scheduling when there is no sender to notify', async () => {
      const { service, tasksService, calendarAccountService, calendarService, aiClientService } =
        buildDeps();

      tasksService.getOwnedTaskWithMessage.mockResolvedValue({
        id: taskId,
        type: 'MEETING_REQUEST',
        description: 'Sync sometime next week',
      } as never);
      calendarAccountService.listForUser.mockResolvedValue([
        { id: 'acct-1', isPrimary: true, provider: 'GOOGLE', email: 'me@x.com' },
      ] as never);
      calendarService.getFreeBusy.mockResolvedValue([]);
      aiClientService.suggestMeetingTime.mockResolvedValue({
        suggestion: { start: '2026-08-09T14:00:00Z', end: '2026-08-09T14:30:00Z', title: 'Sync' },
        provider: 'anthropic',
        model: 'claude',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      } as never);

      await service.autoSchedule(userId, taskId);

      expect(calendarService.createEvent).not.toHaveBeenCalled();
    });

    it('never throws, even when suggestTime fails outright', async () => {
      const { service, tasksService } = buildDeps();
      tasksService.getOwnedTaskWithMessage.mockRejectedValue(new Error('db down'));

      await expect(service.autoSchedule(userId, taskId)).resolves.toBeUndefined();
    });
  });
});
