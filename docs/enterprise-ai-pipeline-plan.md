# Enterprise AI Pipeline — Gap Analysis & Coverage Plan

Source vision doc: [`apps/ai/addd.md`](../apps/ai/addd.md) — a target-state architecture for the AI processing pipeline (ingestion → parsing → preprocessing → routing → specialized agents → orchestration → validation → send → post-processing → analytics/learning). This doc compares that target against what's actually built today, then lays out what covering the gap would actually take.

**This is not the same scope as `v3.0` in [`v2.0-plan.md`](./v2.0-plan.md).** v3.0 there is mostly infrastructure/enterprise-readiness (Multi-tenancy, RBAC/SSO/Audit Logs, Integrations, Analytics, multi-step Approval Chains). This doc is about the AI pipeline's own sophistication — CRM, multi-agent orchestration, output validation, a learning loop — which is a different (and in places larger) body of work. Where the two overlap (Analytics, Approval Chains) that's called out explicitly below rather than double-planned.

**How to read the status column:** ✅ Built · 🟡 Partial (something exists but doesn't do what the name implies) · ⬜ Not started.

**Update:** the whole "Small" list, CRM v1 with a Settings UI panel, and multi-agent orchestration's Option A (CRM data grounding replies) have all shipped. §1, §3, §6, and §7 are now fully built end to end — §6's five gaps (Policy/Grammar/Tone/Confidence/Hallucination) all closed by extending the existing `validate_reply` LLM call rather than adding new round trips (hallucination detection split into its own `unsupported_claims` field, independent of topic-relevance); §7's Notification now fires on every auto-send. Of the remaining Partial rows, three are deliberately out of v2.0 scope (Analytics/Audit trail/Approval Chains — moved to v3.0 earlier this session) and three are blocked on a real decision not yet made (multi-agent orchestration's Option B, CRM deal stages/pricing needing a real data source). Only §4's multi-agent Option B and the learning pipeline are listed as "next" below.

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
| Specialized agents (Calendar/Task/Support/Sales/CRM/Knowledge as separate executable units) | 🟡 | `Agent` is still `{name, systemPrompt, enabled}` — a system-prompt override on **one shared** `generateReply` call, no per-agent tool access or parallel execution. What's new: the reply's context is now enriched from multiple real sources (contact-memory, RAG documents, and CRM `Contact` data — see `docs/multi-agent-orchestration-plan.md` §A), so it's closer to "orchestrated" than a bare persona override, even though it's still one LLM call, not parallel agents feeding an aggregator. |
| CRM functionality | 🟡 | v1 shipped: `Contact` model (`apps/api/src/modules/crm`) — structured, member-accessible, user-created records (email/name/company/phone/notes/tags/status), auto-updated `lastContactedAt` from the pipeline, plus a Settings UI panel (`ContactsPanel`). Still missing: pipeline/deal stages, lead qualification, pricing lookup |
| Knowledge Agent / RAG search+rerank | ✅ | Real pipeline: pgvector cosine search with metadata filtering, then MMR re-ranking over a wider candidate pool |

**Verdict:** the Workflow Router and RAG pipeline are genuinely built and load-bearing. "Specialized agents" as the vision doc means them — separate units with their own tools, running in parallel, feeding a shared aggregator — do not exist, and won't without the architecture decision in `docs/multi-agent-orchestration-plan.md`. What's shipped instead (its Option A): CRM data now actively grounds replies the same way contact-memory/RAG already did — real value, without the execution-model risk. Calendar Agent (Option B) is the next scoped piece if wanted; it needs one more decision first (can a reply suggest a specific time without human review of availability, or only offer to check).

## 5. Orchestration & LLM

