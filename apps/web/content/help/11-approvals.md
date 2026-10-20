← [Back to index](/help)

# Approvals

Your personal queue of drafted replies waiting on your sign-off as part of a [True multi-step Approval Chain](/help/07-settings-accounts#true-multi-step-approval-chains). This page only shows chains where it's currently **your turn** — earlier or later steps assigned to other people don't appear here until it's their turn (or yours again, if you're listed more than once).

## What it is

A dedicated inbox for approval decisions, separate from your regular Inbox — so a drafted reply that needs sign-off doesn't get lost among unread mail.

## Where to find it

**Approvals** in the left sidebar (`/approvals`).

## How to use it

1. Open **Approvals**. Each card shows:
   - Which step you're on (e.g. "Step 2 of 3") and which account the draft belongs to.
   - The draft's subject, recipient, and a preview of the body.
   - An **"Open full draft →"** link if you want to read or edit the whole thing before deciding.
   - The full chain: every approver in order, with their current status (pending / approved / rejected).
2. Optionally type a **note** — it's included in the notification sent to the account owner (visible to them, not to the external recipient).
3. Click **Approve** or **Reject**.

## What happens

- **Approve**, not the final step: the chain advances — the next approver gets notified, and the card disappears from your queue (it's no longer your turn).
- **Approve**, final step: the reply **sends immediately**, exactly as drafted. There's no further confirmation step — approving the last step is the send action.
- **Reject**: the whole chain stops. The draft is **not** deleted — it goes back to the account owner's Drafts, editable and sendable manually at any time (rejecting is not a permanent lock; it just means it won't send automatically as-is). The account owner gets a notification with your note, if you left one.

## Example

A "Require multi-step approval" Workflow rule lists `[Sales Manager, VP of Sales]` as approvers on a Sales-category rule. A new sales inquiry comes in, the AI drafts a reply, and it's held pending approval. The Sales Manager sees it on their **Approvals** page first ("Step 1 of 2"); once they approve, it disappears from their queue and appears on the VP's ("Step 2 of 2"). The VP approving sends it — the Sales Manager never sees it again unless they're re-added to a later chain.

## Related

- [Workflow rules → True multi-step Approval Chains](/help/07-settings-accounts#true-multi-step-approval-chains) — how to set up a chain in the first place.
- [Compose](/help/03-compose) — a draft gated by a pending chain shows a banner explaining why, and the **Send** button is disabled until it's resolved.
