import {
  localDateTime,
  zonedTimeToUtc,
} from '../../../common/utils/local-time.util';

export interface Slot {
  start: string;
  end: string;
}

export interface SlotPreferences {
  durationMinutes: number;
  earliestDate: string | null;
  latestDate: string | null;
  partOfDay: 'morning' | 'afternoon' | 'any';
  preferredTime: string | null;
}

export const SLOT_LOOKAHEAD_DAYS = 14;
const SLOT_COUNT = 3;
// Soonest bookable time: nobody can act on an offer for ten minutes from now.
const MIN_NOTICE_MS = 60 * 60 * 1000;
const STEP_MINUTES = 30;
// Two offers on one day are only useful when they're far enough apart.
const SAME_DAY_GAP_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const HOURS: Record<SlotPreferences['partOfDay'], [number, number]> = {
  morning: [9, 12],
  afternoon: [12, 17],
  any: [9, 17],
};

/**
 * Free slots to offer, from the real calendar. The AI only reads what the
 * request asks for: the times themselves are computed here, so one can't
 * land on a busy interval. Offers one per day first, then a second on the
 * same day; if the request's window has fewer than two, the rest of the
 * next two weeks' working hours is used instead.
 */
export function findFreeSlots(
  preferences: SlotPreferences,
  busy: { start: string; end: string }[],
  now: Date,
  zone: string,
): Slot[] {
  const today = localDateTime(now, zone).date;
  const lastDay = addDays(today, SLOT_LOOKAHEAD_DAYS);
  const busyMs = busy.map((interval) => ({
    start: new Date(interval.start).getTime(),
    end: new Date(interval.end).getTime(),
  }));

  const search = (
    from: string,
    to: string,
    part: SlotPreferences['partOfDay'],
    preferredTime: string | null,
    allowWeekend: boolean,
  ): Slot[] => {
    const candidates: { day: string; start: number }[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!allowWeekend && isWeekend(day)) continue;
      const times = dayTimes(part, preferences.durationMinutes);
      // The time they named goes first, whatever part of the day it's in.
      if (preferredTime) times.unshift(preferredTime);
      for (const time of times) {
        const start = zonedTimeToUtc(day, time, zone).getTime();
        const end = start + preferences.durationMinutes * 60 * 1000;
        const free = busyMs.every(
          (interval) => end <= interval.start || start >= interval.end,
        );
        if (free && start >= now.getTime() + MIN_NOTICE_MS) {
          candidates.push({ day, start });
        }
      }
    }
    return pickSpread(candidates).map(({ start }) => ({
      start: new Date(start).toISOString(),
      end: new Date(
        start + preferences.durationMinutes * 60 * 1000,
      ).toISOString(),
    }));
  };

  const from = clampDay(preferences.earliestDate ?? today, today, lastDay);
  const to = clampDay(preferences.latestDate ?? lastDay, from, lastDay);
  // A weekend is only offered when the request asks for that very day.
  const exactDay = Boolean(preferences.earliestDate) && from === to;
  const slots = search(
    from,
    to,
    preferences.partOfDay,
    preferences.preferredTime,
    exactDay,
  );
  if (slots.length >= 2) {
    return slots;
  }

  const wider = search(today, lastDay, 'any', null, false);
  const taken = new Set(slots.map((slot) => slot.start));
  return [...slots, ...wider.filter((slot) => !taken.has(slot.start))]
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, SLOT_COUNT);
}

/** Every start time in that part of the day long enough for the meeting. */
function dayTimes(
  part: SlotPreferences['partOfDay'],
  durationMinutes: number,
): string[] {
  const [startHour, endHour] = HOURS[part];
  const times: string[] = [];
  for (
    let minutes = startHour * 60;
    minutes + durationMinutes <= endHour * 60;
    minutes += STEP_MINUTES
  ) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    times.push(`${hour}:${minute}`);
  }
  return times;
}

function pickSpread(
  candidates: { day: string; start: number }[],
): { day: string; start: number }[] {
  const picked: { day: string; start: number }[] = [];
  const days = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length < SLOT_COUNT && !days.has(candidate.day)) {
      days.add(candidate.day);
      picked.push(candidate);
    }
  }
  for (const candidate of candidates) {
    if (
      picked.length < SLOT_COUNT &&
      picked.every(
        (other) => Math.abs(other.start - candidate.start) >= SAME_DAY_GAP_MS,
      )
    ) {
      picked.push(candidate);
    }
  }
  return picked.sort((a, b) => a.start - b.start);
}

function addDays(day: string, count: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function clampDay(day: string, min: string, max: string): string {
  return day < min ? min : day > max ? max : day;
}

function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** "Tuesday, Nov 3, 3:00 PM IST", and the other person's clock when known. */
export function describeSlot(
  slot: Slot,
  zone: string,
  otherZone?: string | null,
): string {
  const start = new Date(slot.start);
  const own = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(start);
  if (!otherZone || otherZone === zone) {
    return own;
  }
  const other = new Intl.DateTimeFormat('en-US', {
    timeZone: otherZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(start);
  return `${own} (${other})`;
}

/** The paragraph "Propose times" writes into the reply box. */
export function proposalText(lines: string[]): string {
  return [
    'Here are a few times that work for me:',
    '',
    ...lines.map((line) => `- ${line}`),
    '',
    'Let me know which suits you best.',
  ].join('\n');
}
