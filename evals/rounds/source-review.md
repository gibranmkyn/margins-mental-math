# Review of the distractor analysis, non-pilot booklet questions (2026-11-25)

`evals/source-distractors.json` was first written by one model pass over all 103 booklet questions; the 25 pilot sources were then reviewed by hand during the pilot. After the pilot, ahead of round 2, the other 78 entries were reviewed question by question (8 Opus reviewers, about 10 questions each, each working from the question as served in `evals/report/sources/<id>.json` and the rules in `evals/judges/distractors.md`). This is the summary; the change is in the git history of `source-distractors.json`.

## What changed

- 74 of 78 entries changed in substance.
- Traps: wrong options with a trap gained on 11 and lost on 9. Traps were removed where the slip did not land under the judge's landing rules (pst3-q14 "9 minutes", pst3-q26 "$15.7bn" and "$23.7bn", pst2-q25 "$5,000", pracB-q19 "Q, N, M, P", pracC-q14 A, pst3-q15 C, bcg-q01's escape option, pst2-q13's weighting doubt, and pracB-q18's "$71.7 billion" and "$200.8 billion", which come from a figure of the wider case that the served question does not show), and added where a real slip had been missed (for example bcg-q14 "3500 hours", pracA-q04 "20%", pracC-q16 "96", pracC-q19 "2,175", pst3-q11's two, sample-q08's two). Many other slip texts were rewritten with working that lands.
- Trapped options a candidate must reach changed for: bcg-q01 3→2, bcg-q14 2→3, pracA-q04 2→3, pracB-q19 2→1, pracC-q14 3→2, pracC-q16 2→3, pracC-q19 2→3, pst1-q12 2→3, pst2-q13 3→2, pst3-q11 1→2, pst3-q15 3→2, pst3-q26 2→1, sample-q06 2→3, sample-q08 1→2. pst3-q14 and pst3-q26 now have no trap at all (a wide grid and three fillers); the gate's minimum of one trap applied to their candidates at first, and was then lifted under the parity standard: a source with no trap requires none.
- `notCovered`: pracA-q15 2→3, pracA-q24 2→1, pracB-q15 1→0, pracB-q20 2→3, pracC-q14 2→1, pst1-q12 1→2, pst1-q17 1→0, pst3-q07 2→3. `dominated`: pracC-q24 0→1.
- `fillers` (new field): 49 options in 30 questions, including pst1-q25's two formula options (hence the `formula` kind).
- `slipsOnAnswer`: 25 added, none removed; every existing one was recomputed and holds.

## Judged unsuitable as sources

| Question | Why | In the pilot's exclusions? |
|---|---|---|
| bcg-q01 | escape option ("None of the above / we lack sufficient information") | yes |
| pracA-q12 | CANNOT-be-concluded with a qualitative "indicator" statement | yes |
| pracA-q15 | options are measures, judged determinable or not | yes |
| pracA-q16 | disputed key (the exhibit says percentage points, giving 5,850; the key gives 5,085) | yes |
| pracB-q20 | which statement is FALSE, all three wrong ones unsettleable by the data | yes |
| pracC-q13 | inequality options | yes |
| pracC-q20 | every wrong statement unsettleable; the answer one step (borderline) | yes |
| pracC-q21 | worked example | yes |
| pracC-q24 | recommendations, not testable claims | yes |
| pst2-q05 | worked example | yes |
| pst2-q13 | options are measures, judged determinable or not | yes |
| pst3-q07 | options are measures, judged determinable or not | yes |
| pst2-q10 | new: CANNOT-be-concluded; the keyed statement compares indices on different bases, which a truth check reads as true | no |
| pst3-q02 | new: the keyed option is the statement the data cannot settle (spend per product needs product counts); `notCovered` can never be the answer | no |
| pst1-q12 | new: inequality options ("less than / at least 2,250") whose key rests on the data not covering inpatients and outpatients | no |
| bcg-q03 | new, borderline: spend per car is a constant €10, so the answer is the row with the most cars, in effect a reading question | no |

Disputed: **pracC-q19** was excluded in the pilot (the redrawn chart and the booklet's solution read the days differently). The reviewer found both readings give about 1,370 to 1,375, so the key stands, and rates it suitable if the served solution uses the chart's own readings. **pracA-q17** was rejected in `evals/round-2-sources.json` for the same doubt as pracA-q16; the reviewer rated it suitable (its key is contradicted by a calculation on transactions per customer either way), with a note that option D has a strict reading under which it too cannot be concluded.

## Points the reviewers were unsure of

- pracB-q15: "three times quicker" reads true if growth is measured in absolute dollars a year; borderline as a source.
- pst2-q02: option D is true if "declined as fast" is read in percentage points (recorded as a second reading).
- pst3-q15: the key takes the lower level at the step chart's jumps; read at the upper level two options are worse than the answer.
- pst1-q22: the key rounds 2.74 years up as a threshold; a candidate must word its prompt plainly as a threshold.
- pst2-q25: the only remaining trap ($30,000, 50 tubes per pack read as 50 packs) is a misread figure, not a common one.
- pst3-q11: its two new traps are loose (2.4% off; two slips); otherwise all three wrong options are fillers.
- pracA-q13 "1, 3, 2, 4, 5" and pracC-q19 "2,175" are weak traps that could be fillers instead.
