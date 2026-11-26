# Round 2 (25-26 November 2026)

218 candidates from 60 booklet questions not used in the pilot (`evals/round-2-sources.json`), 3 or 4 variants per source, written by Opus in 13 groups, blind-solved by Sonnet, judged by fresh Opus judges.

| Check | First pass | After the fix round |
|---|---|---|
| Blind solve agrees | 213 | 215 |
| Ambiguity | 213 | 218 |
| Distractors | 206 | 216 |
| Realism | 212 | 218 |
| Difficulty | 218 | 218 |
| All checks | 190 | 213 |

213 admitted (plus pilot leftover bk-pst3-q04-b); the bank went from 257 to 471 questions.

## Not admitted (dropped by the stopping rule; they stay in `content/candidates`)

- bk-pst1-q22-b, bk-pst1-q22-d: the blind solver rounded the payback time to the nearest option; the key is the first option by which payback is complete, as in the source.
- bk-pracC-q14-c: the blind solver derived a revenue the context says cannot be derived.
- bk-bcg-q14-a: distractors, counting the other product line still picks the answer.
- bk-pst2-q21-d: distractors, one option has no slip within 5%.

## What the round showed

- The fix round corrected two source records rather than candidates (pracC-q05, pracA-q06: the source has the same slip on its answer). Changing a source record changes the distractors judge's calibration items for that source, so the judge must be recalibrated on those items before it is used again.
- Single judges disagree on siblings with the same defect (realism passed one variant and failed another). After a judge fails a candidate, check its siblings for the same defect in the fix round.
- Many source families can hold the answer at only two letters once the source's traps are kept; the family rule (at most 2 per letter) is the binding one.
- Batch warnings left standing: currency mix (94% dollars, 2% pounds against the booklets' 68% and 18%).
- Payback and threshold questions keyed on "first option that is enough" are the family most often missed by the blind solver.
