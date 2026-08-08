← [Back to index](/help)

# Getting started — connecting an inbox

## What it is

The first thing every user does: connect a real mailbox so the app has mail to work with. You can connect Gmail, Outlook, or any generic IMAP/SMTP account (Yahoo, a company mail server, etc.). You can connect more than one account; the first one you connect becomes **Primary** automatically.

## Where to find it

**Settings → Accounts** (left sidebar). This is also where you land by default after first login if you have no accounts connected yet.

## How to use it

### Option A — Gmail or Outlook (OAuth, recommended)

1. Click **Connect Gmail** or **Connect Outlook** near the top of the page.
2. You're redirected to Google's/Microsoft's real sign-in and consent screen.
3. Approve the requested permissions (read/send mail, and calendar if you also want scheduling).
4. You're redirected back to `/settings/email-accounts?connected=<email>` and see a green confirmation banner: *"Connected `you@example.com` — the initial sync is running in the background."*
5. The account appears in the list. A background sync starts pulling your existing mail into the unified inbox — this can take a few minutes for a large mailbox.

### Option B — Any IMAP/SMTP mailbox

1. Click **Connect IMAP**. A form expands with two columns of fields.
2. Fill in:
   - **Email address** — the mailbox address itself.
   - **Display name** *(optional)* — how it's labeled in the UI.
   - **Username** — usually the same as the email, but some providers use a separate login name.
   - **Password** — the mailbox password, or an app-specific password if the provider requires one (Gmail/Yahoo with 2FA do).
   - **IMAP host** / **IMAP port** *(defaults to 993)* — e.g. `imap.example.com`.
   - **SMTP host** / **SMTP port** *(defaults to 465)* — e.g. `smtp.example.com`.
   - IMAP/SMTP "secure" (TLS) checkboxes default to on — leave them on unless your provider specifically requires plaintext.
3. Click **Connect**. On success the form closes and the account appears in the list.

### Example

Connecting a company mailbox on a self-hosted mail server:

| Field | Example value |
|---|---|
| Email address | `ops@yourcompany.com` |
| Username | `ops@yourcompany.com` |
| Password | `••••••••` (an app password, not your SSO password) |
| IMAP host / port | `mail.yourcompany.com` / `993` |
| SMTP host / port | `mail.yourcompany.com` / `465` |

## What happens

- A new `EmailAccount` row is created, owned by your user.
- A background sync job starts pulling recent mail into the unified Inbox.
- The account gets sensible defaults: sync filters mostly off, no Policy phrases, auto-schedule meetings off, no workflow rules except a starter "auto-reply to everything" rule.
- If it's your first account, it's marked **Primary**.

## Related

- To change what gets synced at all, see [Settings → Accounts → Sync filters](/help/07-settings-accounts#sync-filters).
- To control what the AI does with incoming mail, see [Workflow rules](/help/07-settings-accounts#workflow-rules).
