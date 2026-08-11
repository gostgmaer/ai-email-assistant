/**
 * Application-layer types for WorkflowRule.conditions/actions (stored as
 * Json — see the schema comment on WorkflowRule for why). Kept in their
 * own file so both the service and its DTOs/frontend contract can share
 * the exact same shape without importing from each other.
 */

export type WorkflowConditionField = 'category' | 'priority' | 'sender';
export type WorkflowConditionOperator = 'equals' | 'contains';

export interface WorkflowCondition {
  field: WorkflowConditionField;
  operator: WorkflowConditionOperator;
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
   * — see CalendarContextService and AiProcessingProcessor. */
  | { type: 'AUTO_REPLY'; agentId?: string; calendarAgent?: boolean }
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
  | { type: 'REQUIRE_APPROVAL_CHAIN'; approverUserIds: string[] };

export type WorkflowActionType = WorkflowAction['type'];