| Item | Status | Evidence |
|---|---|---|
| Prompt construction (system + tenant + history + RAG + workflow-results merge) | 🟡 | Simpler in practice: `SystemMessage` (default `reply.md` or an agent's override) + one `HumanMessage` per thread email + one optional trailing instruction block — now three real sources merged in (contact-memory facts, RAG document snippets, CRM `Contact` data). No "tenant prompt" layer (no multi-tenancy yet — see v3.0), no structured "workflow results" injection from parallel agents (there are none yet — see §4). |
| Multi-provider LLM routing | ✅ | `LLM_PROVIDER` config switches among **6** providers: OpenAI, Google/Gemini, Anthropic/Claude, Groq, Ollama (local), OpenRouter — actually exceeds the vision doc's 4 |

**Verdict:** LLM routing is already ahead of the vision doc. Prompt construction is simpler than the target but functional — the gap is really "no workflow-results aggregation" because there's no multi-agent execution to aggregate (see §4).

## 6. Validation & decision

| Item | Status | Evidence |
|---|---|---|
| Hallucination check (thread-grounding) | ✅ | `validate_reply`'s `unsupported_claims: list[str]` — a dedicated, separately-tracked signal (split out from `addresses_thread`/`concerns`, which now only judge topic-relevance): every specific factual claim/commitment/number/date in the draft not supported by the thread. Hard-blocks auto-send if non-empty, independent of whether the reply is otherwise on-topic. |
| Policy validation | ✅ | `EmailAccount.prohibitedPhrases` (empty by default — mechanism only, this codebase doesn't invent an account's real business policy) + `scanOutputForPolicyViolations`, a deterministic case-insensitive substring check that hard-blocks auto-send if any configured phrase appears in the generated reply |
| Grammar check | ✅ | Folded into the same `validate_reply` call (no extra LLM round trip) — `grammar_issues: list[str]`, hard-blocks auto-send if non-empty |
| Tone validation | ✅ | Also folded into `validate_reply` — `tone_appropriate`/`tone_note`. Deliberately **not** a hard rail (more subjective than grammar — blocking on it risked over-holding good replies); logged as a warning instead so a mismatch is visible without silently killing auto-send |
| PII validation (on output) | ✅ | `scanOutputForPii` (deterministic regex — SSN/account-number shapes only, deliberately not phone/email since those routinely appear legitimately in signatures) runs on every generated reply and hard-blocks auto-send if it fires, regardless of what the matched rule says |
| Confidence score | ✅ | `validate_reply`'s self-reported 0-100 `confidence`, same call as thread-addressing/grammar/tone — hard-blocks auto-send below a chosen threshold (70, `REPLY_CONFIDENCE_AUTO_SEND_THRESHOLD`). LLM self-report was the chosen source (a second dedicated classifier was the alternative, not worth the added cost/complexity for a first pass) |
| Human approval/review | 🟡 | Deliberately not built further here — overlaps v3.0's "True multi-step Approval Chains"; a non-auto-sent reply still just lands as an ordinary Draft |

**Verdict:** every output-side check that can run without a second LLM call (PII, policy) is a hard rail; the ones that need `validate_reply`'s LLM judgment (thread-addressing, hallucination, grammar, confidence) are hard rails too, evaluated together in that one call rather than four separate round trips. Tone is the one deliberate exception — logged, not blocking, since it's the most subjective judgment of the set. Only human-approval workflow state (already out of scope, v3.0) remains open in this section — every other row is built.

## 7. Post-processing

| Item | Status | Evidence |
|---|---|---|
| Thread/message update | ✅ | `ComposeService.persistSentMessage` |
| Lightweight audit trail | 🟡 | `generationMetadata` (provider/model/usage/RAG-used/contact-memory-used) stored per sent message — real, but not a dedicated audit-log system with its own queryable history (that's v3.0 Enterprise Features scope) |
| Calendar update | ✅ | Only for meeting requests, only via opt-in `autoSchedule` (off by default) — this was a mischaracterization, not a real gap: a calendar update on every send (including e.g. a billing reply) wouldn't make product sense. Scoped correctly as-is. |
| Task update | ✅ | `TasksService.createFromExtraction` |
| CRM update | ✅ | `ContactService.touchLastContacted` — best-effort, runs per processed message, updates `lastContactedAt` on an existing matching Contact (never creates one) |
| Notification | ✅ | Now also fires on every auto-send (not just sync events/workflow NOTIFY/digest) — visibility into an autonomous action. Best-effort, never blocks the send. A drafted (non-auto-sent) reply doesn't get one — it's already visible in Drafts awaiting the same review. |

**Verdict:** fully built for what the app actually does today. Only the audit trail stays partial, and that's intentionally deferred to v3.0 Enterprise Features (a queryable audit-log system), not an oversight.

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

**Medium (a real feature, scoped like §2/§3/§4 were this session) — ✅ all shipped:**
- ✅ **Output validation pipeline** — output-side PII regex scan (`scanOutputForPii`), a deterministic policy-phrase scan (`scanOutputForPolicyViolations`, empty by default), and one `validate_reply` LLM call covering thread-addressing, grammar, tone, and confidence — all hard-gating auto-send except tone (logged, not blocking — the most subjective of the set), evaluated cheapest-first.
- ✅ **Confidence scoring** — `validate_reply`'s self-reported 0-100 confidence, hard-gating below a chosen threshold (70). LLM self-report was the decided source; a second dedicated classifier wasn't worth the added cost for a first pass.

**Large (genuinely new subsystems, each deserving its own plan doc before implementation, same way v2.0's four areas each got scoped separately):**
- ✅ **CRM v1 shipped** (contact records + Settings UI panel — see §4/§7) — **still open:** pipeline/deal stages, lead qualification, pricing lookup
- **Multi-agent parallel orchestration** — scoped in `docs/multi-agent-orchestration-plan.md`. Option A (✅ shipped — CRM data now grounds replies, no architecture change) was the cheap, safe slice. Option B (Calendar Agent + per-rule agent selection) is next if wanted, but needs a decision on how far into autonomous scheduling-suggestion behavior a reply should go. Option C (true parallel agent execution + aggregator) is explicitly not scoped yet — premature before B proves the shape is worth it.
- **Learning pipeline** — feedback capture, prompt optimization, auto-updating the knowledge base, model evaluation. Depends on having enough real usage data to be worth building at all; premature before the app has real production traffic.

**Already planned elsewhere — don't duplicate:**
- Analytics (cost/latency/accuracy dashboards) — v3.0, `v2.0-plan.md`
- Structured human approval/review state machine — overlaps with v3.0's "True multi-step Approval Chains"
- Audit log as its own queryable system — v3.0 Enterprise Features

## Recommended next step

Small, Medium, CRM v1, §1, §3, §6, §7, and multi-agent orchestration's Option A are all done. What's left, each blocked on a real decision rather than just unbuilt:
- **Multi-agent orchestration Option B** (Calendar Agent) — needs a decision: can a reply suggest a specific time without a human reviewing availability first, or should it only offer to check? See `docs/multi-agent-orchestration-plan.md`.
- **Learning pipeline** — needs real production traffic to be worth building; premature right now.
