import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

import { CalendarAccountService } from './calendar-account.service';

export interface BusyInterval {
  start: string;
  end: string;
}

const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const GOOGLE_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface CreateEventInput {
  summary: string;
  description?: string;
  /** ISO 8601 datetime with timezone offset (e.g. from the AI meeting-time
   * suggestion) — passed straight through to Google's `dateTime` field, and
   * normalized to UTC for Microsoft's (which requires a separate `timeZone`
   * field rather than an embedded offset). */
  start: string;
  end: string;
  attendeeEmail?: string;
}

export interface CreatedEvent {
  id: string;
  htmlLink: string;
}

interface MicrosoftScheduleItem {
  status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

/** Graph's getSchedule returns naive local date-times paired with a
 * timeZone field rather than an embedded offset — since we always request
 * the schedule in UTC, appending 'Z' is safe and gives us a directly
 * comparable ISO string. */
function graphDateTimeToIso(dateTime: string): string {
  return dateTime.endsWith('Z') ? dateTime : `${dateTime}Z`;
}

/** The inverse: Graph's event start/end fields want a naive local
 * date-time with a separate timeZone field, not an embedded offset — so
 * any input offset is normalized to UTC first. */
function isoToGraphDateTime(iso: string): string {
  return new Date(iso).toISOString().replace('Z', '');
}

/**
 * Connect flow, read-only availability lookup, and event creation (the
 * write path) for both Google Calendar and Outlook Calendar. Creation only
 * ever happens on explicit user action — MeetingSchedulingController's
 * scheduleMeeting is called after the user reviews/edits an AI-suggested
 * time, never automatically — the same "human approval before sending"
 * principle already applied to AI-drafted email replies. See
 * docs/v1.2-plan.md's Calendar Integration section.
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
    ownerEmail: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    const accessToken =
      await this.calendarAccountService.getValidAccessToken(accountId);

    if (provider === 'MICROSOFT') {
      return this.getMicrosoftFreeBusy(accessToken, ownerEmail, timeMin, timeMax);
    }

    return this.getGoogleFreeBusy(accessToken, timeMin, timeMax);
  }

  async createEvent(
    accountId: string,
    provider: 'GOOGLE' | 'MICROSOFT',
    event: CreateEventInput,
  ): Promise<CreatedEvent> {
    const accessToken =
      await this.calendarAccountService.getValidAccessToken(accountId);

    if (provider === 'MICROSOFT') {
      return this.createMicrosoftEvent(accessToken, event);
    }

    return this.createGoogleEvent(accessToken, event);
  }

  private async getGoogleFreeBusy(
    accessToken: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
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

  private async getMicrosoftFreeBusy(
    accessToken: string,
    ownerEmail: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<BusyInterval[]> {
    const response = await fetch(
      `${MICROSOFT_GRAPH_BASE}/me/calendar/getSchedule`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schedules: [ownerEmail],
          startTime: { dateTime: timeMin.toISOString(), timeZone: 'UTC' },
          endTime: { dateTime: timeMax.toISOString(), timeZone: 'UTC' },
          availabilityViewInterval: 30,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(
        `Microsoft getSchedule lookup failed (${response.status}): ${text}`,
      );
      throw new BadGatewayException('Could not fetch calendar availability');
    }

    const json = (await response.json()) as {
      value: { scheduleItems?: MicrosoftScheduleItem[] }[];
    };

    const items = json.value[0]?.scheduleItems ?? [];

    return items
      .filter((item) => item.status !== 'free')
      .map((item) => ({
        start: graphDateTimeToIso(item.start.dateTime),
        end: graphDateTimeToIso(item.end.dateTime),
      }));
  }

  private async createGoogleEvent(
    accessToken: string,
    event: CreateEventInput,
  ): Promise<CreatedEvent> {
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

  private async createMicrosoftEvent(
    accessToken: string,
    event: CreateEventInput,
  ): Promise<CreatedEvent> {
    const body: Record<string, unknown> = {
      subject: event.summary,
      start: { dateTime: isoToGraphDateTime(event.start), timeZone: 'UTC' },
      end: { dateTime: isoToGraphDateTime(event.end), timeZone: 'UTC' },
    };
    if (event.description) {
      body.body = { contentType: 'HTML', content: event.description };
    }
    if (event.attendeeEmail) {
      body.attendees = [
        {
          emailAddress: { address: event.attendeeEmail },
          type: 'required',
        },
      ];
    }

    const response = await fetch(`${MICROSOFT_GRAPH_BASE}/me/events`, {
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
        `Microsoft calendar event creation failed (${response.status}): ${text}`,
      );
      throw new BadGatewayException('Could not create the calendar event');
    }

    const json = (await response.json()) as { id: string; webLink: string };
    return { id: json.id, htmlLink: json.webLink };
  }
}
