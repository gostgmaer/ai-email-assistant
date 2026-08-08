← [Back to index](/help)

# Documents

## What it is

A knowledge base the AI can pull facts from when drafting replies ("grounding" / RAG — Retrieval-Augmented Generation), so replies can accurately reference your product docs, pricing sheets, policies, contracts, etc., instead of the AI guessing.

## Where to find it

**Documents** in the left sidebar.

---

## Uploading a document

**Supported types:** PDF, DOCX, TXT, Markdown, HTML, CSV, XLSX, JSON, XML, EML, MSG.

**How to use it:**
1. Click **Choose File** and pick a file from your computer.
2. Click **Process document**.
3. Processing happens in the background: the file is uploaded, text is extracted, split into chunks, and each chunk is embedded (turned into a vector) using the configured embedding model (`google/gemini-embedding-001` in this deployment).
4. Once done, the file appears in the list below with its chunk count, file type, and embedding model.

**Example:** uploading `refund-policy.pdf` — once processed it shows `2 chunks · PDF · google/gemini-embedding-001 · <date>`. From then on, if a customer emails asking about refunds, an AI-drafted reply can cite this document and the reply will carry a **"Grounded in your documents"** badge in the [Inbox](/help/02-inbox).

**Note:** uploading depends on a separate file-storage service being reachable. If uploads fail with an error, that background service may be down — this isn't something you fix from within this app.

## Searching documents

**Where:** the **Search** box above the document list.

**How to use it:**
1. Type a natural-language question into **"Ask something covered by your documents…"** — e.g. *"What's our refund window?"*
2. Optionally narrow with **Filter by category** and/or **Filter by file type** (e.g. `pdf`).
3. Click **Search**.
4. Results show the most relevant chunks across all your documents, ranked by similarity (`distance` — lower is a closer match), each labeled with which file and chunk it came from.

**Example:** searching *"what tables are in the CSV"* against a small `test.csv` returns the chunk:
> `test.csv — chunk 1 — page 1 — | name | role | department | ...`

## Deleting a document

**How:** click the red **Delete** button next to any document in the list.

**What happens:** the document and all its chunks/embeddings are removed immediately. Any past AI reply that already cited it keeps its "Grounded in your documents" badge and text (history isn't rewritten), but the AI can no longer draw on that document for future replies.

## What happens overall

- Documents are scoped to your account — every connected mailbox's AI replies can draw on the same shared document set.
- This is knowledge grounding only — uploading a document does not send anything to anyone by itself.
