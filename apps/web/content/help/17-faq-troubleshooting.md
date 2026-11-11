← [Back to index](/help)

# Questions and problems

Find your question below. If nothing here helps, ask whoever set up the app for your team.

## Email isn't showing up

**I just connected my mailbox and the inbox is empty.**
The first sync runs in the background and can take a few minutes, longer for a very large mailbox. Refresh the page after a while.

**An email I'm expecting isn't here.**
Work through these:
1. On **Settings → Accounts**, click **Sync now** on the mailbox, wait a minute and look again.
2. Check the other folders (**Archive**, **Spam**) and the **Snoozed** tab.
3. Check the chips: you may be looking at **Needs reply** while the email is under **FYI** or **Notifications**. Click **All**.
4. Newsletters and marketing mail are left out unless the owner turned on **Keep newsletters**. One-time codes, receipts and similar automatic mail may be left out by **Sync filters**. See [Sync filters](/help/07-settings-accounts#sync-filters).
5. If the button on the mailbox says **Resume sync**, syncing is paused. The owner can click it to restart.

**I got a "Reconnect your mailbox" or "Sync failing" notification.**
Go to **Settings → Accounts** and look at the label next to the mailbox's address:
- **reconnect needed:** the app lost permission to read the mailbox, often after a password change or after access was removed in your Google or Microsoft account. Click the **Reconnect** link on the card and sign in again. Your settings are kept. For other email services, the card tells you to disconnect the mailbox and connect it again with the current password.
- **error:** something went wrong several times in a row, and the reason is shown under the address. The app keeps retrying on its own, less often each time. If it doesn't clear within a few hours, click **Sync now**, and if that fails, ask whoever runs the app.
- **syncing:** it's working right now. **synced** means everything is fine.

**I can't find an email with Search.**
Search only looks at subjects and the first lines of each conversation, not senders or the full text. Try **Ask AI** instead: *"the email from Dana about invoice 1042"*.

## The AI

**There's no AI draft on an email.**
- Automatic drafts are only written for new email arriving after you connected the mailbox, up to two days old. For older email, click **AI Reply** under the email.
- The AI decided it doesn't need an answer. You'll see a grey **No reply needed** label with the reason. You can still reply yourself, or click **AI Reply** to get a draft anyway.
- Newsletters and automatic notifications never get drafts.
- If you see a red box saying the AI *couldn't process this email*, click **Retry AI**.

**The AI draft has wrong facts.**
Fix it before sending, or click **Discard** and choose **Wrong facts**. To give the AI correct facts for next time, upload a document with them, such as your price list. See [Documents](/help/05-documents).

**The AI signs with the wrong name or job title.**
Update **Settings → Profile** and click **Save**.

**An automatic reply was held as a draft instead of being sent.**
That's a safety check working. Common reasons: it contained a blocked phrase (**Policy**), the hourly or daily limit was reached, the AI wasn't confident enough, it's quiet hours, or it needs approval. The owner can see the exact reason under **Activity** on the mailbox.

**The AI sent something I didn't expect.**
Open **Settings → Accounts → Activity** on the mailbox. It shows each automatic reply, the rule that allowed it and why. The owner can switch the rule off under **Workflows**, or switch off automatic sending for the whole mailbox under **Automation**.

**Ask says it couldn't find an answer.**
It only answers from your email, and says so rather than guessing. Try different words, such as the sender's name or a word from the subject. On a newly connected mailbox, it may still be reading your mail.

**The summary is out of date.**
Summaries are saved, so new messages aren't included until you click **Refresh summary**.

## Buttons and settings

**A button from the Help isn't on my screen.**
You're probably a member of a shared mailbox, not its owner. See [Who can do what](/help/15-working-as-a-team#who-can-do-what). On a phone, some controls are hidden to save space; try a computer.

**I can't invite a teammate.**
They need to sign up for the app first, with the same email address you type in. Only the mailbox's owner can invite.

**Meeting times are at odd hours.**
Your timezone is probably wrong. Go to **Settings → Profile**, click **Use this device's** next to Timezone, then **Save**.

**Propose times says my calendar has no free time.**
The app only offers weekdays between 9:00 and 17:00 your time, over the next two weeks. If that's all booked, or your timezone is wrong, there's nothing to offer. See [How meeting times are chosen](/help/08-settings-calendars#how-meeting-times-are-chosen).

**I'm not getting notifications I expected.**
Check **Settings → Profile → Notifications**. On a shared mailbox, most alerts about the mailbox go to its owner, not to members. See [Every kind of notification](/help/06-notifications#every-kind-of-notification).

**I changed my password and got signed out everywhere.**
That's on purpose: changing or resetting your password signs out every device. Sign in again with the new password.

**An approval has been waiting a long time.**
The current approver gets a reminder halfway through. If nobody acts, it expires after 72 hours by default, and the draft can then be sent by hand. If the approver was removed from the mailbox, the approval is cancelled straight away and the draft goes back to Drafts.

**An attachment won't attach.**
Each email can have up to 10 files, 3 MB in total. Send big files as a link, for example from Google Drive or OneDrive.

**A document won't upload.**
Check the file type is one of: PDF, Word (DOCX), TXT, Markdown, HTML, CSV, Excel (XLSX), JSON, XML, EML or MSG. If a supported file still fails, the upload service may be down; ask whoever runs the app.

## Signing in

**I forgot my password.**
On the sign-in page, click **Forgot password?** and follow the email you receive. The link works for 1 hour. Check your spam folder if it doesn't arrive within a few minutes. See [Security](/help/10-settings-security#forgot-your-password).

**I signed up with Google or Microsoft and don't have a password.**
Use **Continue with Google** or **Continue with Microsoft** to sign in. To set a password as well, go to **Settings → Security**, leave **Current password** empty, type a new one and click **Update password**.

**I didn't get the verification email.**
Check spam, then go to **Settings → Profile** and click **Resend verification**.

**I think someone else is using my account.**
Go to **Settings → Security**, click **Sign out everywhere**, sign in again and change your password straight away. Then check **Active sessions** for anything you don't recognise.

## Sending

**Can I unsend an email?**
No. Once sent, it's gone, as in Gmail or Outlook. Automatic AI replies can have an **Undo window**, set by the owner under **Automation**, during which they can be cancelled.

**Did my email actually send?**
Look in the **Sent** folder. If sending failed, you'll see an error message, and your text stays in the box so you can try again.

**Where are my drafts?**
In the **Drafts** folder in **Inbox**. Drafts saved here are kept in the app and don't appear in your Gmail or Outlook drafts.
