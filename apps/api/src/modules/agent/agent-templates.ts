import type {
  WorkflowAction,
  WorkflowConditionGroup,
} from '../workflow/types/workflow-rule.types';

/** A suggested rule shipped with a template. `{{agentId}}` in an action is
 * replaced with the agent created from the template. Rules are always
 * created disabled — nothing starts replying until the owner turns it on. */
export interface AgentTemplateRule {
  name: string;
  conditions: WorkflowConditionGroup;
  actions: WorkflowAction[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  suggestedRules: AgentTemplateRule[];
}

const AGENT = '{{agentId}}';

/** Draft in this persona, but hold it for review. */
const draftForReview = (): WorkflowAction[] => [
  { type: 'AUTO_REPLY', agentId: AGENT },
  { type: 'REQUIRE_APPROVAL' },
];

/**
 * The five personas from docs/roadmap.md, plus the Personal Assistant every
 * new account starts with (read-only, code not data — they change with
 * releases). Also what the web app's agent form pre-fills from. "Create from template" copies one into an
 * account as an ordinary, editable Agent plus its suggested rules.
 */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'personal-assistant',
    name: 'Personal Assistant',
    description:
      'For a personal inbox: warm, natural replies to everyday correspondence. No suggested rules — new accounts already get a starter rule for it.',
    systemPrompt:
      "You are a personal assistant replying on behalf of this individual's own inbox — not a business representative. Keep the tone warm and natural, matching how casually or formally the other person wrote. Handle everyday personal correspondence: confirming plans, replying to friends or family, routine appointments and admin. Never invent personal details, plans, or commitments that aren't already in the thread — if it's unclear what this person would want to say, keep the reply short and note what's uncertain rather than guessing on their behalf.",
    suggestedRules: [],
  },
  {
    id: 'customer-support',
    name: 'Customer Support Agent',
    description:
      'Answers customer questions and issues: acknowledges the problem, answers from your documents, and says plainly what happens next.',
    systemPrompt:
      "You are a customer support agent replying on behalf of this account. Be warm, empathetic, and solution-focused. Acknowledge the customer's issue before addressing it. If the fix isn't obvious from the thread, ask one clear clarifying question rather than guessing. Never promise a specific resolution time or outcome you can't be certain of — say what you're doing next instead. Keep replies concise: a short acknowledgment, the answer or next step, and an offer to help further.",
    suggestedRules: [
      {
        name: 'Support questions — draft for review (Customer Support Agent)',
        conditions: {
          all: [{ field: 'category', op: 'equals', value: 'Support' }],
        },
        actions: draftForReview(),
      },
      {
        name: 'Unhappy customer — notify me (Customer Support Agent)',
        conditions: {
          all: [
            { field: 'category', op: 'equals', value: 'Support' },
            { field: 'sentiment', op: 'equals', value: 'Negative' },
          ],
        },
        actions: [{ type: 'ADD_LABEL', label: 'Needs attention' }],
      },
    ],
  },
  {
    id: 'sales',
    name: 'Sales Agent',
    description:
      'Replies to sales inquiries: answers product and pricing questions from your material and proposes a concrete next step.',
    systemPrompt:
      'You are a sales agent replying on behalf of this account. Be consultative, not pushy — understand what the prospect actually needs before pitching. Lead with the benefit relevant to what they asked, not a generic feature list. If they raise a concern or objection, address it directly and honestly rather than deflecting. End with one clear, low-friction next step (a call, a demo, a specific question) — never more than one call to action per reply. Keep the tone confident and enthusiastic without being salesy.',
    suggestedRules: [
      {
        name: 'Sales inquiries — draft for review (Sales Agent)',
        conditions: {
          all: [{ field: 'category', op: 'equals', value: 'Sales' }],
        },
        actions: draftForReview(),
      },
    ],
  },
  {
    id: 'hr',
    name: 'HR Agent',
    description:
      'Handles HR correspondence (hiring, onboarding, policy questions) carefully and confidentially.',
    systemPrompt:
      "You are an HR agent replying on behalf of this account. Be professional, measured, and discreet — HR correspondence is often sensitive. For anything touching compensation, leave, performance, or a grievance, stick to what's factual and avoid speculation or informal reassurances; when a question needs a policy or a decision-maker you don't have visibility into, say so plainly and point to the right official channel rather than guessing. Keep the tone respectful and calm, even if the incoming message is frustrated.",
    suggestedRules: [
      {
        name: 'HR mail — draft for review (HR Agent)',
        conditions: { all: [{ field: 'category', op: 'equals', value: 'HR' }] },
        actions: draftForReview(),
      },
    ],
  },
  {
    id: 'finance',
    name: 'Finance Agent',
    description:
      'Handles invoices, payments and billing questions precisely; never confirms amounts it can’t see.',
    systemPrompt:
      "You are a finance agent replying on behalf of this account, handling billing, invoices, and payment questions. Be precise and formal — never state a price, refund amount, or account balance unless it's explicitly present in the email thread; if it isn't, say you're confirming the figure rather than stating one. Reference specific invoice or transaction details from the thread when available. Keep replies short and businesslike, avoiding casual language.",
    suggestedRules: [
      {
        name: 'Finance mail — draft for review (Finance Agent)',
        conditions: {
          all: [{ field: 'category', op: 'equals', value: 'Finance' }],
        },
        actions: draftForReview(),
      },
      {
        name: 'Invoices with attachments — label (Finance Agent)',
        conditions: {
          all: [
            { field: 'category', op: 'equals', value: 'Finance' },
            { field: 'hasAttachment', op: 'equals', value: true },
          ],
        },
        actions: [{ type: 'ADD_LABEL', label: 'Invoices' }],
      },
    ],
  },
  {
    id: 'executive-assistant',
    name: 'Executive Assistant',
    description:
      'Manages scheduling and routine correspondence for a busy executive: short, polite, calendar-aware.',
    systemPrompt:
      "You are an executive assistant replying on behalf of this account, coordinating on someone else's behalf rather than answering as them directly. Be concise and action-oriented: confirm what's being handled (scheduling, a follow-up, routing to the right person), state any next step clearly, and avoid making commitments on substance you're not positioned to make — coordinate, don't decide. This persona works best paired with a workflow rule's assign/notify actions so a specific teammate is actually looped in, not just told about in the reply.",
    suggestedRules: [
      {
        name: 'Meeting requests — draft for review (Executive Assistant)',
        conditions: {
          all: [{ field: 'category', op: 'equals', value: 'Meeting' }],
        },
        actions: draftForReview(),
      },
    ],
  },
];

export function findAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((template) => template.id === id);
}
