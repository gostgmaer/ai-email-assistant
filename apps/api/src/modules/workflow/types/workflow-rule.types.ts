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
   * draft for review. */
  | { type: 'AUTO_REPLY' }
  /** Assign the thread to a Shared Inbox member (see AccountMember) —
   * the assignee must already have access to the account. */
  | { type: 'ASSIGN_TO'; userId: string }
  /** Create a Notification for a user — does not need to be an account
   * member (e.g. notifying yourself about your own account is fine). */
  | { type: 'NOTIFY'; userId: string; message?: string }
  /** Explicit no-op: falls through to the existing default (draft the
   * reply for human review). Exists so a rule can be written to say "for
   * messages matching X, don't auto-reply" without needing an empty
   * actions array to carry that meaning implicitly. */
  | { type: 'REQUIRE_APPROVAL' };

export type WorkflowActionType = WorkflowAction['type'];
