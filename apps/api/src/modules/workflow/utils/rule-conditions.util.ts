import { BadRequestException } from '@nestjs/common';
import { Script, createContext } from 'vm';

import {
  LegacyWorkflowCondition,
  WorkflowBooleanField,
  WorkflowCondition,
  WorkflowConditionField,
  WorkflowConditionGroup,
  WorkflowConditionNode,
  WorkflowConditionOperator,
  WorkflowTextField,
} from '../types/workflow-rule.types';

/** Everything a rule condition can test, for one message. Built by
 * buildRuleMessageContext (rule-context.util.ts) for both live evaluation
 * and dry-runs. Text values are matched case-insensitively. */
export interface RuleMessageContext {
  category: string;
  priority: string;
  sentiment: string;
  language: string;
  sender: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  containsPii: boolean;
  hasAttachment: boolean;
  isFirstMessage: boolean;
  isKnownContact: boolean;
  withinBusinessHours: boolean;
}

const TEXT_FIELDS: WorkflowTextField[] = [
  'category',
  'priority',
  'sentiment',
  'language',
  'sender',
  'senderDomain',
  'to',
  'cc',
  'subject',
  'body',
];
const BOOLEAN_FIELDS: WorkflowBooleanField[] = [
  'containsPii',
  'hasAttachment',
  'isFirstMessage',
  'isKnownContact',
  'withinBusinessHours',
];
const TEXT_OPERATORS: WorkflowConditionOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'in',
  'notIn',
  'regex',
];
const NEGATIVE_OPERATORS = new Set<WorkflowConditionOperator>([
  'notEquals',
  'notContains',
  'notIn',
]);

const MAX_DEPTH = 5;
const MAX_CONDITIONS = 50;
const MAX_VALUE_LENGTH = 500;
const MAX_LIST_ITEMS = 100;
const MAX_REGEX_LENGTH = 200;
// The body can be long; a regex only ever sees this much of any value.
const MAX_REGEX_INPUT = 10_000;
// A pathological pattern (catastrophic backtracking) is cut off after this
// long and treated as "no match" — see testRegex.
const REGEX_TIMEOUT_MS = 25;

/**
 * Converts whatever is stored in WorkflowRule.conditions into the v2 group
 * shape. v1 rules were a flat AND list ([] meant "match everything"); the
 * phase 5 migration converts stored rows, this covers anything that slipped
 * past it (and v1-shaped API input).
 */
export function normalizeConditions(stored: unknown): WorkflowConditionGroup {
  if (Array.isArray(stored)) {
    const legacy = stored as LegacyWorkflowCondition[];
    if (legacy.length === 0) {
      return { all: [], matchAll: true };
    }
    return {
      all: legacy.map((condition) => ({
        field: condition.field,
        op: condition.operator,
        value: condition.value,
      })),
    };
  }

  return stored as WorkflowConditionGroup;
}

/** Throws BadRequestException describing the first problem found. */
export function validateConditions(
  conditions: unknown,
): asserts conditions is WorkflowConditionGroup {
  if (!isObject(conditions)) {
    throw new BadRequestException(
      'conditions must be an object: { all: [...] }, { any: [...] } or { not: ... }',
    );
  }

  const { matchAll } = conditions as { matchAll?: unknown };
  if (matchAll !== undefined && typeof matchAll !== 'boolean') {
    throw new BadRequestException('conditions.matchAll must be a boolean');
  }

  const counter = { count: 0 };
  validateNode(rootNode(conditions as WorkflowConditionGroup), 1, counter);

  if (counter.count === 0 && matchAll !== true) {
    throw new BadRequestException(
      'A rule with no conditions would match every message. Add a condition, or set matchAll: true if that is what you want.',
    );
  }
  if (counter.count > 0 && matchAll === true) {
    throw new BadRequestException(
      'matchAll: true is only for a rule with no conditions',
    );
  }
}

