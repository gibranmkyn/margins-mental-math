# Pilot: round 3 scorecard (snapshot)

A committed copy of what `npm run eval:candidates` reported at the end of the pilot's third round (2026-11-25), before the criteria were finalised. `evals/report/` is build output and not committed; this file is the record. What happened in each round, and the notes per candidate, are in `evals/pilot-notes.md`.

100 candidates from 25 booklet questions (`evals/pilot-sources.json`, 4 variants each). 100 ready, **93 admissible** (every gate, fidelity, variety, the blind solve and all four judges).

## Per-candidate checks (pass / total)

| Layer | Check | Pass |
|---|---|---|
| Gate | structure | 100/100 |
| Gate | calculation | 100/100 |
| Gate | traps | 100/100 |
| Gate | chart drawn | 100/100 |
| Gate | originality | 100/100 |
| Gate | blind solve | 100/100 |
| Fidelity | shape matches the booklet question it is modelled on | 100/100 |
| Variety | not its source, a sibling or a bank question renamed | 100/100 |
| Judged | ambiguity | 100/100 |
| Judged | difficulty | 100/100 |
| Judged | distractors | 93/100 |
| Judged | realism | 100/100 |

No owner verdicts were recorded. The real-or-generated judge was not run in round 3 (retired; see `evals/judges/real-or-generated.md`).

## The batch against the booklets

| Measure | Booklets | Candidates | Target | |
|---|---|---|---|---|
| Skill mix, distance from the booklets | 0% | 8% | at most 15% | ok |
| Option kind mix, distance | 0% | 2% | at most 15% | ok |
| Tier mix, distance | 0% | 1% | at most 15% | ok |
| Correct answer at A / B / C / D | 21% / 33% / 28% / 17% | 18% / 32% / 32% / 18% | each 18% to 32% | ok |
| Questions with a table | 44% | 40% | within 15 points | ok |
| Questions with a chart | 53% | 60% | within 15 points | ok |
| Charts read from gridlines | 19% | 24% | within 15 points | ok |
| Prompts asking for the closest value | 16% | 16% | within 10 points | ok |
| Median words of context | 52 | 54 | within 30% | ok |
| Median words of prompt | 23 | 25 | within 30% | ok |
| Median numbers given | 18 | 15 | within 30% | ok |
| Median gap to the nearest wrong number | 20% | 25% | within 8 points | ok |
| Median share of given numbers the solution never uses | 54% | 50% | within 10 points | ok |
| Numeric options listed in ascending order | 84% of 45 (their sources: 91%) | 100% of 44 | within 15 points of their sources | ok |
| Of questions naming a currency, $ / € / £ | 68% / 14% / 18% of 72 | 81% / 10% / 9% of 69 | £ within 10 points | ok |
| Questions naming a year | 26% | 33% | within 10 points | ok |
| Of those, naming a year after 2016 | 4% | 0% | within 10 points | ok |
| Chart values to read that sit on a gridline | 40% of 396 | 49% of 356 | within 10 points | ok |

(The ascending line then read pracA-q14's "$650,000" beside "$2.5 million" as out of order; read as amounts, the booklets are 87% of 45 and the pilot's sources 100%.)

## Judge calibration (round 3)

| Judge | Should pass, passed | Should fail, failed | |
|---|---|---|---|
| ambiguity | 23/23 | 6/6 | trusted |
| distractors | 24/24 | 5/6 | trusted |
| realism | 22/22 | 5/5 | trusted |
| difficulty | 30/30 | 5/5 | trusted |
| real-or-generated | 10/10 | 10/10 | trusted (calibrated, but invalid as a gate: see above) |

The one distractors miss: a broken copy of pracB-q06 ($2,000,000 less expensive, which no slip gives) was passed, the judge finding a two-slip route to about $1.9 million.

## Not admitted, and why

All seven failed the distractors judge only.

| Candidate | Distractors judge's reason | What it was |
|---|---|---|
| bk-pst2-q15-a | "A, D, C, B" comes from no slip or pair of slips | A filler ranking; the source (pst2-q15) has one too ("A, D, C, B"). The judge was not told. |
| bk-pst2-q15-b | "B, A, D, C" follows no slip | as above |
| bk-pst2-q15-c | "B, C, D, A" comes from no slip | as above |
| bk-pst2-q15-d | "A, B, D, C" comes from no slip | as above |
| bk-pst2-q03-a | "Three times as much" comes from no slip or pair of slips | The top step of the coarse scale; in the source it too is reached only by two slips together (margins alone and another category's line). The judge was not told. |
| bk-pst2-q19-a | 2.4 percentage points comes from no slip | A numeric option no slip lands on; the source's 3.5% is one too (it continues the spacing of 1.5% and 5.5%). The judge was not told. |
| bk-bcg-q04-a | forgetting to multiply the washing margin by washes per customer still makes €3.0 best (€561 against €550) | A slip that lands on the answer, which the source does not have (in bcg-q04 the same slip picks €1.5, a wrong option). A real defect: the candidate needs new numbers or is dropped. |

## After the pilot

The criteria were then finalised (evals/README.md). Changes that affect these 100 candidates:

- The source's fillers are now recorded (`fillers` in `evals/source-distractors.json`) and shown to the distractors judge, whose prompt gained a "Fillers" rule. Because the prompt changed, every distractors verdict above is stale: the distractors judge must be re-run on all 100 (evals/judge-input/distractors/pending-NN.json). The changed judge was recalibrated on 2026-11-25 (three fresh Opus judges, blind to the key; 35 items, two new broken copies testing the filler rule): 27/27 should-pass passed, 7/8 broken copies failed, trusted. The one miss: a pracA-q14 copy with one unlicensed filler ($1.7 million), read by the judge as a grid continuation.
- Source-family measures now block: bcg-q04 (answers BBBB), pracA-q14 (CCCC), pracA-q25 (BCCC), pst1-q06 (BBBB) and pst1-q15 (DDCD) have more than two variants with the answer at one letter. Each needs a variant rewritten to another letter, or dropped, before that source's candidates are admitted.
