/**
 * Wall-clock helpers for per-user time windows (business hours, quiet
 * hours), using the runtime's IANA zone data through Intl — no date
 * library. Times are "HH:MM" strings in the user's zone.
 */

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: string): boolean {
  return HH_MM.test(value);
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Day of week (0 = Sunday) and minutes since local midnight of `at` in
 * `zone`. An unknown zone falls back to UTC. */
export function localDayAndMinutes(
  at: Date,
  zone: string,
): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimeZone(zone) ? zone : 'UTC',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    get('weekday') ?? 'Sun',
  );
  return {
    day,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Whether `minutes` falls in [start, end). A window whose end is before its
 * start wraps midnight (22:00-07:00). start === end is an empty window. */
function inWindow(minutes: number, start: number, end: number): boolean {
  return start <= end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

export function isWithinBusinessHours(
  at: Date,
  zone: string,
  hours: { start: string; end: string; days: number[] },
): boolean {
  if (!isValidTimeOfDay(hours.start) || !isValidTimeOfDay(hours.end)) {
    return false;
  }
  const { day, minutes } = localDayAndMinutes(at, zone);
  return (
    hours.days.includes(day) &&
    inWindow(minutes, toMinutes(hours.start), toMinutes(hours.end))
  );
}

/**
 * If `at` falls inside the quiet-hours window, the moment that window ends;
 * otherwise null. Computed as "minutes until the end time" on the local
 * clock, so on a DST-change night the result can be off by the shift.
 */
export function quietHoursEnd(
  at: Date,
  zone: string,
  quiet: { start: string | null; end: string | null },
): Date | null {
  if (
    !quiet.start ||
    !quiet.end ||
    !isValidTimeOfDay(quiet.start) ||
    !isValidTimeOfDay(quiet.end)
  ) {
    return null;
  }

  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  const { minutes } = localDayAndMinutes(at, zone);
  if (!inWindow(minutes, start, end)) {
    return null;
  }

  const minutesLeft = (end - minutes + 24 * 60) % (24 * 60);
  const result = new Date(at.getTime() + minutesLeft * 60_000);
  // Land on the minute itself, not partway through it.
  result.setUTCSeconds(0, 0);
  return result;
}
