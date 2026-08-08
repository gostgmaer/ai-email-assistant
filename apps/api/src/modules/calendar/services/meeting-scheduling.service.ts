import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

// Leaf-file imports rather than the module barrels (`../../ai`,
// `../../email`, `../../tasks`) on purpose: those barrels re-export the
// *.module.ts too, and this file is itself part of the
// CalendarModule <-> AiModule forwardRef() cycle — pulling in a whole
// module's file graph here creates a require()-order-dependent circular
// import that trips up Jest's isolated module loading (though not
// Nest's own bootstrap, which resolves the full graph before use). See
// meeting-scheduling.service.spec.ts.
import { EmailMessageDto } from '../../ai/dto/email-message.dto';
import { AiClientService } from '../../ai/services/ai-client.service';
import { ComposeService } from '../../email/services/compose.service';
import { TasksService } from '../../tasks/services/tasks.service';
import { CalendarAccountService } from './calendar-account.service';
import { CalendarService } from './calendar.service';

const AVAILABILITY_LOOKUP_DAYS = 14;

interface EmailParticipant {
  name?: string;
  address: string;
}

function firstParticipant(from: unknown): EmailParticipant | undefined {
  const list = from as EmailParticipant[] | undefined;
  return Array.isArray(list) ? list[0] : undefined;
}

function formatEventTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export interface ScheduleMeetingInput {
  calendarAccountId: string;
  start: string;
  end: string;
  title: string;
  attendeeEmail?: string;
}

/**
 * Shared by MeetingSchedulingController (the human-reviewed path: suggest,
 * let the user edit, then schedule on explicit confirmation) and
 * AiProcessingProcessor's opt-in full-automation path (suggest and
 * schedule back-to-back with no human in the loop, gated by
 * EmailAccount.autoScheduleMeetings). Keeping the suggest/schedule/confirm
 * logic here means both callers stay in sync instead of drifting.
 */
@Injectable()
export class MeetingSchedulingService {
  private readonly logger = new Logger(MeetingSchedulingService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly calendarAccountService: CalendarAccountService,
    private readonly calendarService: CalendarService,
    private readonly aiClientService: AiClientService,
    private readonly composeService: ComposeService,
  ) {}

  async suggestTime(userId: string, taskId: string) {
    const task = await this.tasksService.getOwnedTaskWithMessage(
      userId,
      taskId,
    );

    if (task.type !== 'MEETING_REQUEST') {
      throw new BadRequestException('This task is not a meeting request');
    }

    const accounts = await this.calendarAccountService.listForUser(userId);
    const account = accounts.find((a) => a.isPrimary) ?? accounts[0];

    if (!account) {
      throw new NotFoundException(
        'Connect a calendar before requesting a meeting time suggestion',
      );
    }

    const now = new Date();
    const lookupEnd = new Date(
      now.getTime() + AVAILABILITY_LOOKUP_DAYS * 24 * 60 * 60 * 1000,
    );

    const busy = await this.calendarService.getFreeBusy(
      account.id,
      account.provider,
      account.email,
      now,
      lookupEnd,
    );

    const { suggestion } = await this.aiClientService.suggestMeetingTime(
      task.description,
      now.toISOString(),
      busy,
    );

    return {
      ...suggestion,
      calendarAccountId: account.id,
      suggestedAttendeeEmail: firstParticipant(task.emailMessage?.from)
        ?.address,
    };
  }

  async schedule(userId: string, taskId: string, dto: ScheduleMeetingInput) {
    const originalTask = await this.tasksService.getOwnedTaskWithMessage(
      userId,
      taskId,
    );
    const account = await this.calendarAccountService.getOwnedAccountOrThrow(
      userId,
      dto.calendarAccountId,
    );

    const event = await this.calendarService.createEvent(
      account.id,
      account.provider,
      {
        summary: dto.title,
        start: dto.start,
        end: dto.end,
        attendeeEmail: dto.attendeeEmail,
      },
    );

    const task = await this.tasksService.setScheduledEvent(taskId, {
      calendarEventId: event.id,
      calendarEventUrl: event.htmlLink,
    });

    // Same gate as the calendar invite itself: only reply in the thread if
    // the user (or their auto-schedule setting) opted to notify this
    // person at all. Best-effort — the meeting is already successfully
    // created at this point, so a reply failure (e.g. the account's send
    // quota, a since-deleted message, the AI service being unavailable)
    // must not turn a successful schedule into an error.
    if (dto.attendeeEmail && originalTask.emailMessageId) {
      try {
        const sender = firstParticipant(originalTask.emailMessage?.from);
        const subject = originalTask.emailMessage?.subject ?? dto.title;
        const originalMessage: EmailMessageDto = {
          name: sender?.name ?? sender?.address ?? 'Unknown',
          email: sender?.address ?? dto.attendeeEmail,
          content:
            originalTask.emailMessage?.bodyText ?? originalTask.description,
        };

        const { reply } = await this.aiClientService.generateReply(
          subject,
          [originalMessage],
          `Write a short reply confirming the meeting "${dto.title}" has been scheduled for ${formatEventTime(dto.start, dto.end)}. Mention that a calendar invite has been sent separately — do not invent or restate a link yourself, one is appended after your reply automatically. 2-3 sentences, no restating the original request.`,
        );

        // The link is appended here, deterministically, rather than left to
        // the LLM to include correctly — generateReply() has no reliable
        // way to embed a real URL it was never given. This is also the
        // fallback if the account's own Google/Outlook invite email
        // (sendUpdates=all — see CalendarService.createEvent) doesn't reach
        // the recipient for some reason (spam filtering, etc.): the link is
        // guaranteed to be in this reply's body either way.
        const bodyText = `${reply}\n\nView/add to your calendar: ${event.htmlLink}`;
        const bodyHtml = `<p>${reply.replace(/\n/g, '<br />')}</p><p><a href="${event.htmlLink}">View/add to your calendar</a></p>`;

        await this.composeService.reply(userId, {
          messageId: originalTask.emailMessageId,
          bodyHtml,
          bodyText,
        });
      } catch (error) {
        this.logger.warn(
          `Meeting was scheduled but the confirmation reply failed for task ${taskId}: ${String(error)}`,
        );
      }
    }

    return { task, event };
  }

  /**
   * The opt-in full-automation path (EmailAccount.autoScheduleMeetings):
   * suggest a time and schedule it immediately, with no human review.
   * Only ever called for a MEETING_REQUEST task that has a sender address
   * to notify — silently skips (rather than throwing) when there's no
   * connected calendar or no sender, since this runs unattended off the
   * AI processing pipeline and a missing prerequisite there just means
   * "leave it for manual scheduling", not an error worth surfacing.
   */
  async autoSchedule(userId: string, taskId: string): Promise<void> {
    try {
      const suggestion = await this.suggestTime(userId, taskId);

      if (!suggestion.suggestedAttendeeEmail) {
        return;
      }

      await this.schedule(userId, taskId, {
        calendarAccountId: suggestion.calendarAccountId,
        start: suggestion.start,
        end: suggestion.end,
        title: suggestion.title,
        attendeeEmail: suggestion.suggestedAttendeeEmail,
      });
    } catch (error) {
      this.logger.warn(
        `Auto-schedule failed for task ${taskId}, leaving it for manual scheduling: ${String(error)}`,
      );
    }
  }
}
