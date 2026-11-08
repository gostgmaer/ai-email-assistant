# End-to-end test report: 2026-11-08

**Result: 70 of 73 checks passed.** The bugs found are now fixed; see "Fixes" below. The 3 failures are two access-control bugs, both about what happens after a member is removed from a shared account:

1. A removed member can still see and decide on approvals for that account.
2. Threads assigned to a removed member keep showing them as the assignee.

Everything else worked as expected in the browser and through the API.

## How this was tested

- **Browser:** headless Chrome driven by Playwright, at 1280×900 for desktop and 360×800 for phone.
- **Stack:** the local Docker stack (web on `:3001`, API on `:3000`, AI service, worker, file service). It included the uncommitted phone layout change to the thread page.
- **Users:** three throwaway users created for the run and deleted afterwards:
  - an **owner** of a made-up IMAP account, `alex@northwind.example.com`
  - a **member** invited to that account
  - an **outsider** with no access
- **Data:** 9 made-up threads, 3 tasks, a meeting proposal, AI draft outcomes and 2 suggestions.
- **AI:** real AI calls (summary, reply draft, rewrite, Ask, document indexing).
- **No real email:** nothing was sent and no real mailbox was touched. The demo account has no stored credentials, so it can't send.
- **Check counts:** where the first run failed because of a mistake in the test script, the step was fixed and run again. The table shows the final result, and the Notes column says when a retry was needed.

## Results by area

| Area | Check | Result | Notes |
|---|---|---|---|
| Auth | Wrong password shows an error and stays on the login page | ✅ | |
| Auth | Log in with the correct password | ✅ | |
| Auth | Register and forgot-password pages render | ✅ | Forms were not submitted |
| Inbox | List shows the 7 inbox threads with triage chips | ✅ | |
| Inbox | **Needs reply** chip filters to 3 threads | ✅ | |
| Inbox | Search from the top bar ("invoice") | ✅ | |
| Inbox | Sent folder shows the sent thread | ✅ | |
| Inbox | Priority filter | ✅ | Any, Urgent, High, Medium, Low |
| Thread | Messages, meeting card and reply box show | ✅ | |
| Thread | Add and delete an internal note | ✅ | |
| Thread | **Summarize** with AI | ✅ | Summary saved to the thread. First run's script failure was its own selector |
| Thread | **AI Reply** drafts text into the reply box | ✅ | 162-character draft, not sent |
| Thread | **Create event** with no calendar connected | ✅ | Shows an error, creates nothing |
| Thread | Snooze, find it under **Snoozed**, unsnooze | ✅ | |
| Thread | Newsletter thread shows the unsubscribe bar | ✅ | Not clicked |
| Compose | Save a draft, and it appears in **Drafts** | ✅ | Not sent |
| Compose | **Rewrite with AI** ("Improve writing") | ✅ | "hey can u send the invoice asap thx" became "Could you please send the invoice as soon as possible? Thanks." |
| Ask | "What budget did Tom mention for the renewal?" | ✅ | The answer said 12,000 euros, which is correct |
| Waiting | The waiting thread is listed and a reminder can be set | ✅ | |
| Tasks | Pending tasks are listed; marking one done moves it to **Done** | ✅ | |
| Suggestions | Approve one and reject the other | ✅ | Approving created a workflow rule |
| Suggestions | **Check now** runs | ✅ | |
| Insights | Numbers show and **Update now** works | ✅ | |
| Documents | Upload a `.txt` file and wait for processing | ✅ | Status INDEXED |
| Documents | Search finds the uploaded content ("30 days") | ✅ | |
| Approvals | A pending approval shows in the queue and can be rejected with a note | ✅ | |
| Help | Index lists 14 pages, and the Inbox help page has no broken images | ✅ | |
| Accounts | The Members, Contacts, Writing style, Workflows, Automation, Activity, Agents, Integrations, Sync filters and Policy panels all open | ✅ | 10 checks, one per panel |
| Accounts | Invite a registered user as a member | ✅ | |
| Accounts | Invite an unregistered email | ✅ | Shows "No user with that email has an account here yet" |
| Accounts | Create an agent from the Customer Support template | ✅ | |
| Accounts | Create a workflow rule, test it, save it | ✅ | An empty condition is refused with "condition.value must be a non-empty string", which is the intended check |
| Accounts | Integrations panel offers Slack, Teams and HubSpot | ✅ | Not connected |
| Accounts | Policy: add a blocked phrase and save | ✅ | |
| Calendars | Google and Microsoft connect options show | ✅ | Not connected |
| Profile | Edit job title, save, revert | ✅ | |
| Profile | Toggle a notification preference; it is kept after reload | ✅ | |
| Security | Wrong current password is refused | ✅ | |
| Security | Active sessions are listed and one can be revoked | ✅ | |
| Notifications | Bell opens the list | ✅ | |
| Roles | Member can list and open shared threads | ✅ | |
| Roles | Member can add a note, save a draft, snooze and assign | ✅ | 3 checks |
| Roles | Member is blocked from owner-only actions | ✅ | 403 for: rename account, invite, create workflow rule, create agent, connect Slack, change writing style, disconnect (7 checks) |
| Roles | Member's Accounts page shows only Sync now, Members, Contacts and Writing style | ✅ | |
| Roles | Outsider can't open the account's threads, messages, members, rules, agents, insights or approvals | ✅ | 403 everywhere. A thread list filtered to that account returns an empty list (200) rather than 403; no data leaks |
| Roles | Requests without a login are refused | ✅ | 401 |
| Roles | Removed member loses access to threads | ✅ | 403 |
| Roles | **Removed member no longer sees the account's approvals** | ❌ | **Bug:** still listed, including the draft and account details |
| Roles | **Removed member can no longer decide on an approval** | ❌ | **Bug:** reject returned 201 and the chain became REJECTED. Approving the last step would send the email |
| Roles | **Removing a member clears their thread assignments** | ❌ | **Bug:** the thread stays assigned to the removed member |
| Sessions | **Sign out everywhere** revokes all refresh tokens | ✅ | Refresh is refused afterwards (401) |
| Sessions | Signing out in the browser ends the session | ✅ | Going to `/inbox` afterwards redirects to `/login` |
| Phone | Menu opens at 360px | ✅ | |
| Phone | Thread scrolls as one column | ✅ | Header stays pinned while scrolling to the reply box; no sideways scroll |

