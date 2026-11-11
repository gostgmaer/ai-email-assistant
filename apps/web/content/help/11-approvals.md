← [Back to index](/help)

# Approvals

## What it is

Your list of AI replies waiting for **you** to approve them before they can be sent. Your team uses this when some replies, such as prices or refunds, must be checked by named people first. The mailbox's owner sets that up with an [Approval Chain](/help/07-settings-accounts#approval-chains).

You only see a reply here when it's **your turn**. If others need to approve before you, it appears once they have.

If your team doesn't use approvals, this page stays empty, and that's fine.

## Where to find it

**Approvals**, in the menu on the left.

## How to use it

1. Open **Approvals**. Each card shows:
   - Which step you're on (e.g. "Step 2 of 3") and which account the draft belongs to.
   - The draft's subject, recipient, and a preview of the body.
   - An **"Open full draft →"** link if you want to read or edit the whole thing before deciding.
   - The full chain: every approver in order, with their current status (pending / approved / rejected).
2. **Read the draft properly** before deciding. Use the [checklist before sending](/help/16-safe-use-guidelines#before-you-send-any-ai-written-email): facts, names, promises, tone and recipients. If you're the last approver, your click sends it.
3. *(optional)* Type a **note**, such as why you rejected it. It goes to the mailbox's owner in their notification. The customer never sees it.
4. Click **Approve** or **Reject**.

## What happens

- **Approve**, not the final step: the chain advances — the next approver gets notified, and the card disappears from your queue (it's no longer your turn).
- **Approve**, final step: the reply **sends immediately**, exactly as drafted. There's no further confirmation step — approving the last step is the send action.
- **Reject**: the approval stops. The draft is **not** deleted. It stays in **Drafts**, where someone can fix it and send it by hand. The mailbox's owner gets a notification with your note, if you left one.
- **Nobody decides:** after 72 hours (unless the rule sets another limit) the approval expires, and the draft can be checked and sent by hand. The person whose turn it is gets a reminder halfway.
- **You're removed from the mailbox:** approvals waiting on you are cancelled, and their drafts go back to Drafts for the team to handle.

## Example

A rule says every AI reply to a sales email needs approval from the **Sales Manager**, then the **Head of Sales**. A customer asks for a quote, and the AI writes a reply. The Sales Manager sees it on their **Approvals** page first (*Step 1 of 2*). Once they approve, it leaves their list and appears on the Head of Sales' list (*Step 2 of 2*). When the Head of Sales approves, it's sent.

## Related

- [Settings → Accounts → Approval Chains](/help/07-settings-accounts#approval-chains) — how to set up a chain in the first place.
- [Compose](/help/03-compose) — a draft gated by a pending chain shows a banner explaining why, and the **Send** button is disabled until it's resolved.
