← [Back to index](/help)

# Settings → Calendars

## What it is

Connects your Google Calendar or Outlook Calendar so the app knows when you're busy. With a calendar connected, the app can:

- **Offer meeting times** that don't clash with your diary: [Propose times](/help/02-inbox#meeting-requests-propose-times) on an email, or [Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) on a task.
- **Add the meeting to your calendar** once a time is agreed, and optionally send the other person an invitation.
- **Write more realistic replies** to meeting requests ("I have some flexibility this week"). See [Calendar-aware replies](/help/07-settings-accounts#calendar-aware-replies).

Without a calendar, everything else in the app still works. You just won't get meeting-time help.

> **This is a separate connection from your mailbox,** even if it's the same Google or Microsoft account. Connecting Gmail doesn't connect your Google Calendar, so do both if you want both.

## Where to find it

**Settings → Calendars**, in the menu on the left. On a phone, tap **☰** at the top left first.

## How to connect

1. Click **Connect Google Calendar** or **Connect Outlook Calendar**.
2. Google's or Microsoft's sign-in page opens. Sign in with the account whose calendar you want to use.
3. Allow the app to see and add calendar events.
4. You come back with a message such as *"Connected 1 calendar."*
5. The calendar appears in the list with its email address. The first one you connect is marked **Primary**.

## What the app does with your calendar

| It does | It doesn't |
|---|---|
| Look at which times you're **busy** or **free** | Read, change or delete your existing events |
| Add a new event **when you click Create event or Confirm & schedule** | Add anything on its own, without your click |
| Send an invitation **only if you tick Invite** | Share your calendar with anyone |

Only your main calendar is used: the default one in that Google or Microsoft account. Other calendars you've created or subscribed to inside it are not checked, so busy times that only appear there won't be avoided.

If you connect more than one calendar, the app uses the one marked **Primary**, which is the first one you connected. To use a different one, disconnect the others.

## How meeting times are chosen

When you click **Propose times** on a meeting request, the app:

1. Reads the email to understand what was asked for, such as *"Tuesday afternoon"* or *"a quick 15-minute call"*. If it can't tell, it offers the next free times, 30 minutes each.
2. Looks at your calendar for the next **two weeks**.
3. Picks **3 free times**:
   - on weekdays, between **9:00 and 17:00** in your timezone
   - at least **one hour** from now
   - starting on the hour or half hour
   - spread out: two times on the same day are at least two hours apart
4. Writes them into your reply, also in the other person's timezone if their email says where they are.

If your calendar has no free time in working hours over the next two weeks, the app says so and offers nothing.

**Example:** your calendar is busy on Tuesday from 13:00 to 14:00. Someone asks for *"Tuesday afternoon"*. The app offers Tuesday at 12:00, 14:00 and 16:00, not 13:00.

> **Times look wrong?** The app uses the timezone in [Settings → Profile](/help/09-settings-profile). If it's wrong, every time it offers will be off. Click **Use this device's** there and save.

## Checking your availability

**How:** click **Check availability (next 7 days)** on a connected calendar.

**What happens:** you see a list of the times you're busy over the next 7 days, such as *"Aug 10, 2026, 2:00 PM – Aug 10, 2026, 2:30 PM"*. If nothing is booked, it says *"No busy intervals in the next 7 days."* It's a handy way to confirm the app sees your calendar correctly. Nothing is created or changed.

## Disconnecting

**How:** click **Disconnect** on the calendar, then confirm.

**What happens:** the app can no longer see your busy times or add events. Meetings it already added stay in your calendar, because they belong to your calendar, not to the app. Meeting-time features stop working until you connect a calendar again.

## Troubleshooting

- **A busy time wasn't avoided.** Check the event is in your main calendar, not a secondary one, and that it's marked as **Busy**, not **Free**, in Google or Outlook.
- **"No free time" when you know you're free.** Your timezone may be wrong, or your free time may all be outside 9:00 to 17:00 on weekdays.
- **The calendar stopped working.** Disconnect it and connect it again. This happens if you changed your Google or Microsoft password, or removed the app's access there.
