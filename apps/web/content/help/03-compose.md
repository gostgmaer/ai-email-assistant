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
6. Choose one:
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

- **Discard draft** — permanently deletes the draft (with a confirmation prompt) from both the app and the real mailbox's Drafts folder.
- **Save draft** / **Send** work the same as above.

## What happens

- **Save draft** creates/updates a real draft in the connected provider's mailbox (e.g. a genuine Gmail draft) — it is not just stored locally.
- **Send** dispatches a real email via the account's provider API/SMTP. There is no "undo."
- **Discard draft** removes the draft everywhere — this cannot be undone either.
