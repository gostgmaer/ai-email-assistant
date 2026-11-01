import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  MeetingProposalService,
  workingZone,
} from './meeting-proposal.service';

const NOW = new Date('2026-11-02T03:30:00Z');
const SLOTS = [
  { start: '2026-11-03T04:30:00Z', end: '2026-11-03T05:00:00Z' },
  { start: '2026-11-04T04:30:00Z', end: '2026-11-04T05:00:00Z' },
];
const PROPOSED_AT = new Date('2026-11-02T04:00:00Z');

function buildDeps() {
  const prisma = {
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ timezone: 'Asia/Kolkata' }),
    },
    task: {
      update: jest.fn().mockResolvedValue({ id: 'task-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const tasksService = { getOwnedTaskWithMessage: jest.fn() };
  const calendarAccountService = {
    listForUser: jest
      .fn()
      .mockResolvedValue([
        { id: 'cal-1', provider: 'GOOGLE', email: 'me@x.com', isPrimary: true },
      ]),
  };
  const calendarService = { getFreeBusy: jest.fn().mockResolvedValue([]) };
  const aiClientService = {
    meetingPreferences: jest.fn().mockResolvedValue({
      preferences: {
        title: 'Website redesign call',
        durationMinutes: 30,
        earliestDate: null,
        latestDate: null,
        partOfDay: 'any',
        preferredTime: null,
        otherTimezone: 'Europe/London',
      },
    }),
    meetingPick: jest.fn(),
  };
  const service = new MeetingProposalService(
    prisma as never,
    tasksService as never,
    calendarAccountService as never,
    calendarService as never,
    aiClientService as never,
  );
  return {
    service,
    prisma,
    tasksService,
    calendarAccountService,
    aiClientService,
  };
}

const meetingTask = {
  id: 'task-1',
  type: 'MEETING_REQUEST',
  description: 'A call about the redesign',
  emailMessage: {
    from: [{ name: 'Priya', address: 'priya@example.com' }],
    subject: 'Redesign',
    bodyText: 'Are you free this week?',
  },
};

describe('MeetingProposalService.propose', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('stores the offer and returns the text for the reply box', async () => {
    const { service, prisma, tasksService } = buildDeps();
    tasksService.getOwnedTaskWithMessage.mockResolvedValue(meetingTask);

    const { proposal, text } = await service.propose('user-1', 'task-1');

    expect(proposal.title).toBe('Website redesign call');
    expect(proposal.slots).toHaveLength(3);
    expect(proposal.attendeeEmail).toBe('priya@example.com');
    expect(proposal.calendarAccountId).toBe('cal-1');
    // Both clocks, so nobody has to convert.
    expect(text).toContain(
      'Monday, Nov 2, 10:00 AM GMT+5:30 (Mon, 4:30 AM GMT)',
    );
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickedSlotIndex: null,
          pickCheckedAt: null,
          proposedAt: NOW,
        }) as unknown,
      }),
    );
  });

  it('still offers times when the AI is unavailable', async () => {
    const { service, tasksService, aiClientService } = buildDeps();
    tasksService.getOwnedTaskWithMessage.mockResolvedValue(meetingTask);
    aiClientService.meetingPreferences.mockRejectedValue(new Error('429'));

    const { proposal } = await service.propose('user-1', 'task-1');

    expect(proposal.title).toBe('Redesign');
    expect(proposal.slots).toHaveLength(3);
  });

  it('refuses a task that is not a meeting request', async () => {
    const { service, tasksService } = buildDeps();
    tasksService.getOwnedTaskWithMessage.mockResolvedValue({
      ...meetingTask,
      type: 'ACTION_ITEM',
    });

    await expect(service.propose('user-1', 'task-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('asks for a calendar when none is connected', async () => {
    const { service, tasksService, calendarAccountService } = buildDeps();
    tasksService.getOwnedTaskWithMessage.mockResolvedValue(meetingTask);
    calendarAccountService.listForUser.mockResolvedValue([]);

    await expect(service.propose('user-1', 'task-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('MeetingProposalService.scanPicks', () => {
  const own = { address: 'me@x.com' };
  const them = { address: 'priya@example.com' };
  const sent = {
    id: 'sent',
    from: [own],
    bodyText: 'Here are some times',
    bodyHtml: null,
    receivedAt: new Date('2026-11-02T04:05:00Z'),
  };
  const reply = {
    id: 'reply',
    from: [them],
    bodyText: 'Tuesday works.',
    bodyHtml: null,
    receivedAt: new Date('2026-11-02T05:00:00Z'),
  };

  function taskRow(messages: unknown[], lastMessageFromSelf = false) {
    return {
      id: 'task-1',
      threadId: 'thread-1',
      proposedAt: PROPOSED_AT,
      pickCheckedAt: null,
      meetingProposal: {
        title: 'Call',
        slots: SLOTS,
        timezone: 'UTC',
        otherTimezone: null,
        calendarAccountId: 'cal-1',
        attendeeEmail: 'priya@example.com',
      },
      thread: {
        lastMessageFromSelf,
        account: { email: 'me@x.com', aliases: [] },
        messages,
      },
    };
  }

  it('records the slot a reply accepts, without creating anything', async () => {
    const { service, prisma, aiClientService } = buildDeps();
    prisma.task.findMany.mockResolvedValue([taskRow([sent, reply])]);
    aiClientService.meetingPick.mockResolvedValue({
      picked: 2,
      confidence: 0.9,
    });

    expect(await service.scanPicks(NOW)).toBe(1);

    expect(aiClientService.meetingPick).toHaveBeenCalledWith(
      [
        expect.stringContaining('Tuesday'),
        expect.stringContaining('Wednesday'),
      ],
      'Tuesday works.',
    );
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { pickedSlotIndex: 1 },
    });
  });

  it('ignores an unsure pick', async () => {
    const { service, prisma, aiClientService } = buildDeps();
    prisma.task.findMany.mockResolvedValue([taskRow([sent, reply])]);
    aiClientService.meetingPick.mockResolvedValue({
      picked: 1,
      confidence: 0.4,
    });

    await service.scanPicks(NOW);

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('reads nothing until the offer has actually been sent', async () => {
    const { service, aiClientService, prisma } = buildDeps();
    prisma.task.findMany.mockResolvedValue([taskRow([reply])]);

    expect(await service.scanPicks(NOW)).toBe(0);
    expect(aiClientService.meetingPick).not.toHaveBeenCalled();
  });

  it("reads nothing when the newest message is the user's own", async () => {
    const { service, aiClientService, prisma } = buildDeps();
    prisma.task.findMany.mockResolvedValue([taskRow([sent], true)]);

    expect(await service.scanPicks(NOW)).toBe(0);
    expect(aiClientService.meetingPick).not.toHaveBeenCalled();
  });

  it('puts the reply back and pauses on an AI error', async () => {
    const { service, prisma, aiClientService } = buildDeps();
    prisma.task.findMany.mockResolvedValue([
      taskRow([sent, reply]),
      taskRow([sent, reply]),
    ]);
    aiClientService.meetingPick.mockRejectedValue(new Error('429'));

    expect(await service.scanPicks(NOW)).toBe(0);

    expect(aiClientService.meetingPick).toHaveBeenCalledTimes(1);
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { pickCheckedAt: null },
    });
  });
});

describe('workingZone', () => {
  it('prefers a zone the user saved', () => {
    expect(workingZone('Asia/Kolkata', 'Europe/Paris')).toBe('Asia/Kolkata');
  });

  it("uses the browser's when the profile is still on the default", () => {
    expect(workingZone('UTC', 'Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(workingZone(null, 'Asia/Kolkata')).toBe('Asia/Kolkata');
  });

  it('ignores a browser zone that is not real', () => {
    expect(workingZone('UTC', 'Mars/Olympus')).toBe('UTC');
    expect(workingZone('UTC')).toBe('UTC');
  });
});
