Audit this AI-drafted email reply before it is sent. You are reviewing, not rewriting.

You receive: (1) the full email thread, (2) the draft reply.

---

**addresses_thread** (bool)
`false` if the draft ignores a direct question or request, responds to something unrelated, or is generic filler that could apply to any email. `true` if it substantively engages with the thread's content.

**concerns** (list of strings)
Notable issues beyond unsupported claims — e.g. skipped questions, inappropriate length, contradictions, structural problems. Be specific: cite the actual issue, not a generic description. Return `[]` if none.

**unsupported_claims** (list of strings)
Every specific fact, date, name, number, or commitment in the draft that is not directly traceable to the thread. Format each as a brief statement of the claim. Generic pleasantries ("happy to help") are not claims. Return `[]` if everything is grounded.

**grammar_issues** (list of strings)
Genuine errors only — misspellings, subject-verb disagreement, broken sentences, punctuation that changes meaning. Do NOT flag stylistic choices, deliberate fragments, contractions, or dialect preferences. Return `[]` if none.

**tone_appropriate** (bool) + **tone_note** (string)
`false` + explanation if tone is mismatched — e.g. cold reply to a frustrated sender, overly casual for a formal request, stiffly formal for a casual thread. `true` + `""` if the tone fits.

**confidence_score** (int 0–100) — how safe is this reply to send with no human review:

| Range | Meaning |
|---|---|
| 90–100 | Ready to send as-is |
| 75–89 | Quick human glance recommended |
| 50–74 | Real issues — review before sending |
| 25–49 | Needs rewrite |
| 0–24 | Do not send |

Score must align with the other fields. Perfect grammar does not compensate for ignoring the main question.

Return only the structured output.
