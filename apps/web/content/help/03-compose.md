← [Back to index](/help)

# Compose

## What it is

Writing a brand-new email (not a reply within a thread — see [Inbox](/help/02-inbox) for replying).

## Where to find it

**Compose** button, top of the left sidebar on every page. Takes you to `/compose`.

## How to use it

1. **From** — pick which connected account to send as (dropdown; defaults to your Primary account).
2. **To** — one or more recipient addresses, comma-separated.
3. **Cc** / **Bcc** *(optional)* — same format.
4. **Subject**.
5. **Message** — the body. Click **Rewrite with AI** (top-right of the message box) at any point to have the AI polish tone/grammar of what you've typed so far.
6. *(optional)* **+ Attach files** — up to 3 MB in total per message; a larger set is refused with a message. Remove a file with its ✕.
7. *(optional)* **Remind me if no reply in** — pick 1–14 days. If nobody answers by then, you get a follow-up task and a notification.
8. Choose one:
   - **Save draft** — stores it without sending, and takes you to the **Drafts** folder in Inbox.
   - **Send** — sends immediately through the selected account's real provider (Gmail/Outlook/SMTP). This is irreversible the same way any real email is.

## Example

Sending a quick note:

| Field | Example value |
|---|---|
| From | `you@example.com` |
| To | `someone@example.com` |
| Subject | `Quick follow-up` |
| Message | `Hi — just checking in on the proposal, any update?` |

Click **Save draft** first if you're not 100% sure of the wording; you can reopen and edit it from Drafts before actually sending.

## Editing an existing draft

Opening a draft from the **Drafts** folder in Inbox takes you back to this same Compose form (pre-filled), now with two extra options:

- **Discard draft** — deletes the draft immediately (there is no confirmation prompt).
- **Save draft** / **Send** work the same as above.

Attachments and the reminder aren't available on a saved draft yet — add them when you compose and send in one go.

**Gated by an Approval Chain?** If a [Workflow rule](/help/07-settings-accounts#true-multi-step-approval-chains) required multi-step approval for this reply, you'll see a banner at the top explaining what's happening:
- **Still pending** (amber banner) — shows which step it's on and who's next. **Send** is disabled until every approver signs off — see [Approvals](/help/11-approvals).
- **Rejected** (red banner) — an approver sent it back for rework. Edit it as needed; **Send** is enabled again immediately (rejecting doesn't lock the draft forever).

## What happens

- **Save draft** stores the draft in the app (it does not appear in your Gmail or Outlook Drafts).
- **Send** dispatches a real email via the account's provider API/SMTP. There is no "undo."
- **Discard draft** removes the draft — this cannot be undone either.
- Replying from a thread offers the same **+ Attach files** and **Remind me if no reply in** options under the reply box.