## Bugs found

### 1. Removed members can still act on approvals (security)
**Where:** `apps/api/src/modules/approval/services/approval-chain.service.ts`, in `listPendingForUser` and `decide`.

**What happens:** neither method checks that the user is still a member of the account. They only check that the user is the approver on the current step.

**Steps to reproduce:**
1. Make a member the approver on a pending chain.
2. Remove the member from the account.
3. As the removed member, call `GET /approval-chains/mine`. The chain is still listed, with the draft and account details.
4. Call `POST /approval-chains/:id/reject`. It succeeds.

**Impact:** a removed member can still read the draft. They can also approve it, and approving the final step sends the email. If they never act, the chain is stuck waiting on them, and the draft can't be sent by hand while it waits.

**Suggested fix:**
- Check account membership in both methods.
- When a member is removed, cancel or reassign their pending steps.

### 2. Removing a member leaves thread assignments behind
**Where:** `EmailAccountService.removeMember`.

**What happens:** the member's access row is deleted, but `EmailThread.assignedToUserId` still points at them. The thread shows as assigned to someone who can no longer open it.

**Suggested fix:** in the same transaction, clear `assignedToUserId` for that user on that account's threads.

## Fixes (same day, after this run)

Both bugs above are fixed. The fixes are uncommitted.

- **`approval-chain.service.ts`:**
  - The approvals list only includes chains on accounts the user is still a member of.
  - Approve and reject check membership before deciding, and return 403 if the user isn't a member.
- **`email-account.service.ts` (`removeMember`):** in one transaction, it now:
  - deletes the membership
  - clears that person's thread assignments on the account
  - cancels pending approval chains that still have a step waiting on them

  A cancelled chain no longer blocks sending the draft by hand. Deleting a draft already cancels its chain the same way, and the compose page already shows "This draft's approval chain was cancelled."

**Verification:**
- **Unit tests:** 4 new ones. The full API suite passes: 718 tests in 70 suites.
- **Type check:** passes.
- **Lint:** clean on the changed code. The changed spec files still have 6 errors that were already in their committed versions.
- **Live re-run:** the removed-member scenario was repeated on the rebuilt API, and all 8 checks passed:
  - Removal clears the assignment and cancels the chain.
  - The removed member's approvals list no longer shows it.
  - Their reject returns 403 and leaves the chain unchanged.
  - A current member can still approve their own step, which passes it to the next approver without sending anything.

## Behaviour worth knowing (not failures)

- **Access tokens outlive sign-out.** After **Sign out everywhere**, the existing access token kept working (`GET /users/me` returned 200) until it expires (`JWT_EXPIRES_IN`). Refresh is refused straight away. This is the usual tradeoff of stateless tokens; keep the expiry short.
- **Workflow rule form with an empty condition.** Clicking **Test rule** on a new rule before filling in a condition gives a validation error. That's the intended check, but the default empty condition row could be friendlier.
- **Outsider's filtered thread list.** It returns an empty list instead of 403. No data leaks.

## Not covered by this run

These need real provider accounts, your consent, or a real device:
- Connecting Gmail, Outlook, IMAP or calendars; real sync; sending real email.
- **Unsubscribe**, **Clean up** newsletters, and real calendar events and invites.
- Connecting Slack, Teams or HubSpot. HubSpot's client ID and secret are empty in `apps/api/.env`.
- Emails sent by the app (verification, password reset, change of email) and whether they arrive. Successful password change and account deletion weren't run either.
- **Sync now**, **Writing style → Rebuild**, the jobs/queue endpoints, and attachments.
- Real phones and touch, Safari and Firefox; widths other than 360px and 1280px.

## Cleanup

The three demo users, the demo account and all its data were deleted afterwards, including the uploaded document (deleted through the API) and the AI draft outcome rows. The database check returned 0 for every item.
