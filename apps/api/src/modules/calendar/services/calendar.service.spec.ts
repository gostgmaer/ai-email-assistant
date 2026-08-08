import { BadGatewayException } from '@nestjs/common';

import { CalendarAccountService } from './calendar-account.service';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  function buildService(accessToken = 'fake-access-token') {
    const calendarAccountService = {
      getValidAccessToken: jest.fn().mockResolvedValue(accessToken),
    } as unknown as CalendarAccountService;

    return new CalendarService(calendarAccountService);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getFreeBusy', () => {
    it('reads Google busy intervals off calendars.primary.busy', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            calendars: {
              primary: {
                busy: [{ start: '2026-08-09T14:00:00Z', end: '2026-08-09T14:30:00Z' }],
              },
            },
          }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = buildService();

      const busy = await service.getFreeBusy(
        'account-1',
        'GOOGLE',
        'me@example.com',
        new Date('2026-08-09T00:00:00Z'),
        new Date('2026-08-10T00:00:00Z'),
      );

      expect(busy).toEqual([
        { start: '2026-08-09T14:00:00Z', end: '2026-08-09T14:30:00Z' },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('filters Microsoft getSchedule items down to non-free intervals and normalizes to ISO with Z', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: [
              {
                scheduleItems: [
                  {
                    status: 'busy',
                    start: { dateTime: '2026-08-09T14:00:00.0000000', timeZone: 'UTC' },
                    end: { dateTime: '2026-08-09T14:30:00.0000000', timeZone: 'UTC' },
                  },
                  {
                    status: 'free',
                    start: { dateTime: '2026-08-09T15:00:00.0000000', timeZone: 'UTC' },
                    end: { dateTime: '2026-08-09T15:30:00.0000000', timeZone: 'UTC' },
                  },
                  {
                    status: 'tentative',
                    start: { dateTime: '2026-08-09T16:00:00.0000000', timeZone: 'UTC' },
                    end: { dateTime: '2026-08-09T16:30:00.0000000', timeZone: 'UTC' },
                  },
                ],
              },
            ],
          }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = buildService();

      const busy = await service.getFreeBusy(
        'account-1',
        'MICROSOFT',
        'me@example.com',
        new Date('2026-08-09T00:00:00Z'),
        new Date('2026-08-10T00:00:00Z'),
      );

      expect(busy).toEqual([
        {
          start: '2026-08-09T14:00:00.0000000Z',
          end: '2026-08-09T14:30:00.0000000Z',
        },
        {
          start: '2026-08-09T16:00:00.0000000Z',
          end: '2026-08-09T16:30:00.0000000Z',
        },
      ]);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { schedules: string[] };
      expect(body.schedules).toEqual(['me@example.com']);
    });

    it('throws BadGatewayException when the provider call fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      }) as unknown as typeof fetch;

      const service = buildService();

      await expect(
        service.getFreeBusy(
          'account-1',
          'GOOGLE',
          'me@example.com',
          new Date(),
          new Date(),
        ),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('createEvent', () => {
    it('sends Google event.start/end as embedded-offset dateTime strings unchanged', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'evt-1', htmlLink: 'https://calendar.google.com/x' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = buildService();

      const result = await service.createEvent('account-1', 'GOOGLE', {
        summary: 'Sync',
        start: '2026-08-09T19:30:00+05:30',
        end: '2026-08-09T20:00:00+05:30',
        attendeeEmail: 'them@example.com',
      });

      expect(result).toEqual({ id: 'evt-1', htmlLink: 'https://calendar.google.com/x' });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        start: { dateTime: string };
        end: { dateTime: string };
        attendees: { email: string }[];
      };
      expect(body.start.dateTime).toBe('2026-08-09T19:30:00+05:30');
      expect(body.attendees).toEqual([{ email: 'them@example.com' }]);
      // Regression: without sendUpdates=all, Google silently never emails
      // the attendee an invite at all.
      expect(url).toContain('sendUpdates=all');
    });

    it('does not ask Google to send updates when there is no attendee', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'evt-1', htmlLink: 'https://calendar.google.com/x' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = buildService();

      await service.createEvent('account-1', 'GOOGLE', {
        summary: 'Focus block',
        start: '2026-08-09T19:30:00+05:30',
        end: '2026-08-09T20:00:00+05:30',
      });

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('sendUpdates=none');
    });

    it('normalizes Microsoft event.start/end to UTC with a separate timeZone field, and maps webLink to htmlLink', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'evt-2', webLink: 'https://outlook.office.com/x' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = buildService();

      const result = await service.createEvent('account-1', 'MICROSOFT', {
        summary: 'Sync',
        // +05:30 -> 14:00Z
        start: '2026-08-09T19:30:00+05:30',
        end: '2026-08-09T20:00:00+05:30',
        attendeeEmail: 'them@example.com',
      });

      expect(result).toEqual({ id: 'evt-2', htmlLink: 'https://outlook.office.com/x' });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');

      const body = JSON.parse(init.body as string) as {
        start: { dateTime: string; timeZone: string };
        attendees: { emailAddress: { address: string }; type: string }[];
      };
      expect(body.start).toEqual({
        dateTime: '2026-08-09T14:00:00.000',
        timeZone: 'UTC',
      });
      expect(body.attendees).toEqual([
        { emailAddress: { address: 'them@example.com' }, type: 'required' },
      ]);
    });
  });
});
