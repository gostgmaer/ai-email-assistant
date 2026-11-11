← [Back to index](/help)

# Documents

## What it is

Files the AI can use for facts when it writes replies: your price list, refund policy, product guide, opening hours and so on. Without them the AI only knows what's in the email conversation, so it may guess. With them, it can answer *"What's your refund policy?"* correctly.

A reply that used one of your documents shows a **Grounded in your documents** label in the [Inbox](/help/02-inbox).

> **Only upload what you'd be happy for a customer to read.** The AI may quote any part of a document in a reply to anyone who emails you. Don't upload salaries, personal records, passwords or confidential contracts. See [Safe use guidelines](/help/16-safe-use-guidelines#what-to-share-with-the-ai).

## Where to find it

**Documents**, in the menu on the left.

---

## Uploading a document

**File types you can upload:** PDF, Word (DOCX), plain text (TXT), Markdown, HTML, CSV, Excel (XLSX), JSON, XML, and saved emails (EML, MSG).

**How to use it:**
1. Click **Choose File** and pick the file from your computer.
2. Click **Process document**.
3. Wait while the app reads it. A small file takes a few seconds, a long one a minute or two. While it works, the document shows a status label such as *processing*.
4. When it's ready, the status label goes away and the document shows how many **chunks** it was split into. A chunk is a short section of the file that the AI can look up on its own.

**Example:** you upload `refund-policy.pdf`. Once it's ready, a customer emails *"Can I get my money back after three weeks?"* The AI's draft reply quotes your actual 30-day policy, and shows the **Grounded in your documents** label.

**If it fails:** the label turns red and says *failed*. Check the file opens normally on your computer and is one of the types above. If uploads keep failing, the upload service may be down: ask whoever runs the app.

> **Tips for good documents:**
> - Keep them **up to date**. If your prices change, delete the old file and upload the new one, or the AI will quote old prices.
> - **Clear, plain text works best.** A scanned photo of a page can't be read; use the original file.
> - **One topic per file** is easier for the AI to use well than one huge file covering everything.

## Checking what the AI can find

**Where:** the **Search** box on the Documents page.

**How to use it:**
1. Type a question, such as *"How long do customers have to ask for a refund?"*
2. *(optional)* Narrow it with **Filter by category** or **Filter by file type** (for example `pdf`).
3. Click **Search**.
4. You see the sections of your documents that best match, closest match first, each with the file it came from.

**Why use it:** it shows you what the AI would find for that question. If the right section doesn't come up, the AI won't use it either, so add or improve a document.

**Example:** searching *"refund"* shows the paragraph from `refund-policy.pdf` that explains the 30-day window.

## Deleting a document

**How:** click the red **Delete** button next to the document, and confirm.

**What happens:** the AI stops using it straight away. Replies already sent aren't changed.

## Good to know

- Your documents are shared across all your mailboxes. Every mailbox's AI replies can use them.
- Uploading a document never sends anything to anyone by itself.
