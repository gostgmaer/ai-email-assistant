import {
  describeSlot,
  findFreeSlots,
  proposalText,
  SlotPreferences,
} from './meeting-slots.util';

// Monday 2 November 2026, 09:00 in Kolkata (03:30 UTC).
const NOW = new Date('2026-11-02T03:30:00Z');
const ZONE = 'Asia/Kolkata';

const ANY: SlotPreferences = {
  durationMinutes: 30,
  earliestDate: null,
  latestDate: null,
  partOfDay: 'any',
  preferredTime: null,
};

const local = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

describe('findFreeSlots', () => {
  it('offers three slots on different weekdays, with notice', () => {
    const slots = findFreeSlots(ANY, [], NOW, ZONE);

    expect(slots.map((slot) => local(slot.start))).toEqual([
      'Mon 10:00',
      'Tue 09:00',
      'Wed 09:00',
    ]);
    expect(new Date(slots[0].end).getTime()).toBe(
      new Date(slots[0].start).getTime() + 30 * 60 * 1000,
    );
  });

  it('never offers a time overlapping a busy interval', () => {
    const busy = [
      // Tuesday 09:00–12:00 local.
      { start: '2026-11-03T03:30:00Z', end: '2026-11-03T06:30:00Z' },
    ];

    const slots = findFreeSlots(ANY, busy, NOW, ZONE);

    expect(slots.map((slot) => local(slot.start))).toContain('Tue 12:00');
    for (const slot of slots) {
      expect(
        new Date(slot.end) <= new Date(busy[0].start) ||
          new Date(slot.start) >= new Date(busy[0].end),
      ).toBe(true);
    }
  });

  it('skips the weekend unless that exact day was asked for', () => {
    const friday = {
      ...ANY,
      earliestDate: '2026-11-06',
      latestDate: '2026-11-09',
    };
    const days = findFreeSlots(friday, [], NOW, ZONE).map((slot) =>
      local(slot.start).slice(0, 3),
    );
    expect(days).toEqual(['Fri', 'Fri', 'Mon']);

    const saturday = {
      ...ANY,
      earliestDate: '2026-11-07',
      latestDate: '2026-11-07',
    };
    expect(local(findFreeSlots(saturday, [], NOW, ZONE)[0].start)).toBe(
      'Sat 09:00',
    );
  });

  it('keeps to the requested day and part of the day, spaced out', () => {
    const slots = findFreeSlots(
      {
        ...ANY,
        earliestDate: '2026-11-03',
        latestDate: '2026-11-03',
        partOfDay: 'afternoon',
      },
      [],
      NOW,
      ZONE,
    );

    expect(slots.map((slot) => local(slot.start))).toEqual([
      'Tue 12:00',
      'Tue 14:00',
      'Tue 16:00',
    ]);
  });

  it('puts the named time first when it is free', () => {
    const slots = findFreeSlots(
      {
        ...ANY,
        earliestDate: '2026-11-03',
        latestDate: '2026-11-03',
        preferredTime: '15:00',
      },
      [],
      NOW,
      ZONE,
    );

    expect(slots.map((slot) => local(slot.start))).toContain('Tue 15:00');
  });

  it('looks wider when the requested window is full', () => {
    const slots = findFreeSlots(
      { ...ANY, earliestDate: '2026-11-03', latestDate: '2026-11-03' },
      // All of Tuesday.
      [{ start: '2026-11-02T18:30:00Z', end: '2026-11-03T18:30:00Z' }],
      NOW,
      ZONE,
    );

    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots.map((slot) => local(slot.start))).not.toContainEqual(
      expect.stringMatching(/^Tue/),
    );
  });

  it('returns nothing when the whole two weeks are busy', () => {
    const slots = findFreeSlots(
      ANY,
      [{ start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z' }],
      NOW,
      ZONE,
    );

    expect(slots).toEqual([]);
  });
});

describe('describeSlot', () => {
  const slot = { start: '2026-11-03T09:30:00Z', end: '2026-11-03T10:00:00Z' };

  it('states the time zone', () => {
    expect(describeSlot(slot, 'UTC')).toBe('Tuesday, Nov 3, 9:30 AM UTC');
  });

  it("adds the other person's clock when it's known", () => {
    expect(describeSlot(slot, 'UTC', 'America/New_York')).toBe(
      'Tuesday, Nov 3, 9:30 AM UTC (Tue, 4:30 AM EST)',
    );
  });
});

describe('proposalText', () => {
  it('lists every time', () => {
    const text = proposalText(['one', 'two']);

    expect(text).toContain('- one\n- two');
  });
});
