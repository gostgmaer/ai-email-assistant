import { isWithinBusinessHours } from '../../../common/utils/local-time.util';
import { stripQuotedHistory } from '../../ai/utils/thread-context.util';
import { RuleMessageContext } from './rule-conditions.util';

interface Participant {
  address?: string;
}

/** The stored message fields a rule can look at. */
export interface RuleMessageSource {
  id: string;
  from: unknown;
  to: unknown;
  cc: unknown;
  subject: string | null;
  bodyText: string | null;
  receivedAt: Date;
  category: string | null;
  priority: string | null;
  sentiment: string | null;
  language: string | null;
  containsPii: boolean;
}

export interface RuleAccountSource {
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
}

/**
 * Builds what rule conditions test from a stored message. Shared by live
 * evaluation (AiProcessingProcessor) and dry-runs, so "Test rule" answers
 * exactly what the real pipeline would have done. isKnownContact is passed
 * in because it costs queries; callers compute it only when a rule asks.
 */
export function buildRuleMessageContext(input: {
  message: RuleMessageSource;
  /** Receive times of the other messages in the thread. */
  threadReceivedAt: Date[];
  threadSubject: string | null;
  account: RuleAccountSource;
  timezone: string;
  isKnownContact: boolean;
}): RuleMessageContext {
  const { message, account } = input;

  return {
    category: message.category ?? '',
    priority: message.priority ?? '',
    sentiment: message.sentiment ?? '',
    language: message.language ?? '',
    sender: addresses(message.from)[0] ?? '',
    to: addresses(message.to),
    cc: addresses(message.cc),
    subject: input.threadSubject ?? message.subject ?? '',
    body: stripQuotedHistory(message.bodyText ?? ''),
    containsPii: message.containsPii,
    isFirstMessage: !input.threadReceivedAt.some(
      (at) => at < message.receivedAt,
    ),
    isKnownContact: input.isKnownContact,
    withinBusinessHours: isWithinBusinessHours(
      message.receivedAt,
      input.timezone,
      {
        start: account.businessHoursStart,
        end: account.businessHoursEnd,
        days: account.businessDays,
      },
    ),
  };
}

function addresses(list: unknown): string[] {
  return Array.isArray(list)
    ? (list as Participant[])
        .map((participant) => participant.address?.toLowerCase() ?? '')
        .filter((address) => address.length > 0)
    : [];
}