function validateNode(
  node: unknown,
  depth: number,
  counter: { count: number },
  isRoot = true,
): void {
  if (!isObject(node)) {
    throw new BadRequestException('Each condition must be an object');
  }
  if (depth > MAX_DEPTH) {
    throw new BadRequestException(
      `Condition groups can be nested at most ${MAX_DEPTH} deep`,
    );
  }

  if ('field' in node) {
    validateCondition(node);
    counter.count += 1;
    if (counter.count > MAX_CONDITIONS) {
      throw new BadRequestException(
        `A rule can have at most ${MAX_CONDITIONS} conditions`,
      );
    }
    return;
  }

  const keys = Object.keys(node);
  if (keys.length !== 1 || !['all', 'any', 'not'].includes(keys[0])) {
    throw new BadRequestException(
      'A condition group must have exactly one of: all, any, not',
    );
  }

  if ('not' in node) {
    validateNode(node.not, depth + 1, counter, false);
    return;
  }

  const children = 'all' in node ? node.all : node.any;
  if (!Array.isArray(children)) {
    throw new BadRequestException('all/any must be a list of conditions');
  }
  // The root may be empty (a matchAll rule); a nested empty group means
  // nothing useful and is almost certainly a half-built rule.
  if (children.length === 0 && !isRoot) {
    throw new BadRequestException('A condition group cannot be empty');
  }
  for (const child of children) {
    validateNode(child, depth + 1, counter, false);
  }
}

