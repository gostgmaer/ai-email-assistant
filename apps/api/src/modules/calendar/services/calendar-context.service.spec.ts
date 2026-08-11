import { CalendarAccountService } from './calendar-account.service';
import { CalendarContextService } from './calendar-context.service';
import { CalendarService } from './calendar.service';

describe('CalendarContextService', () => {
  const userId = 'user-1';

  function buildService(
    accounts: {
      id: string;
      isPrimary: boolean;
      provider: 'GOOGLE' | 'MICROSOFT';
      email: string;
    }[],
    busy: { start: string; end: string }[] = [],
    getFreeBusyImpl?: () => Promise<{ start: string; end: string }[]>,
  ) {
    const calendarAccountService = {
      listForUser: jest.fn().mockResolvedValue(accounts),
    } as unknown as jest.Mocked<CalendarAccountService>;

    const calendarService = {
      getFreeBusy: getFreeBusyImpl
        ? jest.fn().mockImplementation(getFreeBusyImpl)
        : jest.fn().mockResolvedValue(busy),
    } as unknown as jest.Mocked<CalendarService>;

    return new CalendarContextService(calendarAccountService, calendarService);
  }

  it('returns null when the user has no connected calendar', async () => {
    const service = buildService([]);

    const context = await service.buildAvailabilityContext(userId);

    expect(context).toBeNull();
  });

  it('never includes a specific date or time, only a qualitative availability signal', async () => {
    const service = buildService(
      [
        {
          id: 'cal-1',
          isPrimary: true,
          provider: 'GOOGLE',
          email: 'me@example.com',
        },
      ],
      [{ start: '2026-08-11T14:00:00Z', end: '2026-08-11T14:30:00Z' }],
    );

    const context = await service.buildAvailabilityContext(userId);

    expect(context).not.toBeNull();
    expect(context).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(context).toMatch(
      /do NOT propose or commit to a specific date or time/i,
    );
  });

  it('reports "generally available" when the week is mostly free', async () => {
    const service = buildService(
      [
        {
          id: 'cal-1',
          isPrimary: true,
          provider: 'GOOGLE',
          email: 'me@example.com',
        },
      ],
      [{ start: '2026-08-11T14:00:00Z', end: '2026-08-11T15:00:00Z' }],
    );

    const context = await service.buildAvailabilityContext(userId);

    expect(context).toMatch(/generally available/);
  });

  it('reports "quite booked" when busy hours dominate the week', async () => {
    const denseBusy = Array.from({ length: 6 }, (_, day) => ({
      start: `2026-08-1${day + 1}T09:00:00Z`,
      end: `2026-08-1${day + 1}T17:00:00Z`,
    }));
    const service = buildService(
      [
        {
          id: 'cal-1',
          isPrimary: true,
          provider: 'GOOGLE',
          email: 'me@example.com',
        },
      ],
      denseBusy,
    );

    const context = await service.buildAvailabilityContext(userId);

    expect(context).toMatch(/quite booked/);
  });

  it('prefers the primary calendar account when multiple are connected', async () => {
    const calendarAccountService = {
      listForUser: jest.fn().mockResolvedValue([
        {
          id: 'cal-1',
          isPrimary: false,
          provider: 'GOOGLE',
          email: 'secondary@example.com',
        },
        {
          id: 'cal-2',
          isPrimary: true,
          provider: 'MICROSOFT',
          email: 'primary@example.com',
        },
      ]),
    } as unknown as jest.Mocked<CalendarAccountService>;
    const calendarService = {
      getFreeBusy: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CalendarService>;

    const service = new CalendarContextService(
      calendarAccountService,
      calendarService,
    );
    await service.buildAvailabilityContext(userId);

    /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
    expect(calendarService.getFreeBusy).toHaveBeenCalledWith(
      'cal-2',
      'MICROSOFT',
      'primary@example.com',
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('returns null (never throws) when the freebusy lookup fails', async () => {
    const service = buildService(
      [
        {
          id: 'cal-1',
          isPrimary: true,
          provider: 'GOOGLE',
          email: 'me@example.com',
        },
      ],
      undefined,
      () => Promise.reject(new Error('provider down')),
    );

    await expect(service.buildAvailabilityContext(userId)).resolves.toBeNull();
  });
});
