/**
 * Application-layer types for WorkflowRule.conditions/actions (stored as
 * Json — see the schema comment on WorkflowRule for why). Kept in their
 * own file so both the service and its DTOs/frontend contract can share
 * the exact same shape without importing from each other.
 */

/** Text fields, compared case-insensitively. `to`/`cc` are lists: a
 * positive operator matches when ANY address does, a negative one when
 * none does. `body` is the message's own text, quoted history stripped. */
export type WorkflowTextField =
  | 'category'
  | 'priority'
  | 'sentiment'
  | 'language'
  | 'sender'
  | 'senderDomain'
  | 'to'
  | 'cc'
  | 'subject'
  | 'body';

/** Yes/no facts about the message, compared with equals/notEquals.
 * isKnownContact: a CRM contact or someone this account has written to.
 * withinBusinessHours: the account's business hours, in the owner's
 * timezone. */
export type WorkflowBooleanField =
  'containsPii' | 'isFirstMessage' | 'isKnownContact' | 'withinBusinessHours';

export type WorkflowConditionField = WorkflowTextField | WorkflowBooleanField;

export type WorkflowConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  /** value is a list; matches when the field equals any entry. */
  | 'in'
  | 'notIn'
  /** Case-insensitive JavaScript regex, run under a time limit — see
   * rule-conditions.util.ts. */
  | 'regex';

export interface WorkflowCondition {
  field: WorkflowConditionField;
  op: WorkflowConditionOperator;
  value: string | string[] | boolean;
}

/** Exactly one of all (AND), any (OR) or not. Groups nest. */
export type WorkflowConditionNode =
  | WorkflowCondition
  | { all: WorkflowConditionNode[] }
  | { any: WorkflowConditionNode[] }
  | { not: WorkflowConditionNode };

/** A rule's stored `conditions`. A rule that should match every message
 * must say so with matchAll: true and no conditions — an empty rule is
 * otherwise rejected, so a half-built rule can't silently match all mail. */
export type WorkflowConditionGroup = (
  | { all: WorkflowConditionNode[] }
  | { any: WorkflowConditionNode[] }
  | { not: WorkflowConditionNode }
) & { matchAll?: boolean };

/** v1 condition (flat AND list), still accepted on input and converted —
 * see normalizeConditions. */
export interface LegacyWorkflowCondition {
  field: 'category' | 'priority' | 'sender';
  operator: 'equals' | 'contains';
  value: string;
}

