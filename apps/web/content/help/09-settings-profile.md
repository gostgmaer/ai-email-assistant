← [Back to index](/help)

# Settings → Profile

## What it is

Your personal account details: display name, email address, and account deletion.

## Where to find it

**Settings → Profile** in the left sidebar (`/settings/profile`).

## Changing your display name

**How:** type into the **Display name** field under the **Name** section, click **Save**. A "Saved" confirmation appears next to the button.

**Example:** changing it from blank to `Kishor Sarkar` updates how your name appears throughout the app (e.g. as the sender name on outgoing mail where applicable).

## Verifying your email

If your email isn't verified yet, an amber banner appears under **Email**: *"Your email isn't verified yet"* with a **Resend verification** link. Click it to get a new verification email; the button changes to "Sent" once triggered.

## Changing your email address

**How to use it:**
1. Click **Change email**.
2. Enter the **new email** address.
3. Enter your **current password** (if you have one set — see [Security](/help/10-settings-security)).
4. Click **Send confirmation**.
5. You'll see: *"Check the new address for a confirmation link."*
6. Open that link (from the new inbox) — it hits `/settings/profile?confirmEmailToken=...` automatically, and once processed shows *"Your email address has been updated."*

**What happens:** your login email doesn't actually change until you click the confirmation link sent to the *new* address — this prevents someone from hijacking your account by mistyping an email they don't control.

## Deleting your account (danger zone)

**Where:** the red **Danger zone** section at the bottom.

**How:** click **Delete account**, confirm the browser prompt (*"Delete your account? This cannot be undone."*).

**What happens:** this disconnects every connected mailbox and calendar, signs you out on every device, and cannot be undone. There is no recovery step in the app — treat this as genuinely permanent.
