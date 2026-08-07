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

/**
 * Phase 1 of Calendar Integration (see docs/v1.2-plan.md): connect flow +
 * read-only availability lookup. Meeting creation (the write path — needs
 * the same "human approval before sending" care already applied to AI
 * email replies) and the AI meeting-suggestions capability are Phase 2/3,
 * intentionally not built yet.
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
}
