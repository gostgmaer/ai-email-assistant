import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  isValidTimeZone,
  localDateTime,
} from '../../../common/utils/local-time.util';
import { PrismaService } from '../../../database';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import {
  AiClientService,
  MeetingPreferences,
} from '../../ai/services/ai-client.service';
import { ownText } from '../../ai/services/commitment.service';
import { TasksService } from '../../tasks/services/tasks.service';
import {
  describeSlot,
  findFreeSlots,
  proposalText,
  Slot,
  SLOT_LOOKAHEAD_DAYS,
} from '../utils/meeting-slots.util';
import { CalendarAccountService } from './calendar-account.service';
import { CalendarService } from './calendar.service';

// Tasks read per scan; each reply is an LLM call.
const PICK_SCAN_BATCH = 20;
// Past this a reply is unlikely to be about the times that were offered.
const PICK_MAX_AGE_DAYS = 14;
export const PICK_MIN_CONFIDENCE = 0.7;
const MAX_CONTENT_LENGTH = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A saved zone wins. UTC is also the column's default, so for most people
 * it means "never set": offering 12:00–17:00 UTC to someone in India would
 * be their evening, so the browser's zone is the better guess there. */
export function workingZone(saved?: string | null, browser?: string): string {
  if (saved && saved !== 'UTC') return saved;
  return browser && isValidTimeZone(browser) ? browser : 'UTC';
}

export interface MeetingProposal {
  title: string;
  slots: Slot[];
  /** The zone the slots were chosen and written in. */
  timezone: string;
  otherTimezone: string | null;
  calendarAccountId: string;
  attendeeEmail: string | null;
}

interface Participant {
  name?: string;
  address?: string;
}

function addresses(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as Participant[])
        .map((participant) => participant.address?.toLowerCase())
        .filter((address): address is string => Boolean(address))
    : [];
}

/**
 * Meeting requests in one step (docs/ai-features-implementation-plan.md,
 * Phase 5): "Propose times" offers free slots from the user's calendar as
 * text for the reply box, and the automation queue's scan reads later
 * replies for which slot was accepted. Neither sends nor books anything:
 * the user sends the reply, and the event is created by
 * MeetingSchedulingService.schedule on their click.
 */
@Injectable()
export class MeetingProposalService {
  private readonly logger = new Logger(MeetingProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly calendarAccountService: CalendarAccountService,
    private readonly calendarService: CalendarService,
    private readonly aiClientService: AiClientService,
  ) {}

  async propose(userId: string, taskId: string, browserZone?: string) {
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
      throw new NotFoundException('Connect a calendar to propose times');
    }

    const { timezone } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const zone = workingZone(timezone, browserZone);

    const now = new Date();
    const busy = await this.calendarService.getFreeBusy(
      account.id,
      account.provider,
      account.email,
      now,
      new Date(now.getTime() + (SLOT_LOOKAHEAD_DAYS + 1) * DAY_MS),
    );

    const subject = task.emailMessage?.subject ?? '';
    const preferences = await this.readPreferences(
      task.description,
      task.emailMessage?.bodyText ?? '',
      subject,
      now,
      zone,
    );

    const slots = findFreeSlots(preferences, busy, now, zone);
    if (slots.length === 0) {
      throw new BadRequestException(
        'Your calendar has no free time in working hours over the next two weeks.',
      );
    }

