# Enterprise AI Pipeline — Gap Analysis & Coverage Plan

Source vision doc: [`apps/ai/addd.md`](../apps/ai/addd.md) — a target-state architecture for the AI processing pipeline (ingestion → parsing → preprocessing → routing → specialized agents → orchestration → validation → send → post-processing → analytics/learning). This doc compares that target against what's actually built today, then lays out what covering the gap would actually take.

**This is not the same scope as `v3.0` in [`v2.0-plan.md`](./v2.0-plan.md).** v3.0 there is mostly infrastructure/enterprise-readiness (Multi-tenancy, RBAC/SSO/Audit Logs, Integrations, Analytics, multi-step Approval Chains). This doc is about the AI pipeline's own sophistication — CRM, multi-agent orchestration, output validation, a learning loop — which is a different (and in places larger) body of work. Where the two overlap (Analytics, Approval Chains) that's called out explicitly below rather than double-planned.

**How to read the status column:** ✅ Built · 🟡 Partial (something exists but doesn't do what the name implies) · ⬜ Not started.

**Update:** the whole "Small" list (language detection, PII detection, wiring `summarize` into the pipeline, OCR), a minimal version of the "Medium" output validation pipeline (output-side PII scan + a second-LLM-call "does this reply address the thread" check, both gating auto-send), and CRM v1 with a Settings UI panel (`apps/api/src/modules/crm` — structured `Contact` records, member-accessible CRUD, `lastContactedAt` auto-updated by the pipeline on an existing match) have all since shipped — see §2–§4, §6, §7 below. §1's Deduplication/Metadata extraction and §3's Spam detection also turned out to already be complete on closer inspection (the original audit undersold them) — see their rows. Document language detection (`Document.language`, via `langdetect`) has also shipped, closing §3's one remaining doc-side gap. Only multi-agent orchestration, the learning pipeline, and confidence scoring remain — see "What needs to be covered" below for why each is blocked on a decision rather than just unbuilt.

---

## 1. Email ingestion & parsing

| Item | Status | Evidence |
|---|---|---|
| Sync from Gmail/Outlook/IMAP | ✅ | Polling (not webhook) — BullMQ repeatable job every 5 min, `QueueService.scheduleBackgroundSync` → `EmailSyncService.syncAccount` |
| Deduplication | ✅ | Upserts keyed on `providerMessageId`/`providerThreadId` — the correct, standard mechanism (matches how Gmail/Outlook/IMAP clients dedup universally). "No cross-account dedup" was a mischaracterization: two connected accounts both receiving the same physical email correctly show it twice, once per mailbox — that's how every multi-account client behaves, not a gap. |
| Header/body/attachment/thread parsing | ✅ | Provider clients normalize into a common shape; threads tracked via `EmailThread` |
| Metadata extraction | ✅ | Headers/participants/dates plus `bulkMailSignals` (List-Unsubscribe, Precedence, Auto-Submitted, ESP signature, sender-pattern) computed at sync time (`bulk-mail.util.ts`) — combined with entity extraction and classification (§3), this covers what "metadata extraction" was really asking for. No structured attachment list (filename/size/type) is extracted at sync time — attachments only get parsed when a user explicitly uploads one for RAG (§2) — but nothing currently needs that data, so it's not tracked here as an open gap. |

**Verdict:** solid, and both previously-flagged partials turned out to be complete on inspection — the "gaps" were audit mischaracterizations, not missing code. Webhook-based sync (vs. 5-min polling) is the only real potential upgrade, and only matters if near-real-time processing becomes a requirement.

## 2. Attachment / document processing

| Item | Status | Evidence |
|---|---|---|
| OCR (scanned/image docs) | ✅ | `_split_pdf` falls back to `pytesseract` (rasterized via pdfplumber's `page.to_image()`, no poppler/ImageMagick needed) when a page's text layer is empty; `DocumentMeta.parser` records `"pdf+ocr"` when it fired |
| Text extraction (PDF/DOCX/+) | ✅ | Also html/md/csv/xlsx/json/xml/eml/msg — broader than the vision doc asks for |
| Chunking | ✅ | Structure-aware (headers/tables/pages) with token-estimated sizes |
| Embedding + vector DB | ✅ | pgvector, stored on `DocumentChunk.embedding` |

**Verdict:** strong across the board now, including OCR.

## 3. AI preprocessing

| Item | Status | Evidence |
|---|---|---|
| Language detection | ✅ | `ClassificationSchema.language` (ISO 639-1) on the classify call → `EmailMessage.language`. `Document.language` (uploaded attachments) is now also populated — `langdetect` (pure Python, no system dependency) runs in `process_document` on a text sample, → `Document.language`. |
| Spam detection | ✅ | Two real, complementary layers: (1) deterministic, header-based `bulkMailSignals.automated` (List-Unsubscribe, Precedence, Auto-Submitted, ESP signature, sender-pattern) **excludes a message from sync entirely** before any AI call runs (`isBulkMail` in `email-sync.service.ts`) — this is the dedicated filter the original audit said didn't exist; (2) the classify call's `spam: bool` catches content-based spam that clears the header filter (no bulk headers, but still spam). |
| Intent/category classification | ✅ | Same classify call → `EmailMessage.category` |
| Urgency/priority detection | ✅ | Same call → `priority`, also used as a hard auto-send safety rail (`Urgent` never auto-sends) |
| Sentiment analysis | ✅ | Same call → `sentiment` |
| Entity extraction | ✅ | Separate `extract` capability — people/emails/phones/companies/dates/urls/tasks/meeting_requests |
| PII detection (input) | ✅ | `ClassificationSchema.contains_pii`/`pii_types` on the same classify call → `EmailMessage.containsPii`/`piiTypes` — informational only, nothing gates on it (the *output*-side PII check that does gate auto-send is new too, see §6 below) |
| Conversation/thread summarization | ✅ | `AiProcessingProcessor.summarizeThread` now calls the existing `summarize` capability automatically once a thread has 2+ messages, storing the result on `EmailThread.summary`/`summaryKeyPoints` |

**Verdict:** classification/sentiment/urgency/entities/language/PII/summarization are all now genuinely solid and drive real behavior (routing, auto-send gating, task creation).

## 4. Routing & agents

| Item | Status | Evidence |
|---|---|---|
| Workflow router | ✅ | `WorkflowRuleService.evaluate`/`executeActions` — category/priority/sender conditions → AUTO_REPLY/ASSIGN_TO/NOTIFY/REQUIRE_APPROVAL |
| Specialized agents (Calendar/Task/Support/Sales/CRM/Knowledge as separate executable units) | 🟡 — **this is the biggest conceptual gap** | `Agent` is `{name, systemPrompt, enabled}` — a system-prompt override on **one shared** `generateReply` call. There is no per-agent tool access, no parallel execution, no agent-specific logic. "Calendar Agent" in the vision doc implies something that checks availability and creates events as part of answering a message; today, calendar scheduling is a **separate, human-triggered flow** (`MeetingSchedulingService`), not something a "Calendar Agent" invokes mid-reply. |
| CRM functionality | 🟡 | v1 shipped: `Contact` model (`apps/api/src/modules/crm`) — structured, member-accessible, user-created records (email/name/company/phone/notes/tags/status), auto-updated `lastContactedAt` from the pipeline, plus a Settings UI panel (`ContactsPanel`). Still missing: pipeline/deal stages, lead qualification, pricing lookup |
| Knowledge Agent / RAG search+rerank | ✅ | Real pipeline: pgvector cosine search with metadata filtering, then MMR re-ranking over a wider candidate pool |

**Verdict:** the Workflow Router and RAG pipeline are genuinely built and load-bearing. "Specialized agents" as the vision doc means them — separate units with their own tools, running in parallel, feeding a shared aggregator — do not exist. Today's "Agent" is a persona/tone layer on top of one reply call, not an orchestration primitive. CRM now has a real data layer (v1), but nothing resembling a "CRM Agent" invoking it mid-reply — that's downstream of multi-agent orchestration, still not started.

## 5. Orchestration & LLM

| Item | Status | Evidence |
|---|---|---|
| Prompt construction (system + tenant + history + RAG + workflow-results merge) | 🟡 | Simpler in practice: `SystemMessage` (default `reply.md` or an agent's override) + one `HumanMessage` per thread email + one optional trailing instruction block (contact-memory facts + RAG snippets). No "tenant prompt" layer (no multi-tenancy yet — see v3.0), no structured "workflow results" injection beyond the agent override itself. |
| Multi-provider LLM routing | ✅ | `LLM_PROVIDER` config switches among **6** providers: OpenAI, Google/Gemini, Anthropic/Claude, Groq, Ollama (local), OpenRouter — actually exceeds the vision doc's 4 |

**Verdict:** LLM routing is already ahead of the vision doc. Prompt construction is simpler than the target but functional — the gap is really "no workflow-results aggregation" because there's no multi-agent execution to aggregate (see §4).

## 6. Validation & decision

| Item | Status | Evidence |
|---|---|---|
| Hallucination check (thread-grounding) | 🟡 | Not a dedicated hallucination detector, but `apps/ai/app/capabilities/validate_reply` — a second LLM call — checks whether the draft addresses the thread and flags unsupported claims/commitments not in it; gates auto-send in `AiProcessingProcessor` |
| Policy validation | ⬜ | Nothing |
| Grammar check | ⬜ | Nothing |
| Tone validation | ⬜ | Nothing |
| PII validation (on output) | ✅ | `scanOutputForPii` (deterministic regex — SSN/account-number shapes only, deliberately not phone/email since those routinely appear legitimately in signatures) runs on every generated reply and hard-blocks auto-send if it fires, regardless of what the matched rule says |
| Confidence score | ⬜ | Auto-send vs. draft is still a **rule match plus hard rails** (urgent priority, output PII, thread-addressing), not a numeric score |
| Human approval/review | 🟡 | No dedicated approve/reject flow with state — a non-auto-sent reply just lands as an ordinary Draft, editable/sendable/deletable through the same UI as any manual draft |

**Verdict:** the two cheapest, highest-value checks (output PII, thread-addressing) now gate every auto-send decision — see `AiProcessingProcessor`'s `outputPiiScan`/`validateReply` rails, evaluated cheapest-first so the extra LLM call only runs when it's genuinely the last thing standing between a reply and auto-send. Policy/grammar/tone validation and a real numeric confidence score are still open — worth revisiting if the two checks above turn out insufficient in practice, but not blocking anything today.

## 7. Post-processing

| Item | Status | Evidence |
|---|---|---|
| Thread/message update | ✅ | `ComposeService.persistSentMessage` |
| Lightweight audit trail | 🟡 | `generationMetadata` (provider/model/usage/RAG-used/contact-memory-used) stored per sent message — real, but not a dedicated audit-log system with its own queryable history (that's v3.0 Enterprise Features scope) |
| Calendar update | 🟡 | Real, but only for meeting requests, and only via the opt-in `autoSchedule` (off by default) — not a general "every send touches the calendar" step |
| Task update | ✅ | `TasksService.createFromExtraction` |
| CRM update | ✅ | `ContactService.touchLastContacted` — best-effort, runs per processed message, updates `lastContactedAt` on an existing matching Contact (never creates one) |
| Notification | 🟡 | Real for sync events / workflow NOTIFY actions / daily digest — not fired on every send |

**Verdict:** mostly built for what the app actually does today (email + tasks + optional calendar + CRM's lastContactedAt). Universal notification (on every send, not just NOTIFY-action/digest) is the one remaining gap here, and it's a small addition, not independent work.

## 8. Analytics & learning

| Item | Status | Evidence |
|---|---|---|
| Cost/token/latency/accuracy analytics | 🟡 | Token usage is captured and stored per message (`generationMetadata`); no aggregation, cost computation, latency tracking, or accuracy metrics anywhere | 
| Learning pipeline (feedback dataset, prompt optimization, KB auto-update, model evaluation) | ⬜ | Nothing |

**Note:** Analytics is already **v3.0 scope** in `v2.0-plan.md` — don't double-plan it here. The learning pipeline is not mentioned anywhere else and would be new scope.

---

## What needs to be covered — by size

**Small (days, not a new subsystem) — ✅ all shipped:**
- ✅ Language detection — `ClassificationSchema.language`
- ✅ PII detection (input side) — `ClassificationSchema.contains_pii`/`pii_types`
- ✅ `summarize` wired into the automated pipeline — `AiProcessingProcessor.summarizeThread`
- ✅ OCR — `pytesseract` fallback in `_split_pdf` when a page's text layer is empty

**Medium (a real feature, scoped like §2/§3/§4 were this session):**
- ✅ **Output validation pipeline (minimal version)** — shipped: output-side PII regex scan (`scanOutputForPii`) + a second-LLM-call thread-addressing check (`validate_reply` capability), both hard-gating auto-send, cheapest-first. Grammar/tone/policy checks could still layer on incrementally if the two shipped checks turn out insufficient in practice.
- **Confidence scoring** — still not started; would let auto-send decisions be more than binary rule-match + hard rails, but needs a defined source (self-reported by the LLM? a second classifier?) before it's worth building.

**Large (genuinely new subsystems, each deserving its own plan doc before implementation, same way v2.0's four areas each got scoped separately):**
- ✅ **CRM v1 shipped** (contact records + Settings UI panel — see §4/§7) — **still open:** pipeline/deal stages, lead qualification, pricing lookup
- **Multi-agent parallel orchestration** — turning "Agent" from a prompt override into actual separate units (Calendar/Task/Sales/CRM/Support) that can each run, return structured results, and feed a real aggregator. This is an architecture change to `AiProcessingProcessor`/`reply` graph, not an incremental addition — worth its own design pass (parallel execution + aggregation + failure handling per agent all need real decisions). Would be the thing that actually wires the new CRM data into a reply, e.g. via a "CRM Agent."
- **Learning pipeline** — feedback capture, prompt optimization, auto-updating the knowledge base, model evaluation. Depends on having enough real usage data to be worth building at all; premature before the app has real production traffic.

**Already planned elsewhere — don't duplicate:**
- Analytics (cost/latency/accuracy dashboards) — v3.0, `v2.0-plan.md`
- Structured human approval/review state machine — overlaps with v3.0's "True multi-step Approval Chains"
- Audit log as its own queryable system — v3.0 Enterprise Features

## Recommended next step

Small, Medium, and CRM v1 (data layer + UI panel) are all done. What's left: multi-agent orchestration, the learning pipeline, and confidence scoring (blocked on a decision — where does the score come from). Multi-agent orchestration and the learning pipeline each still deserve their own short scoping pass before any code, the same way each of v2.0's four sections got one — multi-agent orchestration in particular is an architecture change to `AiProcessingProcessor`, not an incremental addition.
