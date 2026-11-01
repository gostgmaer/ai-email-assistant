← [Back to index](/help)

# Suggestions

## What it is

When AI drafts keep getting discarded or heavily rewritten, the app works out what's going wrong and proposes a specific fix. You see the evidence and decide. **Nothing changes until the account's owner clicks Approve.**

![The Suggestions page with two proposed rules, their evidence, and Approve and Reject buttons](/help-images/suggestions.png)

## Where to find it

**Suggestions** in the left sidebar. If you have more than one account, choose it at the top of the page.

The app checks once a week. The account's owner can click **Check now** to check straight away.

## What a suggestion can change

| Kind | What approving does | When it's offered |
|---|---|---|
| Add to an agent's instructions | Adds the sentence shown to that [AI agent's](/help/07-settings-accounts#ai-agents-personas) instructions | That agent's drafts are often rejected |
| Hold replies to a sender domain | Adds a rule so replies to `@vendor.com` wait for your review | Drafts to that domain are often rejected, and replies to it have been auto-sent |
| Hold replies to a category | Adds a rule so replies to that category of email wait for your review | Drafts in that category are often rejected, and replies in it have been auto-sent |

Drafts that are never auto-sent already wait for your review, so a hold rule wouldn't change anything for them and isn't offered.

## How to use it

1. Read the change at the top of the card: this is exactly what approving applies.
2. Read why it's suggested, and the counts below it.
3. Optionally open **See examples** to compare the AI's drafts with what was sent instead.
4. Click **Approve** to apply it, or **Reject** to hide it.

## Example

> **Add to the Support agent's instructions:**
> Never promise a refund; state that the billing team will review the request.
>
> 4 of 6 drafts promised refunds, and the reviewer removed that each time.
>
> Support: 6 reviewed, 4 discarded, 1 heavily edited · reasons: wrong facts (3)

Clicking **Approve** adds that sentence to the Support agent's instructions, so its later replies follow it.

## Help it learn: discard reasons

When you click **Discard** on an AI draft under a message, you can say why: **Wrong facts**, **Wrong tone**, **Shouldn't reply**, **Too long** or **Other**. It's optional: **Just discard** skips the question, and **Keep it** keeps the draft. These reasons show up as evidence on suggestions.

## What happens

- **When a pattern counts:** at least 3 drafts rejected in the last 30 days, making up at least half of those reviewed. A draft counts as rejected if it was discarded or heavily rewritten before sending.
- **Approving a rule:** it goes ahead of your other rules, so it decides before an auto-reply rule can. You can edit or delete it under [Workflow rules](/help/07-settings-accounts#workflow-rules).
- **Undoing an agent change:** edit the agent and remove the sentence.
- **Repeats:** the same idea isn't offered again for 90 days, whether you approved it, rejected it or haven't decided yet.
- **Who can do what:** any member of the account can read suggestions. Only the owner can check, approve or reject.
- **Stored text:** the text of rejected drafts is kept for up to 90 days to spot patterns, and is removed sooner if you disconnect the account.