function validateCondition(node: Record<string, unknown>): void {
  const { field, op, value } = node;

  if (BOOLEAN_FIELDS.includes(field as WorkflowBooleanField)) {
    if (op !== 'equals' && op !== 'notEquals') {
      throw new BadRequestException(
        `${field as string} only supports equals / notEquals`,
      );
    }
    if (typeof value !== 'boolean') {
      throw new BadRequestException(
        `${field as string} needs a true/false value`,
      );
    }
    return;
  }

  if (!TEXT_FIELDS.includes(field as WorkflowTextField)) {
    throw new BadRequestException(
      `condition.field must be one of: ${[...TEXT_FIELDS, ...BOOLEAN_FIELDS].join(', ')}`,
    );
  }
  if (!TEXT_OPERATORS.includes(op as WorkflowConditionOperator)) {
    throw new BadRequestException(
      `condition.op must be one of: ${TEXT_OPERATORS.join(', ')}`,
    );
  }

  if (op === 'in' || op === 'notIn') {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > MAX_LIST_ITEMS ||
      !value.every(
        (item) =>
          typeof item === 'string' &&
          item.trim().length > 0 &&
          item.length <= MAX_VALUE_LENGTH,
      )
    ) {
      throw new BadRequestException(
        `${op} needs a list of 1-${MAX_LIST_ITEMS} non-empty values`,
      );
    }
    return;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('condition.value must be a non-empty string');
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new BadRequestException(
      `condition.value can be at most ${MAX_VALUE_LENGTH} characters`,
    );
  }

  if (op === 'regex') {
    if (value.length > MAX_REGEX_LENGTH) {
      throw new BadRequestException(
        `A regex can be at most ${MAX_REGEX_LENGTH} characters`,
      );
    }
    try {
      new RegExp(value, 'i');
    } catch (error) {
      throw new BadRequestException(
        `Invalid regex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Whether any condition in the tree tests this field — used to skip
 * computing expensive context values (isKnownContact) nobody asks for. */
export function referencesField(
  conditions: WorkflowConditionGroup,
  field: WorkflowConditionField,
): boolean {
  const visit = (node: WorkflowConditionNode): boolean => {
    if ('field' in node) return node.field === field;
    if ('not' in node) return visit(node.not);
    return ('all' in node ? node.all : node.any).some(visit);
  };
  return visit(rootNode(conditions));
}

export function evaluateConditions(
  conditions: WorkflowConditionGroup,
  context: RuleMessageContext,
): boolean {
  if (conditions.matchAll) {
    return true;
  }
  return evaluateNode(rootNode(conditions), context);
}

/** The group without its matchAll flag; `{ matchAll: true }` alone is read
 * as an empty `all`. */
function rootNode(conditions: WorkflowConditionGroup): WorkflowConditionNode {
  const group: Partial<WorkflowConditionGroup> = { ...conditions };
  delete group.matchAll;
  return Object.keys(group).length === 0
    ? { all: [] }
    : (group as WorkflowConditionNode);
}

function evaluateNode(
  node: WorkflowConditionNode,
  context: RuleMessageContext,
): boolean {
  if ('field' in node) return evaluateCondition(node, context);
  if ('not' in node) return !evaluateNode(node.not, context);
  if ('all' in node) return node.all.every((n) => evaluateNode(n, context));
  return node.any.some((n) => evaluateNode(n, context));
}

function evaluateCondition(
  condition: WorkflowCondition,
  context: RuleMessageContext,
): boolean {
  if (BOOLEAN_FIELDS.includes(condition.field as WorkflowBooleanField)) {
    const actual = context[condition.field as WorkflowBooleanField];
    return condition.op === 'equals'
      ? actual === condition.value
      : actual !== condition.value;
  }

  const values = fieldValues(condition.field as WorkflowTextField, context);
  const test = (actual: string) => matchesText(condition, actual);

  // Negative operators on a list field: none of the addresses may match
  // the positive form, e.g. "to notContains @acme.com" = no Acme recipient.
  if (NEGATIVE_OPERATORS.has(condition.op)) {
    return values.every(test);
  }
  return values.some(test);
}

function fieldValues(
  field: WorkflowTextField,
  context: RuleMessageContext,
): string[] {
  switch (field) {
    case 'to':
    case 'cc':
      return context[field];
    case 'senderDomain':
      return [context.sender.split('@').pop() ?? ''];
    default:
      return [context[field]];
  }
}

function matchesText(condition: WorkflowCondition, raw: string): boolean {
  const actual = raw.toLowerCase();
  const expected =
    typeof condition.value === 'string' ? condition.value.toLowerCase() : '';
  const list = Array.isArray(condition.value)
    ? condition.value.map((item) => item.toLowerCase().trim())
    : [];

  switch (condition.op) {
    case 'equals':
      return actual === expected;
    case 'notEquals':
      return actual !== expected;
    case 'contains':
      return actual.includes(expected);
    case 'notContains':
      return !actual.includes(expected);
    case 'startsWith':
      return actual.startsWith(expected);
    case 'endsWith':
      return actual.endsWith(expected);
    case 'in':
      return list.includes(actual);
    case 'notIn':
      return !list.includes(actual);
    case 'regex':
      return testRegex(condition.value as string, raw);
  }
}

// Rule regexes are user-written and run against inbound mail, i.e. against
// text an attacker controls. A pattern with catastrophic backtracking could
// otherwise pin the AI worker; running the match inside a vm context with a
// timeout lets V8 interrupt it.
const regexSandbox = createContext({ pattern: null, input: '' });
const regexScript = new Script('pattern.test(input)');
const compiled = new Map<string, RegExp>();

function testRegex(source: string, input: string): boolean {
  let pattern = compiled.get(source);
  if (!pattern) {
    try {
      pattern = new RegExp(source, 'i');
    } catch {
      return false;
    }
    if (compiled.size > 500) compiled.clear();
    compiled.set(source, pattern);
  }

  regexSandbox.pattern = pattern;
  regexSandbox.input = input.slice(0, MAX_REGEX_INPUT);
  try {
    return regexScript.runInContext(regexSandbox, {
      timeout: REGEX_TIMEOUT_MS,
    }) as boolean;
  } catch {
    // Timed out: treat as no match rather than failing the whole message.
    return false;
  } finally {
    pattern.lastIndex = 0;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
