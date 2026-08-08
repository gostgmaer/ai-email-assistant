# Multi-Agent Orchestration — Scoping (design only, no code yet)

This is the one item from [`enterprise-ai-pipeline-plan.md`](./enterprise-ai-pipeline-plan.md) §4 that's been deferred three times now, each time because it's an architecture change to `AiProcessingProcessor` — the pipeline this whole session's work (Workflow Router, output validation, CRM) is layered on top of. This doc exists so there's something concrete to react to instead of another open-ended "should I?" question.

## What "specialized agents" means in the vision doc vs. today

The vision doc (`apps/ai/addd.md`) describes Calendar/Task/Sales/CRM/Support/Knowledge agents as **separate executable units**: each runs (potentially in parallel), returns a structured result, and a **Workflow Result Aggregator** merges those results into the final reply prompt.

Today, `Agent` (`apps/api/prisma/schema.prisma`) is `{name, systemPrompt, enabled}` — a persona override on the **one shared** `generateReply` call. There's no per-agent tool access, no parallel execution, no aggregator. "Knowledge Agent" and "Task Agent" exist as *capabilities* (`DocumentsService.search`, `extractTasks`) but they're bolted onto `AiProcessingProcessor.processMessage()` as best-effort side calls, not addressable units a rule can select.

## Current pipeline, precisely (`AiProcessingProcessor.processMessage`)

```
classify
  → persistClassification
  → [spam? stop]
  → workflowRuleService.evaluate()        (decides matchedActions + which Agent's systemPrompt to use)
  → concurrently, best-effort:
      - extractTasks (→ TasksService)
      - summarizeThread (→ EmailThread.summary)
      - touchContactPromise (→ ContactService.touchLastContacted)
  → contactMemory (→ ContactMemoryService)
  → documentsService.search (RAG)
  → buildContextInstruction(related, contactMemory, documentMatches)   ← the closest thing to an "aggregator" today
  → generateReply(subject, thread, instruction, agentSystemPrompt)     ← ONE LLM call
  → scanOutputForPii (hard rail)
  → workflowRuleService.executeActions() + urgent-priority rail
  → validateReply (hard rail, only if the above passed)                ← SECOND LLM call, conditional
  → auto-send or draft
  → await [extractTasks, summarizeThread, touchContact]
  → markProcessed
```

The honest read: this already *is* a form of orchestration — several capabilities run concurrently and best-effort, their outputs get merged (`buildContextInstruction`), and a rule decides the persona. What's missing from the vision doc's version is (a) an agent actually **changing what it does** based on the message (not just contributing static context), and (b) a rule being able to say "run the Calendar Agent for this one," not just "use this system prompt."

## Three ways to close the gap, smallest to largest

### Option A — Enrich context, no architecture change (~1 day)

Add `Contact` lookup (already built, §CRM v1) to `buildContextInstruction`, the same way `contactMemory` and RAG document matches already get merged in: if the sender matches an existing `Contact`, include their name/company/status/tags/last-contacted in the instruction block the LLM sees.

- **Risk:** near zero. Same shape as three things already in that function.
- **Value:** a reply can now say "since you're already a customer..." or route tone based on `status`. This is most of what a "CRM Agent" would contribute in practice, without inventing an agent execution model.
- **Doesn't get you:** parallel execution, per-rule agent selection, anything Sales/pricing (no data source exists — see below).

### Option B — Formalize existing side-calls as "agents," add one real new one (~3-5 days)

Keep the current concurrent-best-effort shape (it already works, it's already tested), but:
1. Rename/reframe `extractTasks`, `summarizeThread`, RAG search, and Option A's contact lookup as a small internal `agents/` set with a common shape: `(context) => Promise<{ contributesToPrompt?: string; sideEffects?: () => Promise<void> }>`. Mostly a refactor of what exists, not new capability.
2. Add one genuinely new agent: **Calendar Agent** — check availability (`CalendarService.getFreeBusy`, already built) and, if the thread reads as a scheduling request, add a suggested time to the context block the reply cites — *not* auto-scheduling. `MeetingSchedulingService` stays the human-approval path for actually creating the event; this only lets the reply say "Tuesday at 2pm works for me" instead of "let me check my calendar," which today it can't do without a round trip.
3. `WorkflowRule`'s `AUTO_REPLY` action gains an optional `agents: string[]` (which of the formalized agents to run for this rule), defaulting to "all of them" so existing rules don't change behavior.

- **Risk:** moderate. New DB migration (`WorkflowAction` shape change), touches the rule-evaluation and reply-generation control flow, needs the same care the output-validation rails got.
- **Value:** the first genuinely new "agent capability" (calendar-aware replies), plus a real per-rule agent-selection mechanism the vision doc actually asked for.
- **Doesn't get you:** true parallel *execution* with independent LLM calls per agent (these still all feed one `generateReply` call) — that's Option C.
- **Sales/CRM pricing/deal-stage agents:** still blocked — see "What can't be scoped yet" below.

### Option C — Real parallel agent execution + aggregator (~2-3 weeks, own follow-up design pass)

Each selected agent runs as its *own* LLM call (or tool-using loop) in parallel, returns a structured result, and a genuine aggregator step assembles those into the final prompt — closest to the vision doc's diagram. This is the one that needs a dedicated design pass of its own before scoping further: parallel LLM calls multiply cost and latency per message, partial-failure semantics need real decisions (if the Calendar Agent times out, does the reply proceed without it, or hold for review?), and the aggregator's merge logic is itself a new prompt-engineering surface that needs eval, not just code.

Not scoping this further now — not worth the design cost until Option B's Calendar Agent proves the shape is worth it.

## What can't be scoped regardless of which option — real blockers, not deferrals

- **Sales Agent / pricing lookup** — needs an actual pricing/product data source. None exists in this codebase, and inventing placeholder pricing data would mean shipping a feature that answers real customer emails with fictional numbers. This isn't a scoping gap, it's a missing business input.
- **CRM deal/pipeline stages** — buildable (extend `Contact` or add a `Deal` model) but is new product surface, not part of "wiring agents into the reply," and deserves its own ask if wanted.
- **§5's "tenant prompt layer"** — needs multi-tenancy (v3.0), not built yet regardless of agent architecture.

## Recommendation

**Start with Option A now** (near-zero risk, real value, an hour of work) and **fold Option B's Calendar Agent in as the next scoped piece** if you want to keep going after that — it's the first thing that actually needs the "agent" concept to mean more than a prompt override, and it's small enough to design-review in one pass rather than needing its own doc. Hold Option C until B ships and there's a second real capability agent that justifies the parallel-execution machinery — building the aggregator for one agent is premature.
