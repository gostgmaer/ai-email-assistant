← [Back to index](/help)

# Getting started: connecting a mailbox

## What it is

Before the app can help, it needs your email. You connect a mailbox once, and the app keeps a copy of your email up to date from then on. You can connect Gmail, Outlook (including Microsoft 365 work accounts), or almost any other email service. You can connect several. The first one becomes your **Primary** mailbox, used by default when you write a new email.

> **Is it safe?** For Gmail and Outlook you sign in on Google's or Microsoft's own page, so this app never sees your password. You can remove the app's access at any time by disconnecting the mailbox.

## Where to find it

**Settings → Accounts**, in the menu on the left. On a phone, tap **☰** at the top left first.

## How to connect

### Gmail or Outlook (recommended)

1. Click **Connect Gmail** or **Connect Outlook**.
2. Google's or Microsoft's sign-in page opens. Sign in as usual.
3. You're asked to allow the app to read and send your email, and to use your calendar if you want meeting scheduling. Click **Allow**.
4. You come back to the app with a green message: *"Connected you@example.com — the initial sync is running in the background."*
5. The mailbox appears in the list. Your existing email starts arriving in the Inbox. This can take a few minutes for a large mailbox, and you can keep using the app meanwhile.

### Any other email service

Use this for Yahoo, a company mail server, or any other service.

> **Before you start:** you need your email service's "IMAP" and "SMTP" settings: a server name and a number for each. Search your provider's help pages for "IMAP settings", or ask your IT team. Many providers also require an **app password** instead of your normal one, especially if you use two-step sign-in. Their help pages explain how to create one.

1. Click **Connect IMAP**. A form opens.
2. Fill it in:
   - **Email address**: the address you want to connect.
   - **Display name** *(optional)*: how it's labelled in the app.
   - **Username**: usually the same as your email address.
   - **Password**: your email password, or the app password your provider gave you.
   - **IMAP host** and **port**: for reading email, for example `imap.example.com` and `993`.
   - **SMTP host** and **port**: for sending email, for example `smtp.example.com` and `465`.
   - Leave the **secure** boxes ticked unless your provider says otherwise.
3. Click **Connect**. If the details are right, the form closes and the mailbox appears in the list. If not, you'll see an error: check each field against your provider's instructions.

### Example

Connecting a company mailbox:

| Field | Example |
|---|---|
| Email address | `ops@yourcompany.com` |
| Username | `ops@yourcompany.com` |
| Password | `••••••••` (an app password from your IT team) |
| IMAP host / port | `mail.yourcompany.com` / `993` |
| SMTP host / port | `mail.yourcompany.com` / `465` |

## What happens next

- Your recent email starts arriving in the Inbox, sorted into **Needs reply**, **FYI** and other groups.
- From now on, when a new email arrives that needs an answer, the AI writes a draft reply and leaves it under the email for you to check. **Nothing is sent automatically.** The mailbox comes with one starter automatic-reply rule, and it's switched off.
- Email that was already in your mailbox doesn't get automatic drafts. Open it and click **AI Reply** whenever you want one.
- Newsletters and marketing mail are left out, unless you turn on [Keep newsletters](/help/07-settings-accounts#keep-newsletters).
- After that, new email arrives about every 5 minutes. **Sync now** on the mailbox fetches it immediately.

## Checking your mailbox is working

On **Settings → Accounts**, each mailbox shows a label next to its address, and when it last synced:

| Label | What it means | What to do |
|---|---|---|
| **synced** | Everything is working | Nothing |
| **syncing** | It's fetching email right now | Wait a moment |
| **error** | Fetching failed several times. The reason is shown under the address | Usually nothing: the app keeps retrying. If it doesn't clear in a few hours, click **Sync now** |
| **reconnect needed** | The app's permission to read the mailbox stopped working, for example after you changed your password | Click **Reconnect** and sign in again. For other email services, disconnect it and connect it again with the current password |

The mailbox's owner also gets a notification when something goes wrong; see [Notifications](/help/06-notifications#every-kind-of-notification).

## Connecting more than one mailbox

Repeat the steps above for each one. Every mailbox:
- shows in the same Inbox, so you see all your email in one list
- has its own settings, rules and team members
- can be the one you send from: pick it in **From** when you write a new email

To change which mailbox is chosen by default, click **Make primary** on it.

## Next steps

1. Set your name, job title and timezone in [Settings → Profile](/help/09-settings-profile), so AI replies are signed correctly.
2. Connect your calendar in [Settings → Calendars](/help/08-settings-calendars) if you want help with meeting times.
3. Read [Safe use guidelines](/help/16-safe-use-guidelines) before you turn on any automatic replies.

## Related

- [Sync filters](/help/07-settings-accounts#sync-filters): keep some kinds of automatic email out of the app.
- [Questions and problems](/help/17-faq-troubleshooting#email-isnt-showing-up): if your email doesn't appear.
