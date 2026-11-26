# Round 3 (26 November 2026)

230 candidates from 61 booklet questions that already had admitted variants (`evals/round-3-sources.json`), written by Opus in 14 groups, blind-solved by Sonnet, judged by fresh Opus judges. The round needed two changes to the criteria, both recorded with their reasoning in `README.md` under "Changes to the criteria": the family cap rises from 4 to 8 where the answer is computed, and a statement family may pass 4 where the keyed claim moves.

| Check | First pass | After the fix round |
|---|---|---|
| Blind solve agrees | 221 | 225 |
| Ambiguity | 221 | 229 |
| Distractors | 213 | 227 |
| Realism | 222 | 230 |
| Difficulty | 226 | 230 |
| All checks | 189 | 224 |

224 pass every gate, the blind solve and the four judges. 7 were admitted at once (families of at most 4). 217 waited in `content/candidates` for the owner review that families past 4 then required (57 families). None was reviewed: on 26 November 2026 the owner made that review a warning rather than a block ("Make it a warning, ship now"), so all 217 became admissible unread. That is the owner's decision, not a finding; what it gives up is recorded in `README.md`, "Changes to the criteria", "The owner sample warns past 4".

## Dropped (stopping rule)

- bk-pracC-q23-e, -g: keying "raise revenue" makes the source's own trap (forgetting that a cost rises with revenue) land on the answer whatever the numbers. This family cannot key that claim.
- bk-pst1-q17-g: the blind solver read growth as dollars a year after the fix as well.
- bk-pst3-q03-e: one ranking option has no slip behind it.
- bk-pst2-q11-f, bk-pracA-q22-e: blind-solver slips on questions as clear as their source; left unchanged.
- bk-pracB-q09-d, -e were never written: the answer cannot sit at D while the source's trap is kept.

## What the round showed

- One solve per question. A coordinator re-solved four batches after seeing their comparison with the key (the first solvers had not used a calculator). The reason was sound but the order was not, so the five records that passed only on the re-solve were removed and counted as disagreements. The runbook now applies: instruct solvers fully in the first prompt, replace an invalid output before any comparison, never re-solve after one.
- The difficulty judge was applied two ways to moved-claim variants: two judges counted only the shortest path to the keyed statement, three counted four checks whichever statement is true, as the prompt says. The criterion was not changed (no strong reason to); the four failures went through the fix round, which made the keyed statement take work comparable to the source's.
- Moved-claim variants passed the automated checks at 59 of 64, better than the 80% guessed. Their weak point is a slip that makes the usual claim look true: where no natural slip exists, the claim cannot be moved.
- Values exactly on a step edge of a step chart read two ways (pst3-q15). Keep option values clear of edges, even where the source sits on one.
- Statements of the form "N times as fast" must hold on every growth convention the text allows (relative, absolute, compound), or name the convention as the source does.
- Single judges still disagree on siblings; the fix round checks the whole family for a defect one variant failed on.
- Batch warnings left standing: none on answer position; currency mix moved to 55% dollars, 32% euros, 13% pounds among variants that name one.
