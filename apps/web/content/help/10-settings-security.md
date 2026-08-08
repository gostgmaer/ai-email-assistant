← [Back to index](/help)

# Settings → Security

## What it is

Your password and a list of every device/browser currently signed in, with the ability to sign any of them out remotely.

## Where to find it

**Settings → Security** in the left sidebar (`/settings/security`).

## Changing your password

**How to use it:**
1. Enter **Current password** — leave this blank if you signed up via Google/Microsoft and have never set a password yet.
2. Enter **New password** — minimum 8 characters.
3. Click **Update password**.
4. A green *"Password updated."* confirmation appears, or a red error if the current password was wrong.

**Example:** if you originally signed up with "Connect Gmail" and never set a password, you can leave **Current password** blank the first time to set one — after that, it's required for future changes.

## Managing active sessions

**What it is:** every device/browser with a valid login session, shown with device label (or browser user-agent if no label), IP address, and when it was created. Your current session is marked **"This device."**

**How to use it:**
- To sign out one specific other device: click **Revoke** next to it.
- To sign out everywhere at once (including this device): click **Sign out everywhere**, top-right of the section.

**Example:** if you see a session from an unfamiliar IP address, click **Revoke** on that row immediately, then change your password.

**What happens:** revoking a session invalidates that device's refresh token — the next time that device tries to use the app, it's forced back to login.
