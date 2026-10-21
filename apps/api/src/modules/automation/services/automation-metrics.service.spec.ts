import { computeMetrics } from './automation-metrics.service';
import { normalizedEditDistance } from '../../email/utils/edit-distance.util';

describe('computeMetrics', () => {
  const row = (
    outcome: 'SENT' | 'DISCARDED' | 'AUTO_SENT',
    extra: {
      edited?: boolean;
      editDistance?: number;
      timeToSendMs?: number;
    } = {},
  ) => ({
    agentId: null,
    outcome,
    edited: extra.edited ?? null,
    editDistance: extra.editDistance ?? null,
    timeToSendMs: extra.timeToSendMs ?? null,
  });

  it('computes acceptance, edit and rejection rates over reviewed drafts', () => {
    const metrics = computeMetrics([
      row('SENT', { edited: false, editDistance: 0, timeToSendMs: 1000 }),
      row('SENT', { edited: true, editDistance: 0.2, timeToSendMs: 3000 }),
      row('SENT', { edited: true, editDistance: 0.4, timeToSendMs: 2000 }),
      row('DISCARDED'),
      row('AUTO_SENT'),
    ]);

    expect(metrics).toEqual({
      reviewed: 4,
      sent: 3,
      discarded: 1,
      autoSent: 1,
      acceptanceRate: 0.25,
      editRate: 0.667,
      averageEditDistance: 0.2,
      medianTimeToSendMs: 2000,
      rejectionRate: 0.25,
    });
  });

  it('reports no rates rather than zero when nothing was reviewed', () => {
    expect(computeMetrics([row('AUTO_SENT')])).toMatchObject({
      reviewed: 0,
      acceptanceRate: null,
      rejectionRate: null,
      medianTimeToSendMs: null,
    });
  });
});

describe('normalizedEditDistance', () => {
  it('is 0 for the same text (ignoring whitespace) and 1 for nothing in common', () => {
    expect(normalizedEditDistance('Hi  there\n', 'Hi there')).toBe(0);
    expect(normalizedEditDistance('abc', 'xyz')).toBe(1);
    expect(normalizedEditDistance('kitten', 'sitting')).toBe(0.429);
  });
});
