import {
  isValidTimeZone,
  isWithinBusinessHours,
  localDayAndMinutes,
  quietHoursEnd,
} from './local-time.util';

describe('local-time.util', () => {
  // Tuesday 2026-10-20 21:30 UTC = 23:30 in Berlin (CEST, UTC+2).
  const at = new Date('2026-10-20T21:30:00Z');

  it('reads the local weekday and time in a zone', () => {
    expect(localDayAndMinutes(at, 'UTC')).toEqual({
      day: 2,
      minutes: 21 * 60 + 30,
    });
    expect(localDayAndMinutes(at, 'Europe/Berlin')).toEqual({
      day: 2,
      minutes: 23 * 60 + 30,
    });
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(localDayAndMinutes(at, 'Mars/Base').minutes).toBe(21 * 60 + 30);
  });

  it('checks business hours on business days', () => {
    const hours = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };

    expect(
      isWithinBusinessHours(new Date('2026-10-20T10:00:00Z'), 'UTC', hours),
    ).toBe(true);
    expect(isWithinBusinessHours(at, 'UTC', hours)).toBe(false);
    // Saturday
    expect(
      isWithinBusinessHours(new Date('2026-10-24T10:00:00Z'), 'UTC', hours),
    ).toBe(false);
  });

  describe('quietHoursEnd', () => {
    const quiet = { start: '22:00', end: '07:00' };

    it('returns the end of a window that wraps midnight', () => {
      // 23:30 Berlin is inside 22:00-07:00; it ends at 07:00 Berlin = 05:00Z.
      expect(quietHoursEnd(at, 'Europe/Berlin', quiet)).toEqual(
        new Date('2026-10-21T05:00:00Z'),
      );
    });

    it('returns null outside the window, or with no quiet hours set', () => {
      expect(quietHoursEnd(at, 'UTC', quiet)).toBeNull();
      expect(
        quietHoursEnd(at, 'Europe/Berlin', { start: null, end: null }),
      ).toBeNull();
    });
  });
});
