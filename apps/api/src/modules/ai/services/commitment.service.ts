import { Injectable, Logger } from '@nestjs/common';

import {
  localDateTime,
  zonedTimeToUtc,
} from '../../../common/utils/local-time.util';
import { PrismaService } from '../../../database';
import { htmlToPlainText } from '../utils/signature.util';
import { stripQuotedHistory } from '../utils/thread-context.util';
import { AiClientService, Commitment } from './ai-client.service';

// Messages read per scan. Each one is an LLM call, and the scan runs every
// few minutes, so this bounds what a burst of sent mail costs at once.
const COMMITMENT_SCAN_BATCH = 20;
// Only recent mail: a promise from weeks ago is either kept or forgotten,
// and reminding about it now would be noise.
export const COMMITMENT_MAX_AGE_DAYS = 14;
// Below this the model itself wasn't sure it was a real promise.
export const COMMITMENT_MIN_CONFIDENCE = 0.7;
// "By Friday" with no time means by the end of the working day.
const DEFAULT_DUE_TIME = '17:00';
const MAX_CONTENT_LENGTH = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Commitments (docs/ai-features-implementation-plan.md, Phase 3): promises
 * the user makes in sent mail ("I'll send the deck by Friday") become
 * COMMITMENT tasks with a due date. Compose and sync mark recent outbound
 * mail `commitmentScanPending`; the automation queue's commitment scan
 * reads those here. The reminder when one falls due is
 * AutomationService.runCommitmentReminders.
 */
@Injectable()
export class CommitmentService {
  private readonly logger = new Logger(CommitmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
  ) {}

  /**
   * Reads one batch of pending sent messages, newest first, and returns
   * how many were read. Each message is claimed (pending cleared in one
   * conditional update) before the AI call, so two scans never read the
   * same one. If the AI service fails, that message goes back to pending
   * and the batch stops — a rate limit then costs one retry per scan, not
   * a failure per message; the age limit drops anything that keeps failing.
   */
  async scanPending(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - COMMITMENT_MAX_AGE_DAYS * DAY_MS);

    // Anything past the window is dropped without reading it.
    await this.prisma.emailMessage.updateMany({
      where: { commitmentScanPending: true, receivedAt: { lt: cutoff } },
      data: { commitmentScanPending: false },
    });

    const messages = await this.prisma.emailMessage.findMany({
      where: { commitmentScanPending: true },
      orderBy: { receivedAt: 'desc' },
      take: COMMITMENT_SCAN_BATCH,
      select: {
        id: true,
        threadId: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        receivedAt: true,
        thread: {
          select: {
            subject: true,
            account: {
              select: {
                userId: true,
                user: { select: { displayName: true, timezone: true } },
              },
            },
          },
        },
      },
    });

    let read = 0;
    for (const message of messages) {
      const { count } = await this.prisma.emailMessage.updateMany({
        where: { id: message.id, commitmentScanPending: true },
        data: { commitmentScanPending: false },
      });
      if (count === 0) {
        continue;
      }

      const content = ownText(message.bodyText, message.bodyHtml);
      if (!content) {
        read++;
        continue;
      }

      const { userId, user } = message.thread.account;
      const timezone = user.timezone || 'UTC';
      const sent = localDateTime(message.receivedAt, timezone);

      let commitments: Commitment[];
      try {
        ({ commitments } = await this.aiClientService.commitments({
          subject: message.subject ?? message.thread.subject ?? '',
          senderName: user.displayName ?? '',
          content,
          sentAt: `${sent.weekday} ${sent.date} ${sent.time}`,
          sentDate: sent.date,
          timezone,
        }));
      } catch (error: unknown) {
        await this.prisma.emailMessage.update({
          where: { id: message.id },
          data: { commitmentScanPending: true },
        });
        this.logger.warn(
          `Commitment scan paused at message ${message.id}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
        break;
      }

      await this.createTasks(
        userId,
        message.id,
        message.threadId,
        message.receivedAt,
        timezone,
        commitments,
      );
      read++;
    }

    return read;
  }

  /** One COMMITMENT task per confident commitment, skipping any the thread
   * already has with the same wording (a later message repeating the
   * promise, or the provider's copy of mail sent from the app). */
  private async createTasks(
    userId: string,
    messageId: string,
    threadId: string,
    sentAt: Date,
    timezone: string,
    commitments: Commitment[],
  ): Promise<void> {
    const confident = commitments.filter(
      (commitment) => commitment.confidence >= COMMITMENT_MIN_CONFIDENCE,
    );
    if (confident.length === 0) {
      return;
    }

    const existing = await this.prisma.task.findMany({
      where: { threadId, type: 'COMMITMENT' },
      select: { description: true },
    });
    const seen = new Set(existing.map((task) => sameWording(task.description)));

    for (const commitment of confident) {
      const key = sameWording(commitment.text);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);

      await this.prisma.task.create({
        data: {
          userId,
          emailMessageId: messageId,
          threadId,
          type: 'COMMITMENT',
          description: commitment.text,
          dueDate: dueDateOf(commitment, sentAt, timezone),
        },
      });
    }
  }
}

/** The user's own words in a sent message: quoted history removed, and
 * capped to what the AI service accepts. */
export function ownText(
  bodyText: string | null,
  bodyHtml: string | null,
): string {
  const text = bodyText?.trim() ? bodyText : htmlToPlainText(bodyHtml ?? '');
  return stripQuotedHistory(text).trim().slice(0, MAX_CONTENT_LENGTH);
}

/** The due instant, on the user's clock; end of the working day when only
 * a date was named. A deadline earlier than the message itself ("by 5pm
 * today" sent at 6pm) means later that same day. */
export function dueDateOf(
  commitment: Pick<Commitment, 'dueDate' | 'dueTime'>,
  sentAt: Date,
  timezone: string,
): Date | null {
  if (!commitment.dueDate) {
    return null;
  }

  const due = zonedTimeToUtc(
    commitment.dueDate,
    commitment.dueTime ?? DEFAULT_DUE_TIME,
    timezone,
  );
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  return due < sentAt
    ? zonedTimeToUtc(commitment.dueDate, '23:59', timezone)
    : due;
}

/** Wording compared loosely: case, punctuation and spacing ignored. */
function sameWording(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
