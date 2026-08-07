import {
  BadGatewayException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';

import { CalendarAccountService } from './calendar-account.service';

export interface BusyInterval {
  start: string;
  end: string;
}

const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const GOOGLE_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CreateEventInput {
  summary: string;
  description?: string;
  /** ISO 8601 datetime with timezone offset (e.g. from the AI meeting-time
   * suggestion) — passed straight through to Google's `dateTime` field. */
  start: string;
  end: string;
  attendeeEmail?: string;
}

export interface CreatedEvent {
  id: string;
  htmlLink: string;
}

/**
 * Connect flow, read-only availability lookup, and event creation (the
 * write path). Creation only ever happens on explicit user action —
 * MeetingSchedulingController.scheduleMeeting is called after the user
 * reviews/edits an AI-suggested time, never automatically — the same
 * "human approval before sending" principle already applied to AI-drafted
 * email replies. See docs/v1.2-plan.md's Calendar Integration section.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly calendarAccountService: CalendarAccountService,
  ) {}

  async getFreeBusy(
    accountId: string,
    provider: 'GOOGLE' | 'MICROSOFT',
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    if (provider === 'MICROSOFT') {
      // Microsoft Graph's equivalent (getSchedule) isn't implemented yet —
      // only Google Calendar's freebusy API is wired up in this phase.
      throw new NotImplementedException(
        'Availability lookup is not yet implemented for Outlook calendars',
      );
    }

    const accessToken =
      await this.calendarAccountService.getValidAccessToken(accountId);

    const response = await fetch(GOOGLE_FREEBUSY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(
        `Google freebusy lookup failed (${response.status}): ${text}`,
      );
      throw new BadGatewayException('Could not fetch calendar availability');
    }

    const json = (await response.json()) as {
      calendars: Record<string, { busy: BusyInterval[] }>;
    };

    return json.calendars.primary?.busy ?? [];
  }

  async createEvent(
    accountId: string,
    provider: 'GOOGLE' | 'MICROSOFT',
    event: CreateEventInput,
  ): Promise<CreatedEvent> {
    if (provider === 'MICROSOFT') {
      // Microsoft Graph's equivalent isn't implemented yet — only Google
      // Calendar's events API is wired up in this phase.
      throw new NotImplementedException(
        'Creating events is not yet implemented for Outlook calendars',
      );
    }

    const accessToken =
      await this.calendarAccountService.getValidAccessToken(accountId);

    const body: Record<string, unknown> = {
      summary: event.summary,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
    };
    if (event.description) {
      body.description = event.description;
    }
    if (event.attendeeEmail) {
      body.attendees = [{ email: event.attendeeEmail }];
    }

    const response = await fetch(GOOGLE_EVENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(
        `Google calendar event creation failed (${response.status}): ${text}`,
      );
      throw new BadGatewayException('Could not create the calendar event');
    }

    const json = (await response.json()) as { id: string; htmlLink: string };
    return { id: json.id, htmlLink: json.htmlLink };
  }
}
