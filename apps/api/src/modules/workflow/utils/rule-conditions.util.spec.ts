import { BadRequestException } from '@nestjs/common';

import { WorkflowConditionGroup } from '../types/workflow-rule.types';
import {
  RuleMessageContext,
  evaluateConditions,
  normalizeConditions,
  referencesField,
  validateConditions,
} from './rule-conditions.util';

const context = (
  overrides: Partial<RuleMessageContext> = {},
): RuleMessageContext => ({
  category: 'Billing',
  priority: 'High',
  sentiment: 'Negative',
  language: 'en',
  sender: 'jo@vip.example.com',
  to: ['support@company.com', 'billing@company.com'],
  cc: [],
  subject: 'Invoice #4411 overdue',
  body: 'Please resend the invoice.',
  containsPii: false,
  hasAttachment: false,
  isFirstMessage: true,
  isKnownContact: true,
  withinBusinessHours: false,
  ...overrides,
});

const matches = (
  conditions: WorkflowConditionGroup,
  overrides: Partial<RuleMessageContext> = {},
) => evaluateConditions(conditions, context(overrides));

describe('evaluateConditions', () => {
  it.each([
    ['equals', 'category', 'billing', true],
    ['notEquals', 'category', 'billing', false],
    ['contains', 'subject', 'OVERDUE', true],
    ['notContains', 'body', 'refund', true],
    ['startsWith', 'subject', 'invoice', true],
    ['endsWith', 'sender', '@vip.example.com', true],
    ['equals', 'senderDomain', 'vip.example.com', true],
    ['in', 'priority', ['urgent', 'high'], true],
    ['notIn', 'priority', ['urgent', 'high'], false],
    ['regex', 'subject', '#\\d{4}\\b', true],
    ['regex', 'subject', '^re:', false],
  ] as const)('%s on %s', (op, field, value, expected) => {
    expect(
      matches({
        all: [{ field, op, value: value as string | string[] }],
      }),
    ).toBe(expected);
  });

  it('matches a list field when any address matches, and negates over all of them', () => {
    expect(
      matches({
        all: [{ field: 'to', op: 'equals', value: 'billing@company.com' }],
      }),
    ).toBe(true);
    expect(
      matches({
        all: [{ field: 'to', op: 'notContains', value: '@company.com' }],
      }),
    ).toBe(false);
    expect(
      matches({
        all: [{ field: 'cc', op: 'notContains', value: '@company.com' }],
      }),
    ).toBe(true);
  });

  it('compares yes/no fields with equals and notEquals', () => {
    expect(
      matches({
        all: [{ field: 'isKnownContact', op: 'equals', value: true }],
      }),
    ).toBe(true);
    expect(
      matches({
        all: [{ field: 'withinBusinessHours', op: 'notEquals', value: false }],
      }),
    ).toBe(false);
  });

  it('combines all / any / not groups', () => {
    const vipOrUrgentOutsideHours: WorkflowConditionGroup = {
      all: [
        {
          any: [
            { field: 'senderDomain', op: 'equals', value: 'vip.example.com' },
            { field: 'priority', op: 'equals', value: 'Urgent' },
          ],
        },
        { not: { field: 'withinBusinessHours', op: 'equals', value: true } },
      ],
    };

    expect(matches(vipOrUrgentOutsideHours)).toBe(true);
    expect(
      matches(vipOrUrgentOutsideHours, { withinBusinessHours: true }),
    ).toBe(false);
    expect(
      matches(vipOrUrgentOutsideHours, {
        sender: 'someone@else.com',
        priority: 'Normal',
      }),
    ).toBe(false);
  });

  it('matches everything only with matchAll', () => {
    expect(matches({ all: [], matchAll: true })).toBe(true);
    expect(matches({ matchAll: true } as WorkflowConditionGroup)).toBe(true);
  });

  it('gives up on a catastrophically backtracking regex instead of hanging', () => {
    const started = Date.now();

    const result = matches(
      { all: [{ field: 'body', op: 'regex', value: '^(a+)+$' }] },
      { body: `${'a'.repeat(40)}!` },
    );

    expect(result).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('validateConditions', () => {
  const invalid = (conditions: unknown) =>
    expect(() => validateConditions(conditions)).toThrow(BadRequestException);

  it('accepts a valid nested rule', () => {
    expect(() =>
      validateConditions({
        any: [
          { field: 'subject', op: 'contains', value: 'invoice' },
          { not: { field: 'isFirstMessage', op: 'equals', value: true } },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects an empty rule unless it says matchAll', () => {
    invalid({ all: [] });
    expect(() => validateConditions({ all: [], matchAll: true })).not.toThrow();
  });

  it('rejects matchAll combined with conditions', () => {
    invalid({
      all: [{ field: 'category', op: 'equals', value: 'x' }],
      matchAll: true,
    });
  });

  it.each([
    ['a v1 list', [{ field: 'category', operator: 'equals', value: 'x' }]],
    ['two group keys', { all: [], any: [] }],
    ['an empty nested group', { all: [{ any: [] }] }],
    [
      'an unknown field',
      { all: [{ field: 'nope', op: 'equals', value: 'x' }] },
    ],
    ['an unknown op', { all: [{ field: 'subject', op: 'like', value: 'x' }] }],
    [
      'an empty value',
      { all: [{ field: 'subject', op: 'equals', value: ' ' }] },
    ],
    [
      'a string for in',
      { all: [{ field: 'priority', op: 'in', value: 'High' }] },
    ],
    [
      'a boolean op on text',
      { all: [{ field: 'containsPii', op: 'contains', value: true }] },
    ],
    [
      'a string for a boolean field',
      { all: [{ field: 'containsPii', op: 'equals', value: 'yes' }] },
    ],
    [
      'a broken regex',
      { all: [{ field: 'subject', op: 'regex', value: '(' }] },
    ],
    [
      'an over-long regex',
      { all: [{ field: 'subject', op: 'regex', value: 'a'.repeat(201) }] },
    ],
  ])('rejects %s', (_label, conditions) => invalid(conditions));

  it('rejects nesting deeper than 5', () => {
    let node: unknown = { field: 'subject', op: 'equals', value: 'x' };
    for (let i = 0; i < 5; i++) node = { all: [node] };
    invalid(node);
  });
});

describe('normalizeConditions', () => {
  it('converts a v1 list into an all group', () => {
    expect(
      normalizeConditions([
        { field: 'sender', operator: 'contains', value: '@acme.com' },
      ]),
    ).toEqual({
      all: [{ field: 'sender', op: 'contains', value: '@acme.com' }],
    });
  });

  it('turns the v1 empty list (it matched everything) into matchAll', () => {
    expect(normalizeConditions([])).toEqual({ all: [], matchAll: true });
  });
});

describe('referencesField', () => {
  it('finds a field anywhere in the tree', () => {
    const conditions: WorkflowConditionGroup = {
      all: [
        { field: 'subject', op: 'contains', value: 'x' },
        {
          not: {
            any: [{ field: 'isKnownContact', op: 'equals', value: true }],
          },
        },
      ],
    };

    expect(referencesField(conditions, 'isKnownContact')).toBe(true);
    expect(referencesField(conditions, 'body')).toBe(false);
    expect(referencesField({ all: [], matchAll: true }, 'body')).toBe(false);
  });
});