export type WorkflowAction =
  /** Send the AI-drafted reply automatically instead of holding it as a
   * draft for review. When agentId is set (AI Agents, v2.0 §4), that
   * agent's persona (systemPrompt) replaces the default reply prompt
   * entirely for this message — see AgentService.getEnabledSystemPrompt.
   * calendarAgent (v3.0 multi-agent orchestration §Option B, default true
   * when unset) lets a rule opt out of the Calendar Agent's
   * availability-aware context on meeting/scheduling-classified messages
   * — see CalendarContextService and AiProcessingProcessor.
   *
   * replyAll copies everyone else on the original message (default: reply
   * to the sender / Reply-To only). allowUnknownSenderGrounding lets a
   * reply grounded in your documents auto-send to senders you've never
   * corresponded with (default: held for review — see
   * AiProcessingProcessor.findGroundingBlocker); for inboxes that answer
   * strangers from public material, like support. */
  | {
      type: 'AUTO_REPLY';
      agentId?: string;
      calendarAgent?: boolean;
      replyAll?: boolean;
      allowUnknownSenderGrounding?: boolean;
    }
  /** Assign the thread to a Shared Inbox member (see AccountMember) —
   * the assignee must already have access to the account. */
  | { type: 'ASSIGN_TO'; userId: string }
  /** Create a Notification for a user — does not need to be an account
   * member (e.g. notifying yourself about your own account is fine). */
  | { type: 'NOTIFY'; userId: string; message?: string }
  /** Post a message to a Slack channel via a connected Integration (v3.0,
   * see docs/MVP.md). integrationId must reference a SLACK Integration on
   * this same account — validated at execution time, not save time,
   * matching ASSIGN_TO's userId (best-effort, logged and skipped on
   * failure rather than blocking the rest of the rule). */
  | {
      type: 'POST_TO_SLACK';
      integrationId: string;
      channelId: string;
      message?: string;
    }
  /** Post a message to a Microsoft Teams channel via a connected
   * Integration (v3.0, same shape as POST_TO_SLACK) — integrationId must
   * reference a TEAMS Integration on this same account; teamId/channelId
   * identify the specific channel (Teams' two-level team → channel
   * hierarchy, unlike Slack's flat channel list). */
  | {
      type: 'POST_TO_TEAMS';
      integrationId: string;
      teamId: string;
      channelId: string;
      message?: string;
    }
  /** Create or update a HubSpot contact for the message's sender via a
   * connected Integration (v3.0, same best-effort posture as
   * POST_TO_SLACK) — integrationId must reference a HUBSPOT Integration
   * on this same account. The sender's email/name come from the message
   * being processed, not user input — see WorkflowRuleService.executeActions. */
  | { type: 'CREATE_HUBSPOT_CONTACT'; integrationId: string }
  /** Explicit no-op: falls through to the existing default (draft the
   * reply for human review). Exists so a rule can be written to say "for
   * messages matching X, don't auto-reply" without needing an empty
   * actions array to carry that meaning implicitly. */
  | { type: 'REQUIRE_APPROVAL' }
  /** True multi-step approval (v3.0, see docs/MVP.md) — like
   * REQUIRE_APPROVAL, holds the reply as a draft instead of auto-sending,
   * but additionally creates an ApprovalChain: approverUserIds sign off
   * in order (see ApprovalChainService), and the draft only sends once
   * every step has approved. Always wins over AUTO_REPLY when both
   * appear on the same matched rule — see WorkflowRuleService.executeActions. */
  | {
      type: 'REQUIRE_APPROVAL_CHAIN';
      approverUserIds: string[];
      /** Pending chains expire after this many hours (default
       * APPROVAL_CHAIN_TTL_HOURS, 72); the current approver is reminded
       * halfway. See ApprovalChainService.sweep. */
      expiresInHours?: number;
    }
  /** Forward the message (text and HTML body, no attachments yet) to an
   * address, with an optional note above it. Marked Auto-Submitted so
   * the recipient's own auto-responders stay quiet. */
  | { type: 'FORWARD'; to: string; note?: string }
  /** Gmail label / Outlook category / IMAP keyword, by name — created if
   * it doesn't exist (Gmail). */
  | { type: 'ADD_LABEL'; label: string }
  /** Move to one of this account's synced folders (MailFolder id). */
  | { type: 'MOVE_TO_FOLDER'; folderId: string }
  /** Out of the inbox: Gmail removes INBOX, Outlook/IMAP move to Archive. */
  | { type: 'ARCHIVE' }
  | { type: 'MARK_READ' }
  /** Hide the thread from the inbox for this many minutes. */
  | { type: 'SNOOZE'; minutes: number }
  /** Create an action item for the account owner. The description
   * defaults to "Follow up: <subject>". */
  | { type: 'CREATE_TASK'; description?: string; dueInDays?: number }
  /** POST a JSON summary of the message (no body, a 200-char snippet) to
   * an HTTPS URL, signed with HMAC-SHA256 in X-Signature. secret is
   * generated when the rule is saved. Private/internal addresses are
   * refused — see webhook.util.ts. */
  | { type: 'WEBHOOK'; url: string; secret?: string }
  /** Hold an approved auto-reply this many minutes before it sends (it
   * can be cancelled meanwhile). No effect on drafts. */
  | { type: 'DELAY_SEND'; minutes: number }
  /** Don't evaluate any lower rules for this message. */
  | { type: 'STOP_PROCESSING' };

export type WorkflowActionType = WorkflowAction['type'];

/** Actions that decide how the reply goes out. Only the first matching
 * rule that has one decides; later rules' reply actions are ignored. */
export const REPLY_ACTION_TYPES: ReadonlySet<WorkflowActionType> = new Set([
  'AUTO_REPLY',
  'REQUIRE_APPROVAL',
  'REQUIRE_APPROVAL_CHAIN',
]);

export type ReplyAction = Extract<
  WorkflowAction,
  { type: 'AUTO_REPLY' | 'REQUIRE_APPROVAL' | 'REQUIRE_APPROVAL_CHAIN' }
>;

export function isReplyAction(action: WorkflowAction): action is ReplyAction {
  return REPLY_ACTION_TYPES.has(action.type);
}

/** What one action did, as recorded in RuleExecution.results. */
export interface RuleActionResult {
  type: WorkflowActionType;
  status: 'done' | 'skipped' | 'failed';
  detail?: string;
}
