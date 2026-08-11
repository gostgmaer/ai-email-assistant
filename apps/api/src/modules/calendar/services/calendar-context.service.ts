import { Injectable, Logger } from '@nestjs/common';

import { CalendarAccountService } from './calendar-account.service';
import { CalendarService } from './calendar.service';

const AVAILABILITY_LOOKUP_DAYS = 7;
// Rough weekday-hours baseline to weigh actual busy time against — not a
// real working-hours model, just enough to bucket into three coarse
// tiers. Precision doesn't matter here: the reply is never allowed to
// cite a number derived from this, only a qualitative tone.
const TYPICAL_AVAILABLE_HOURS = 8 * 5;

/**
 * Calendar Agent (v3.0 multi-agent orchestration §Option B, see
 * docs/multi-agent-orchestration-plan.md) — the first agent that changes
 * reply behavior based on real data instead of just contributing static
 * context (RAG, contact memory). Deliberately conservative per an explicit
 * product decision: contributes a coarse "generally available" / "quite
 * booked" signal to the reply prompt, never a specific date or time —
 * proposing an actual time slot without a human confirming it first stays
 * out of scope for the auto-reply path. Real time proposals still only
 * happen through the existing, human-reviewed MeetingSchedulingService
 * flow (suggestTime → human edits/confirms → schedule), which this does
 * not touch or replace.
 */
@Injectable()
export class CalendarContextService {
  private readonly logger = new Logger(CalendarContextService.name);

  constructor(
    private readonly calendarAccountService: CalendarAccountService,
    private readonly calendarService: CalendarService,
  ) {}

  /** Null when there's nothing useful to add — no calendar connected, or
   * a best-effort lookup failure. Never throws: a calendar hiccup must
   * never block reply generation. */
  async buildAvailabilityContext(userId: string): Promise<string | null> {
    try {
      const accounts = await this.calendarAccountService.listForUser(userId);
      const account = accounts.find((a) => a.isPrimary) ?? accounts[0];
      if (!account) {
        return null;
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

      const busyHours = busy.reduce(
        (sum, interval) =>
          sum +
          (new Date(interval.end).getTime() -
            new Date(interval.start).getTime()) /
            (60 * 60 * 1000),
        0,
      );

      const availability =
        busyHours < TYPICAL_AVAILABLE_HOURS * 0.4
          ? 'generally available this week'
          : busyHours < TYPICAL_AVAILABLE_HOURS * 0.75
            ? 'moderately busy this week, but has some open time'
            : 'quite booked this week';

      return (
        `This message includes a meeting or scheduling request. The recipient's calendar is ${availability}. ` +
        `When replying, acknowledge the request and let this general availability shape the tone — do NOT propose ` +
        `or commit to a specific date or time yourself; say you'll confirm a time shortly instead.`
      );
    } catch (error) {
      this.logger.warn(
        `Calendar Agent availability lookup failed for user ${userId}, continuing without it: ${String(error)}`,
      );
      return null;
    }
  }
}