    const sender = (
      task.emailMessage?.from as Participant[] | null | undefined
    )?.[0];
    const proposal: MeetingProposal = {
      title: preferences.title || subject || 'Meeting',
      slots,
      timezone: zone,
      otherTimezone: preferences.otherTimezone,
      calendarAccountId: account.id,
      attendeeEmail: sender?.address ?? null,
    };

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        meetingProposal: proposal as unknown as InputJsonValue,
        proposedAt: now,
        // A new offer: anything said about the old one no longer applies.
        pickedSlotIndex: null,
        pickCheckedAt: null,
      },
    });

    const labels = slots.map((slot) =>
      describeSlot(slot, zone, proposal.otherTimezone),
    );
    return { task: updated, proposal, text: proposalText(labels) };
  }

  /** The AI being unavailable shouldn't stop the user offering times: with
   * no preferences, the next free working-hours slots are still right. */
  private async readPreferences(
    description: string,
    bodyText: string,
    subject: string,
    now: Date,
    zone: string,
  ): Promise<MeetingPreferences> {
    const local = localDateTime(now, zone);
    try {
      const { preferences } = await this.aiClientService.meetingPreferences({
        description,
        content: bodyText.slice(0, MAX_CONTENT_LENGTH),
        now: `${local.weekday} ${local.date} ${local.time}`,
        today: local.date,
        timezone: zone,
      });
      return preferences;
    } catch (error: unknown) {
      this.logger.warn(
        `Couldn't read the meeting request, offering the next free times: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
      return {
        title: subject,
        durationMinutes: 30,
        earliestDate: null,
        latestDate: null,
        partOfDay: 'any',
        preferredTime: null,
        otherTimezone: null,
      };
    }
  }

  /**
   * Reads replies to offered times. A task is read only once the offer has
   * really gone out (a message from the user's own address after
   * proposedAt) and someone else has answered it. An AI error rolls the
   * marker back and pauses the scan. Returns how many replies were read.
   */
  async scanPicks(now = new Date()): Promise<number> {
    const tasks = await this.prisma.task.findMany({
      where: {
        type: 'MEETING_REQUEST',
        status: 'PENDING',
        calendarEventId: null,
        pickedSlotIndex: null,
        threadId: { not: null },
        proposedAt: {
          gte: new Date(now.getTime() - PICK_MAX_AGE_DAYS * DAY_MS),
        },
      },
      select: {
        id: true,
        threadId: true,
        proposedAt: true,
        pickCheckedAt: true,
        meetingProposal: true,
        thread: {
          select: {
            lastMessageFromSelf: true,
            account: { select: { email: true, aliases: true } },
            messages: {
              orderBy: { receivedAt: 'asc' },
              select: {
                id: true,
                from: true,
                bodyText: true,
                bodyHtml: true,
                receivedAt: true,
              },
            },
          },
        },
      },
      orderBy: { proposedAt: 'desc' },
      take: PICK_SCAN_BATCH,
    });

    let read = 0;
    for (const task of tasks) {
      // The newest message is the user's own: nothing new to read.
      if (!task.thread || task.thread.lastMessageFromSelf) continue;
      const { account, messages } = task.thread;

      const own = new Set(
        [account.email, ...account.aliases].map((a) => a.toLowerCase()),
      );
      const isOwn = (from: unknown) =>
        addresses(from).some((address) => own.has(address));

      const proposedAt = task.proposedAt;
      const offerSent = messages.find(
        (message) => message.receivedAt >= proposedAt && isOwn(message.from),
      );
      if (!offerSent) continue;

      const after = task.pickCheckedAt ?? offerSent.receivedAt;
      const replies = messages.filter(
        (message) => message.receivedAt > after && !isOwn(message.from),
      );
      const reply = replies[replies.length - 1];
      if (!reply) continue;

      const { count } = await this.prisma.task.updateMany({
        where: { id: task.id, pickCheckedAt: task.pickCheckedAt },
        data: { pickCheckedAt: reply.receivedAt },
      });
      if (count === 0) continue;

      const proposal = task.meetingProposal as unknown as MeetingProposal;
      const content = ownText(reply.bodyText, reply.bodyHtml).slice(
        0,
        MAX_CONTENT_LENGTH,
      );
      read++;
      if (!content) continue;

      try {
        const { picked, confidence } = await this.aiClientService.meetingPick(
          proposal.slots.map((slot) =>
            describeSlot(slot, proposal.timezone, proposal.otherTimezone),
          ),
          content,
        );
        if (
          picked !== null &&
          picked >= 1 &&
          picked <= proposal.slots.length &&
          confidence >= PICK_MIN_CONFIDENCE
        ) {
          await this.prisma.task.update({
            where: { id: task.id },
            data: { pickedSlotIndex: picked - 1 },
          });
        }
      } catch (error: unknown) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { pickCheckedAt: task.pickCheckedAt },
        });
        read--;
        this.logger.warn(
          `Meeting pick scan paused at task ${task.id}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
        break;
      }
    }

    return read;
  }
}
