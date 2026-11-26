# Candidate evals

> **In the public repository** the evals cannot be run as they stand. They measure every candidate against the booklet question it is modelled on, and the booklet questions are not published. Also left out, because they contained booklet text: the judges' calibration inputs (`calibration/input/`), the broken and rewritten calibration copies (`calibration/broken.json`, `calibration/rewrites.json`) and the per-source distractor analysis (`source-distractors.json`). What is here is the method, the code, the writer's brief, the judge prompts, every recorded verdict and the record of each round.

The single reference for producing, scoring and admitting candidates. A round can be run from this file, `evals/WRITING.md` (the writer's brief) and the judge prompts in `evals/judges/`, with no memory of earlier rounds. `evals/pilot-notes.md` and `evals/rounds/` are history only.

Terms (GLOSSARY.md): a **booklet question** is transcribed from a practice booklet; an **authored question** is an original question with fixed wording and numbers; a **candidate** is an authored question modelled on one booklet question (its *source*, `modelledOn`), waiting in `content/candidates/` to be admitted to the authored bank (`content/authored/`). Variants of one source are *siblings*; with the variants already admitted they form the source's *family*. Never call anything "synthetic".

## Purpose and the one criterion

The authored bank should give the owner more questions that practise exactly what the booklet questions practise. A candidate keeps its source's structure, exhibit, difficulty and traps and changes everything a reader would recognise: company, industry, wording and every number.

**The standard is parity with the source: a candidate fails only where it is worse than the booklet question it is modelled on** (easier, harder, looser, odder, more recognisably written, or with a weaker set of options). A quirk of the source, reproduced, is not a defect. Every check below applies this one criterion; where code measures it, the band is set around the source's own value.

Examples, from the pilot:

- pst2-q03's two product lines grow at nearly the same rate, so comparing base-year profits already gives the answer. That shortcut is the source's; a candidate keeps it (rates a point or two apart). A round-1 note calling it a defect was withdrawn.
- pracB-q02 has one statement about something the data does not cover (menu prices). A candidate may have one such statement; two would fail.
- pracC-q23's premise is loose ("assuming the relationship between premium income and costs remains the same"). Round 2 tightened it and a blind solver then ruled out the keyed option. A candidate's premise is as loose as the source's, in new words.
- pst2-q15 keeps one ranking option that no slip produces. A candidate may keep one; two would fail.
- bcg-q04: taking the whole second revenue line as profit still picks the right price in the source, so the same slip landing on a candidate's answer is parity. Forgetting to multiply by the volume per customer gives a wrong option in the source; a candidate where that slip lands on the answer fails (bk-bcg-q04-a).
- Arithmetic no heavier: where the source multiplies 90 × 16 and its result comes out round, a candidate does not multiply 715 × 5.42.

## When a candidate is admitted

`npm run admit:candidates` (scripts/authored/admit.mjs, documented in scripts/authored/README.md) moves every candidate with `admit: true` in `evals/report/candidates.json` into the bank, and refuses if the bank's answer positions would leave 18% to 32%. `admit` is true when the candidate is **admissible on its own** and **not held back by its family**:

- **Admissible on its own** (`admissibleAlone`): every gate passes, it has no fidelity or variety finding, its blind solve agrees on its current text, all four judges have passed its current text under their current prompts, and the owner has not failed or rejected it. A candidate is **ready** when everything a writer can check alone passes (every gate but the blind solve, fidelity, variety): that is the writer's target.
- **Not held back by its family** (`blockedBy` empty): its source's family passes the two blocking family measures below.

Batch measures never block; they warn.

## Every check

| Check | Where | Pass rule | Blocks? |
|---|---|---|---|
| **Gate: structure** | `structureProblems`, `unorderedNumericOptionProblems`, `bankFieldProblems` (src/engine/question/authored-verify.ts) | a scenario skill and tier 1 to 3; context; 4 or 5 distinct options; a solution of 2+ steps; a shortcut; no ragged table; every chart sound (`chart-check.ts`: axis covers every value, pies add to 100, at most four series, ...); no malformed number; numeric options in one unit with distinct values. Options may mix scales of one unit where each reads as an amount ("$650,000" beside "$2.5 million", as pracA-q14 does; singular and plural count as one unit); options in different units, or not reading as one number each, fail. The id is `bk-<source id>-<letter>` and not already in the bank; no field the bank does not keep (`traps` aside, which admission strips). These are the bank's own per-entry rules (src/engine/question/authored-content.test.ts; a candidate's options need not ascend), so a candidate that passes the gates passes the bank's tests once admitted; `candidates.eval.ts` asserts it. | yes |
| **Gate: calculation** | `verifyCalculation` | the `check` reproduces the stated answer from numbers the owner can see. value: the keyed option is the clear nearest (0.5% margin) and equals the truth as displayed, or is within 5% where the prompt asks for the closest; best: the keyed option scores best, clearly; truth: exactly one statement holds, none vacuous, a `notCovered` statement never the answer; formula: the keyed formula equals the target at 24 samples and each distractor differs. With mixed-scale options, `answer` is in the plain unit (dollars). | yes |
| **Gate: traps** | `evals/traps.ts` | the traps reach as many distinct wrong options as the source's (`source-distractors.json`, at most 3; none where the source records no trap, as pracC-q02, pst1-q05, pst3-q14 and pst3-q26, whose wrong options are all fillers); each declared slip lands on the declared wrong option, clearly, and not close enough to the answer to be marked right | yes |
| **Gate: chart drawn** | `drawChart` at 358 px | every chart draws marks at finite positions and prints no NaN/undefined | yes |
| **Gate: originality** | `originalityProblems`, `bookletWording`, `bookletNamesIn` | no booklet name, case title or test-maker's name; no eight-word run from any booklet question or redrawn exhibit (titles, unit lines, notes, labels; stock stems exempt); no whole booklet sentence of 6+ words or title or exhibit note of 3+ words, though shorter than eight (generic text exempt: "Changes to the criteria"); the same wording rule on trap slips; at most two distinctive figures shared with one booklet question. The review page withholds and searches by the same functions | yes |
| **Gate: blind solve** | `independentCheckProblems` | a fresh solver, given only the visible text (charts read from gridlines as readings to a quarter step), chose the keyed option; recorded against the current text's fingerprint | yes |
| **Fidelity** | `evals/shape.ts` | the source's skill, tier, option kind and count, tables, chart kinds in order (labelled or read from gridlines), "closest" wording; context words 0.7 to 1.4 × the source's ±6, prompt words 0.7 to 1.4 ±4, data cells 0.75 to 1.33 ±2, numbers given 0.75 to 1.33 ±3; values on gridlines at most 15 points above and 30 below the source's share; no more `notCovered` statements than the source has | yes |
| **Variety** | `evals/variety.ts`, `varietyProblems` | against its source, every sibling and every admitted variant of the same source: at most 20% of distinctive story words shared (15% against siblings once the family has more than 4 variants), and not 3+ telling numbers making over a quarter of its numbers; no eight-word context phrase shared with another candidate or a bank question | yes |
| **Judge: ambiguity** | `judges/ambiguity.md` | exactly one option defensible on a careful reading (gridline readings to a quarter step) | yes |
| **Judge: distractors** | `judges/distractors.md` | every wrong option comes from a common slip or pair of slips, a grid, or a kind the source also has (`sourceHas`: a statement without basis, a dominated option, a wide grid, a filler of the same kind; no more of them than the source); no common slip lands on the answer unless the source's own does (`slipsOnAnswer`) | yes |
| **Judge: realism** | `judges/realism.md` | numbers and setting plausible for the business, no odder than the source | yes |
| **Judge: difficulty** | `judges/difficulty.md` | about as hard as the source: same steps and reading (it judges step counts only; arithmetic weight is the batch measure below) | yes |
| **Owner review** | `content/candidates/judgements/owner.json` | a verdict with `fail: true` or `mark: "reject"` blocks that candidate; a verdict on an earlier text (its `fingerprint` differs) lapses; no verdict does not block | yes, when given |
| **Family: variants per source** | `families()`, `variantCap()` in candidates.eval.ts | waiting and admitted together: at most 8 where every variant's answer is worked out afresh from its own numbers (numeric, ranking and label options; statements whose keyed option, numbers taken out, reads the same as a wrong one), at most 8 for a statement source whose round list declares the claim each variant keys, none on more than half (`keyedClaimProblems`, `familyCap`), at most 4 otherwise (other statements, formulas). See "Changes to the criteria". | yes: that source's waiting candidates |
| **Family: answers at one letter** | `families()` | at most 2 variants of one source with the answer at the same letter, waiting and admitted together | yes: that source's waiting candidates |
| **Family: a different letter for each variant** | `families()` | target | warns |
| **Family: owner sample** | `families()` | at least one waiting variant of each source reviewed by the owner | warns, at any family size (past 4 it blocked until 26 November 2026: "Changes to the criteria") |
| **Batch measures** | `batchRows()` | each line below within its band | warns |

### Batch measures (all warn)

Against the 103 booklet questions as served. They warn rather than block because a batch only approximates a mix and each candidate is already held to its own source. The one with consequences, answer positions, is enforced on the whole bank by the bank's content test and by admit.mjs.

| Measure | Band |
|---|---|
| Skill mix, option kind mix, tier mix | distance (half the summed difference) at most 15% |
| Correct answer at A / B / C / D | each 18% to 32% (the pilot: 18 / 32 / 32 / 18) |
| Questions with a table, with a chart, with a chart read from gridlines | within 15 points |
| Prompts asking for the closest value | within 10 points |
| Median words of context, of prompt, numbers given | within 30% |
| Median gap to the nearest wrong number | within 8 points |
| Median share of given numbers the solution never uses (surplus data) | within 10 points (booklets 54%) |
| Numeric options listed in ascending order | within 15 points of the candidates' own sources |
| Currency mix $ / € / £ among questions naming one | distance at most 15% (booklets 68 / 14 / 18) |
| Share in pounds | within 10 points (booklets 18%; the pilot 9%) |
| Questions naming a year; of those, a year after 2016 | within 10 points each (booklets 26%, 4%) |
| Chart values to read that sit on a gridline | within 10 points (booklets 40%) |
| Worked numbers heavier than the source's (mean significant digits of the solution's numbers more than 1 above the source's) | at most 10% of candidates |
| Worked solutions 2 or more steps longer than the source's | at most 10% of candidates |

The two weight lines are cheap proxies (booklet solutions are transcribed and terse, candidates' are written to a format), so they only warn; whether a candidate is harder than its source is the difficulty judge's call.

## The judges

Four model judges, one failure mode each. Each receives a JSON array of items in one neutral format (no source labels; ids that give nothing away) and returns `[{ "id", "judge", "fail", "why" }]`, `why` one sentence. What each sees is built by `evals/judge-view.ts`: ambiguity and realism the question as the owner sees it; distractors the question with its answer, solution and `sourceHas`; difficulty the question and its source, both with answers and solutions.

**Ids are fingerprints** of the judge's prompt and of everything the judge saw. A verdict counts only for the exact text and prompt it was given: when either changes, the verdict is stale (the report counts stale verdicts), the candidate shows as not judged, and `npm run eval:judge-input` puts it in a pending batch.

**Calibration.** Before trusting a judge, run its prompt on `evals/calibration/input/<judge>.json` and save the output as `evals/calibration/judgements/<judge>.json`. The set: 20 booklet questions every judge should pass, 2 faithful candidates (`calibration/faithful.json`), for difficulty 8 rewrites (`calibration/rewrites.json`), broken copies with one known defect each (`calibration/broken.json`), and booklet questions and broken copies added later for new rules. `calibration/key.json` holds the expected verdicts and is never shown to a judge. **A judge is trusted when every item has a verdict, it passes at least 90% of the should-pass items and fails at least 80% of the broken copies.**

Recalibrate after any change to a judge prompt, to what the judge sees (judge-view.ts, `sourceHas`, the source-distractors.json entries of calibration questions), or to the judge model. A judge below the bar is not used until its prompt is fixed and it passes. A new rule in a prompt gets at least one should-pass booklet question and one broken copy that test it (`round: N` in broken.json and a list in judge-input.eval.ts, numbered after earlier items so their ids stay stable).

Calibrate in a fresh model context that has seen only the prompt and the input file (split into batches if long); never let the context that wrote a broken copy judge it.

The retired **real-or-generated** judge (`judges/real-or-generated.md`) is not a gate and is not run: judges recognise the published cases, so a half-real batch cannot be passed whatever the candidates are like. The owner's sample review replaces it.

## Model roles

- **Writers: Opus**, one context per writer group, following WRITING.md.
- **Blind solvers: Sonnet**, a fresh context per batch, seeing only the exported batch.
- **Judges: Opus**, a fresh context per batch, seeing only the prompt and the batch.
- **The writer never judges or blind-solves its own batch**, and no context judges a batch whose answers it saw in another role.
- **The owner** reviews a sample on the review page.

## A round, end to end

```sh
# 0. Pick sources: a list like evals/pilot-sources.json or evals/round-2-sources.json. Only booklet questions judged
#    suitable (not: a disputed key; "cannot be determined" or escape options; inequality options; qualitative judgement
#    statements; a pure reading question; the worked examples pst2-q05 and pracC-q21; evals/rounds/source-review.md lists
#    the review's verdicts). Variants per source up to its cap counting admitted variants (8 or 4: "Changes to the
#    criteria"), each with its answer letter fixed so that no letter holds more than 2 in the family, letters continuing
#    after any already used (dropped ones included). A statement family past 4 also gets `keyedClaim` and a `keys` on
#    every variant, admitted and new ("The keyed claim"); before admitting, read the report's "Keyed claims to read". Writer groups of 16 to 20 candidates with similar workload, never
#    two questions of one case in a group. Before any fifth variant of a source: the app keeps siblings apart.

# 1. Write. One Opus writer per group, briefed with evals/WRITING.md and its group. It writes
#    content/candidates/<source id>.json (ids bk-<source id>-<letter>, letters after any already used for that source)
#    and loops on step 2 until every candidate is ready.

# 2. Eval. Prints evals/report/candidates.md; writes evals/report/candidates.json (one row per candidate, with admit),
#    evals/report/batch.json (families, batch measures, calibration) and evals/report/sources/<id>.json
#    (each booklet question as served, with its fidelity targets and distractor analysis: what writers read).
npm run eval:candidates

# 3. Blind solve the ready candidates (Sonnet, a fresh context per batch).
node -e "console.log(require('./evals/report/candidates.json').filter(r => r.ready).map(r => r.id).join(','))" > /tmp/ready.txt
node scripts/authored/export-candidates.mjs content/candidates /tmp/blind 4 "$(cat /tmp/ready.txt)"
#    Give each /tmp/blind/batch-N.json to a fresh solver; save its answers as
#    [{ "id": ..., "choice": "B", "working": "..." }] in /tmp/blind/answers-N.json. The key /tmp/blind.map.json is never shown.
node scripts/authored/compare.mjs content/candidates --map /tmp/blind.map.json /tmp/blind/answers-*.json
node scripts/authored/record.mjs content/candidates content/candidates/checks/independent-check.json --map /tmp/blind.map.json /tmp/blind/answers-*.json
#    record.mjs keeps only agreements on unchanged text. A disagreement means the question or its key is wrong: fix it.

# 4. Judges (Opus, a fresh context per batch).
npm run eval:judge-input
#    Writes evals/calibration/input/<judge>.json (calibrate first if a prompt changed: see "The judges"),
#    evals/judge-input/<judge>/batch-NN.json (every ready candidate), evals/judge-input/<judge>/pending-NN.json (only those
#    with no verdict that counts: new, changed, or judged under an earlier prompt) and evals/judge-input/pending.json
#    (which candidates each pending file holds). Run evals/judges/<judge>.md on each pending file and save the returned
#    array as content/candidates/judgements/<judge>-<round>-<NN>.json: any new name (every file in that folder is read);
#    never overwrite a file whose verdicts still count. Then step 2 again.

# 5. One fix round. Writers revise every candidate with a finding (gate, fidelity, variety, blind solve, judge, family),
#    then steps 2 to 4 again: the blind solve for changed candidates, the judges on the pending files only.
#    Whatever still fails after this round is dropped (deleted from content/candidates). No second fix round.

# 6. Owner review of a sample.
npm run eval:review
#    Writes evals/report/review.html (no booklet text; safe to publish privately). The owner works through at least one
#    variant of every source, marks Reads real / Something off / Reject with a note, presses "Copy my notes", and the
#    result is saved as content/candidates/judgements/owner.json (merged with earlier marks):
#    [{ "id": "bk-...", "judge": "owner", "fail": true, "mark": "off", "why": "...", "fingerprint": "..." }]
#    "off" and "reject" are fails and block that candidate (fix it within the fix round, or drop it);
#    a candidate the owner did not review is not held back.

# 7. Admit.
npm run eval:candidates                    # the headline, the family blocks, the batch warnings
npm run admit:candidates -- --dry-run      # what would move, and why the others would not
npm run admit:candidates
npm test                                   # the bank's own tests, now including the admitted variants
```

**Stopping rule.** One fix round, then drop what still fails. Do not iterate further: the pilot's third round moved 89 to 93 of 100, and more rounds mostly chase judge noise.

**A round beside admitted variants.** Admission moves candidates into `content/authored/<skill>.json` (keeping `modelledOn`; their traps go to `content/candidates/admitted/traps.json`) and removes them from `content/candidates`. A later round is scored against them:

- variety compares each candidate with every admitted variant of its source (findings name "admitted <id>"), and the generic-vocabulary list is built without admitted variants;
- the family measures count admitted variants: a source at its cap (4 or 8) takes no more; letters already used count against the cap of 2 per letter;
- a candidate may not reuse an admitted id: letters continue (a source with a to d admitted starts at e);
- admitted variants' verdicts stay in `content/candidates/judgements` and are not counted as stale; the pending batches hold only waiting candidates;
- the bank's answer-position test covers old and new together, and admit.mjs refuses an admission that would break it: check the batch's position line before admitting.

## The distractor analysis (`source-distractors.json`)

For each booklet question: `traps` (each slip and the wrong option it lands on; a candidate must declare traps on as many distinct wrong options, at most 3, and none where the source has none), `notCovered` (wrong statements the data cannot settle: a candidate's allowance of `notCovered` markers), `noBasis`, `dominated`, `wideGrid` (uncommon kinds a candidate may use only where its source does), `fillers` (wrong options no common slip or pair of slips lands on, each with its kind: ranking, coarse, numeric, formula, statement or label, a note for the judge and the working), `slipsOnAnswer` (common slips that still give the source's correct option, with their working), `unexplained` (the first model pass's count, kept as history) and notes (`secondReading`, `oddMagnitude`). The distractors judge is told `noBasis`, `dominated`, `wideGrid`, `slipsOnAnswer` and `fillers` as `sourceHas`, worded without the source's figures.

Status: the 25 pilot sources were reviewed by hand (slips on the answer computed by hand in round 3; fillers recorded after the pilot). The other 78 entries were written by one model pass, then reviewed question by question after the pilot (2026-11) from each question's own numbers and options; `evals/rounds/source-review.md` summarises the changes and the questions judged unsuitable as sources. Treat any entry as a careful reading, not a certainty: a writer who finds a trap the analysis missed reproduces it too, and reports it.

## What is not measured

- **Whether a candidate reads as written rather than real.** No valid automatic test exists (see the retired judge). WRITING.md section 12 lists what gave candidates away; the owner's sample review is the only check, and it is not required before admission (see "Changes to the criteria", 26 November 2026: the owner sample warns past 4).
- **Whether the source itself is a good question.** Sources are chosen, not scored.
- **Difficulty by timing.** Nobody times candidates; the difficulty judge compares steps and arithmetic with the source, and the weight lines only warn.
- **Realism against outside data.** No market sizes or prices are looked up; the realism judge decides.
- **A single candidate's option order against its source's.** The ascending line compares the batch with its sources only.
- **Statements marked `notCovered`.** The code confirms only that they are not the answer; the blind solve and the judges cover them (the report lists them).
- **Judge noise.** Calibration bounds it on a fixed set; a single verdict can still be wrong, and there is one judge per candidate per failure mode.

## Changes to the criteria

### 26 November 2026: the family cap

**Old rule.** At most 4 variants of one source, waiting and admitted together (blocks); at most 2 of them with the answer at one letter (blocks). The 4 was set by judgement after the pilot ("more variants of one source teach its trap rather than the skill") and never measured. With 309 variants admitted it left about 30 slots.

**New rule** (`variantCap`, `answerIsComputed`, `familyFindings` in candidates.eval.ts; tested there).

- **8 variants** where every variant's answer has to be worked out afresh from its own numbers: numeric, ranking and label options (a country, a year, "twice as much"), and statements whose keyed option, with its numbers taken out, reads the same as a wrong option, so that only the numbers decide (pracB-q09's "There is a 25% chance ..." beside "... 33% ...").
- **4 variants** otherwise: statements that make a different claim from the others, and formulas.
- **At most 2 per letter, unchanged.** A source whose traps let the answer sit at 4 letters may reach 8; at 3 letters, 6; at 2 letters it stays at 4.
- **Guards once a family has more than 4 variants:** each waiting variant shares at most 15% of distinctive story words with every sibling, waiting or admitted (20% below that); and at least one waiting variant of the family must be reviewed by the owner, which blocks there (up to 4 an absent review only warns). Later the same day the owner made this a warning too: "The owner sample warns past 4" below. The writer's brief adds: a different industry from every admitted sibling, read first.
- **Precondition:** no fifth variant of any source is admitted until the app keeps a variant's siblings, and its source, out of the same regular session and mock, as spot checks already do.

**Why.** The cap guards against one thing: a user who meets a family recognises it and answers without the reasoning. That can happen two ways.

- *By position.* The rule of at most 2 per letter limits that, and is unchanged. At 8 it forces a 2/2/2/2 spread, more even than many families of 4 (17 admitted numeric families of four answer at only two letters).
- *By form.* Measured on the admitted families: where the options are different claims, the keyed claim is the same in every variant. In 16 of the 25 such statement families every admitted variant's keyed option is nearest in wording to the source's keyed option (69 of 92 variants): pracA-q24's "Small ... have had the least attention" in all three, pracC-q25's "Class A and Class C ... lower than ... Class B" in all four, pst1-q03's "more profit in H2 than in H1" in all four. A reader who has met two of them can pick the third without the data, so more of them would only teach the family. Formula families have one shape and no arithmetic to drill. Those stay at 4. Where the options are numbers, rankings, labels or statements that differ only in their numbers, the answer moves with each variant's data. Recognising the family then gives the method, which is the drill the owner wants (mental-math practice on booklet-style cases), but not the answer. The app's generated questions already repeat structure with new numbers by design (66% of scenario-session questions), and once the bank is used up, the alternative to a new sibling is an exact repeat.

**Evidence.**

- Variety can be held at 8 by the existing pairwise check. Among the 419 sibling pairs admitted by round 2 the setting overlap has a median of 0.06, a 95th percentile of 0.156 and a maximum of 0.20. The independently written variants of one booklet case (8 to 24 per case, one story structure, different sources) exceed 0.20 in 9 of 2,247 pairs and 0.15 in about 2.5%, so the stricter 0.15 bar is reachable. Within the families, the story words that recur in 3 or more variants are the source's own structural words ("quintile", "league", "respondent"), not new industries.
- But the word check cannot see a repeated industry. Pairs of admitted variants from different families that share an industry (two pizza chains, two water-cooler firms, two food-delivery apps, two game studios) score 0.00 to 0.35, inside the sibling range. Common industry words (hotel, coffee, bakery, airline, software) are generic vocabulary and are not counted at all. Giving those words back (a smaller generic list) did not separate them either. That is why the owner reviews the bigger families, and why the brief asks for a different industry from every sibling.
- Session collisions at the round-2 bank, before the change (400 seeds per skill and tier): 4.5% of 3-question scenario sessions and 119 of 500 full 26-question mocks held two siblings or a variant with its source. Larger families would raise this, hence the precondition.
- Without a cap change: about 30 open slots (families of 2 or 3), fewer after the families that failed before, plus pracC-q19 (rated suitable by the source review), about 30 questions in all. Under the new rule round 3 plans 140 candidates from 45 sources (`round-3-sources.json`), about 135 admitted at round 2's rate. Not 200.

**Considered and rejected.**

- *8 for every family:* about 100 more statement variants, enough for 200. Rejected: in those families the keyed claim repeats (above).
- *6 everywhere:* lets in the repeating statement families and still cuts off the numeric families that can use all four letters.
- *A union guard:* the share of a variant's story words found in any sibling. It grows with family size whatever the writer does (median 0.20 in families of 4; 0.25 to 0.56 across case pools of 8 to 24), so a fixed bar would fail honest variants.
- *A word-level or declared "industry" check:* the word check does not separate same-industry pairs (above). A declared field would change what the judges see (judge-view.ts) or what admission writes, and a writer can label anything as new.

**What would reverse it.** Any of these sends the cap back to 4, or stops growth past 4 for the families concerned:

- the owner reports recognising families or answering a later variant without working, or finds repeated industries in a family past 4;
- in the app, once there is data, accuracy on a family's fifth and later variants clearly above (or time clearly below) its first four, beyond the general practice trend;
- the app's sibling rule for sessions and mocks not landing, or being removed;
- variants past 4 failing the blind solve or the judges at more than twice round 2's rate, a sign the structure is used up.

### 26 November 2026: the keyed claim

Added the same day, after the family cap above left round 3 at about 135 of the 200 the owner wants.

**Old rule.** A statement source whose options make different claims stays at 4 variants, because its keyed claim repeats in every variant (above).

**New rule** (`MAX_VARIANTS_KEYED`, `claimPlans`, `keyedClaimProblems`, `familyCap` in candidates.eval.ts; tested there).

- A statement family may go past 4, up to 8, where the round's source list declares the claim each variant keys. Per source it gives `keyedClaim.claims`: the kind of claim each of the source's options makes (options making the same kind of claim share one, as pracC-q25's two "one class's average above another's" do). It gives `keyedClaim.neverKeyed`: options that can never be the answer (not covered by the data, or dominated). And it gives `keys` on every variant, admitted and new.
- **Blocks**, once the family has more than 4 variants:
  - a variant with no declared claim;
  - a declared claim that is not one of the source's, or sits only on a never-keyed option;
  - any claim keyed by more than 4 variants, half of 8. A count, not a share of the family as it stands: a share would block the first new variant beside four admitted on one claim (4 of 5), and the survivors whenever some new variants are dropped. Every new variant still has to key a claim other than one four admitted variants already key;
  - fewer never-keyed options than the source's analysis records not covered plus dominated (`source-distractors.json`). This stops a claim the data cannot settle from being offered as one to key.
- In a family whose four admitted variants all key the source's claim, every new variant must therefore key another one. The data is built so that the usual claim is false. A slip makes it look true: the source's own slip on another option, turned round, or a natural one. That slip is declared as a trap, so the trap gate's count still holds.
- **Unchanged:** at most 2 per letter, the 15% setting bar and the owner-review block past 4 (since made a warning: "The owner sample warns past 4"), the precondition, and the trap, fidelity and judge gates. No judge prompt, judge view or verdict id changes. The declaration lives in the round's list, not in the candidate file.
- **Verified by a person.** The report's "Keyed claims to read" lists every waiting variant past 4 with its declared claim, the source's option making it and its own keyed option. Whoever admits reads that list.

**Why.** The reason to hold these families at 4 was recognition by form: a reader who has met the family picks the usual claim without the data. Measured by hand on the 16 statement families at 4 that can take this:

- In 14 of them every admitted variant keys the source's claim, so a reader who knows the family is right 5 times in 5 (the source included).
- At 8 under this rule, the usual claim is keyed by at most 4 of 8 variants (5 of 9 with the source), so the same reader is right about half the time, and wrong on every new variant.

So the rule does not add more of the pattern. It dilutes the one already in the bank. The new pattern it could teach is "in this family the answer is one of these two or three claims, never that one". The never-keyed claim is a statement the data cannot settle, and recognising those is the skill the booklets test.

**Evidence.**

- Moving the keyed claim has passed before. In pracA-q06's admitted family the keys are the source's claim once and another claim three times. All four were admitted; round 2's one finding there was settled by correcting the source's record, not the variants. pst1-q15's four, admitted after the pilot, each key a different group.
- The difficulty judge counts testing four statements as four checks whichever is true, so a moved key does not change the step count.
- Words cannot settle which claim a variant keys. A best joint match of each admitted variant's four options to its source's, by shared words, agreed with the hand reading on 52 of 64 variants in these families. The misses were on margins under 0.01. A nearest-wording match alone did worse (it read pracA-q03's four as 0 of 4 on the source's claim; by hand all four are). Hence a declaration read by a person, not a measure.
- Capacity: 16 families × 4 = 64 candidates (groups 9 to 12 of `round-3-sources.json`), about 50 admitted at a lower rate than round 2. Each needs a slip for the usual claim, and a variant without one turns that option into a filler the distractors judge fails. With groups 13 and 14 (below), round 3 in all: 230 candidates (228 written or planned: bk-pracB-q09-d and -e could not be written), about 205 admitted if the moved-key variants pass at about 80%.

**Which families.** The 16 statement families at 4 with at least one other claim that can be made true, outside groups 1 to 8:

- left out, because every other option is not covered: pracB-q07 and pst1-q07;
- opened once groups 1 to 8 were written (groups 13 and 14, 24 candidates): the six families filled there, pracA-q24, pracB-q22, pracC-q12, pst2-q07, pst3-q15 and pst3-q20. Their waiting variants (-d; pst3-q20-e) carry `keys` under `waiting` in the round list, which `claimPlans` reads, and from the first new variant they fall under the 15% bar and the owner-review block (since made a warning) like any family past 4. pst3-q15 (which idea helps least, from a step chart) is the hardest of all to move: its notes ask the writer to report rather than force it;
- excluded: formula families, which have no other claim.

In pracB-q11, pst1-q11, sample-q04, pracB-q22 and pst2-q07 only one other claim can be true, so their families end half and half.

**Considered and rejected.**

- *Matching the keyed claim by words in code:* 52 of 64 at best (above). A block that wrongly fires on one honest variant in five is worse than a declaration that is read.
- *A field in the candidate file:* admission would write it into the bank, and a writer would be certifying their own work.
- *A stricter guard counting the source* (no claim on more than half of source and variants together): no family whose four admitted variants share a claim could grow at all, so it is the old rule under another name.

**What would reverse it.** Any of the family cap's reversal signs for these families, and also:

- the owner finding a variant whose keyed option makes the source's usual claim after all;
- moved-key variants failing the distractors judge (for an unsanctioned filler on the usual claim) at more than twice the round's other statement variants;
- in the app, accuracy on these families' moved-key variants clearly below their first four. That would mean users were answering the first four by recognition, which argues for removing the old ones, not for more.

### 26 November 2026: the originality gate reads exhibits and whole short sentences

**Old rule.** No booklet name; no eight-word run from any booklet question as transcribed (`content/booklets`: paragraphs, list items, table titles, headers and cells, question, options, explanation, tip), stock stems exempt; at most two distinctive figures shared with one booklet question. Two gaps followed:

- the redrawn exhibits (`content/exhibits`), which the app shows in place of the transcription's chart tables, were not indexed: their chart and table titles, unit lines, notes and labels;
- a booklet sentence or title shorter than eight words could never match, however exactly it was copied.

The review page (`review.eval.ts`) searched more widely, because the page is published and must carry no booklet text. It found 19 strings in 11 waiting candidates that the gate had passed, and withheld them. So a candidate could be ready, yet unfit to show.

**New rule** (`indexBooklets`, `bookletWording`, `bookletNamesIn` in src/engine/question/authored-verify.ts; tested in authored-verify.test.ts).

- **Exhibits indexed.** The eight-word runs of every redrawn exhibit's text (titles, unit lines, notes, categories, series names, headers, cells, bar notes, group names) join the phrase index: 201 runs not already in it, 11,755 in all.
- **Whole units.** Booklet sentences and titles shorter than eight words are matched exactly: as a run of words inside any one string of the candidate, case and punctuation ignored, so a title repeated as a series name counts. There are two kinds:
  - sentences: those of the paragraphs, list items, questions, explanations (the served worked steps) and tips. They count from 6 words that carry wording, meaning not numbers, symbols or single letters;
  - titles: table and exhibit titles, with the exhibit number ("Exhibit 3:", "Table 1 (Company B):", "Doc 2:") and the transcriber's brackets ("(chart)", "(approximate readings)") dropped, and exhibit notes. They count from 3 such words.

  54 units qualify.
- **Generic, so allowed:**
  - an exhibit number alone ("Exhibit 1"), and titles of one or two words ("Exhibit 2: Taste", "Customer quintiles");
  - year and index labels ("2010-2013", "Index, H1 2011 = 100");
  - short sentences ("Country D is highest.", "C is the false statement.", "So 15% is the minimum option.");
  - equations, meaning any text with "=" ("Profit = revenue × margin");
  - anything inside a stock stem;
  - unit lines ("Revenue, $m", "% of all respondents", "US$ per customer");
  - labels: cells, headers, categories, series names and options.

  Eight-word runs of all of these are still checked.
- **Names** as the page searched them: the test-makers' names (McKinsey, BCG, MCP, PST), and booklet names and case titles in any case.
- **Trap slips** go through the same wording check in the candidate gate, because the page shows them for moved-claim variants.
- **One place.** The review page's `bookletMatches` is now these two functions. It withholds a string the gate would fail, and it searches its finished page with the same rule: wording within each element and attribute value, names anywhere.
- **The bank.** The bank's test (authored-content.test.ts) applies the new rule to the admitted questions too, with one exception. The 14 matches in 10 admitted questions listed below are a known backlog (`ORIGINALITY_BACKLOG`), an exact list: any other match fails `npm test`, and an entry comes off the list when it is reworded. Rewording those questions needs a new blind solve and fresh judge verdicts, so it is a separate job, not part of this change. Candidates face the full rule through the gate, so nothing new can join the backlog.

**Why.**

- The gate exists so that no question carries wording a reader of the booklets would recognise. What the app serves of a booklet question includes its redrawn exhibit, so the exhibit's titles, unit lines and notes are booklet text in the same sense as the transcription. The index simply never read them.
- Eight words is the right bar for running prose: shorter runs are mostly common phrasing. But a title or a short sentence is a whole unit of booklet text. "Exhibit 3: Average one year value" is six words, and it marks its case as surely as any eight-word run of a paragraph.
- Two rules for one question let the gate pass what the page then hid. With one rule the two cannot disagree.
- The line between generic and distinctive comes from the admitted variants, all written to keep their source's structure and labels. Below the line, what they share with the booklets is:
  - labels and unit lines the structure dictates ("$ million"; "% of all respondents" in 7 unit lines; "Cumulative % of total costs" in 5; "$ per kg" in 5);
  - equations ("Profit = revenue × margin" and "Loss = revenue × margin" in 4 solutions each; "Income in $US = C × E" in 3);
  - short formulaic sentences ("So 15% is the minimum option." in 2);
  - answer formats ("4 percentage points", "A, D, C, B").

  None of these points to a booklet, and each recurs across families written independently. Above the line, the bank holds only wording copied from the source itself: two exhibit titles in one family, one solution sentence in another, one table title, and one exhibit note.

**Evidence.**

- **Admitted bank**, 478 questions, 316 of them bk- variants: 10 would fail the new rule, all bk- variants, with 14 matches:
  - bk-pracA-q13-a, -b, -c, -d: the chart title and series name "Average one year value" ("Exhibit 3: Average one year value"), and the table title "Exhibit 3: Average after 90 days";
  - bk-pst1-q03-a, -b, -c, -d: the solution step "Profit is proportional to revenue × margin index.";
  - bk-pst2-q02-d: the chart title "Exhibit 1: DeskDirect profit margin by category, 2010-2013", which holds the booklet title "Profit margin by category 2010-2013";
  - bk-bcg-q02-a: the chart note "Along the bottom: price options A to D", eight words of the redrawn exhibit's note.
- **Waiting candidates**, 217: 11 would fail, on 19 strings. These are exactly the 19 the page withheld: bk-pracA-q13-e to -h (the same two titles and series name), bk-pst1-q03-e to -h (the same solution step), and bk-pracB-q18-d, bk-pst2-q19-e and bk-pst3-q26-h (chart unit lines sharing eight words with exhibit unit lines). Checked string by string over every candidate and admitted question, the new rule catches every string the page's old search caught. Beyond that it catches only bk-pst2-q02-d's title, which the page's exact-substring search missed because of a comma. All 11 were reworded in those strings only, and all 217 candidates are ready again.
- **Deliberately not caught.** The page's old search also matched titles of 12 or more characters with their exhibit number ("Exhibit 2: Taste", "Exhibit 2: Texture", "Exhibit 2: Appearance", "Doc 2: Market study"). No candidate or admitted question uses any of them.
- **Judges.** No judge prompt, judge view or calibration item changed, and the calibration inputs are byte for byte the same. All four judges still show as trusted.

**Considered and rejected.**

- *Matching every booklet string whole*, labels, unit lines and options included. This would fail the plain labels that WRITING.md section 5 tells writers to keep and that the variety check deliberately ignores ("% of all respondents" alone is in 7 admitted questions).
- *The page's character thresholds* (titles of 12 or more characters, texts of 40 or more). Characters measure typography, not wording: the title test caught "Exhibit 2: Taste", a single word with its number, and missed a copied title over a comma.
- *A generic-vocabulary filter*, as variety uses. "Average one year value" is made of common words, yet it identifies its case.
- *A lower sentence bar* (3 to 5 words). This would fail "So 15% is the minimum option." (2 admitted) and "Country D is highest.": formulaic, not recognisable.
- *Applying the rule to the bank with no backlog.* The 10 admitted questions would have to be reworded, re-solved and re-judged first: a separate job.

**What would reverse it.**

- The owner recognises a booklet from text the rule allows (a two-word title, a five-word sentence, a unit line): lower that bar.
- The owner finds text blocked that names no case: raise that bar or exempt the kind.
- Reworded titles fail the judges, or fidelity, at clearly more than the round's other changed candidates: the 3-word title bar is costing faithful wording, so revisit it.
- The redrawn exhibits are reworded: measure again, because the index follows them.

### 26 November 2026: the owner sample warns past 4

**Old rule.** Once a family has more than 4 variants, waiting and admitted together, at least one of its waiting variants must be reviewed by the owner, or every waiting variant of that source is blocked. Up to 4 a missing review only warned. The block was added the same day, with the larger families ("The family cap" above), because no person had read any variant past the pilot: the owner's review was to be the check for what no code measures, a repeated industry or a family that reads alike, and the reading of the keyed claims.

**New rule** (`familyFindings` in candidates.eval.ts; tested there). A family with no waiting variant reviewed by the owner warns, past 4 as up to 4. An owner verdict of fail ("Something off") or `reject` still blocks that candidate, exactly as before (`ownerBlocks`). Nothing else changes: the caps (8 or 4), at most 2 per letter, the 15% setting bar past 4, the keyed-claim rule, every gate and all four judges. No judge prompt, judge view or calibration file changes.

**Why.** This is the owner's decision, not a conclusion from evidence. Round 3 left 217 candidates in 57 families past 4 that pass every automated check (every gate, fidelity, variety, the blind solve and all four judges), held back only by this block. Asked how to clear it, the owner answered "Make it a warning, ship now". No measurement since the block was added shows the review is unneeded; it was simply not done.

**What is lost.**

- No person has read these 217 questions before they reach the app. Whether a family past 4 repeats an industry or reads alike is measured by no code (the word check cannot see a repeated industry: "The family cap", evidence), so nothing has checked it.
- The keyed claim of the 82 moved-claim variants is declared by the round list and verified by no mechanical check. `keyedClaimProblems` counts declarations; it cannot tell which claim an option makes ("The keyed claim": a word match agreed with a hand reading on only 52 of 64). A variant that keys the family's usual claim in new words would go unnoticed, and in a family whose four admitted variants all key that claim it would restore the pattern the rule exists to dilute. The report's "Keyed claims to read" still lists each one with the source option beside it, but nothing enforces that anyone reads it.

**What remains.**

- The review page (`npm run eval:review`) is still built, and an owner verdict of off or reject blocks a waiting candidate.
- The page is built from `content/candidates`, so a candidate that has been admitted no longer appears on it. A later owner mark of off or reject on an admitted question is acted on by hand: remove it from `content/authored` (with its blind-solve record) and record why. No code does this.
- The family-line warning in the report names every family past 4 with no review, so the gap stays visible.

**What would reverse it.** Any of these restores the block for families past 4:

- the owner, reading admitted variants past 4, marks any off or reject for a repeated industry, a family that reads alike, or a keyed option making the source's usual claim;
- any of the reversal signs of "The family cap" or "The keyed claim" above.

## Thresholds, and what they rest on

Measured on the 103 booklet questions as served (redrawn charts in place) and the 162 bank questions written free.

**Option kinds** (`shape.ts`, `optionKind`). The booklets: numeric 45, statement 42, ranking 7, formula 5, label 4. Formulas written with `x`, `/` and `1,000` (pst1-q25, sample-q09) or with a number inside (pracC-q10) read as formulas; orderings ("C, A, D, B") are rankings; thresholds ("Less than 2,250") are statements; a lone escape option ("None of the above") does not make numbers a label; years to pick from (pst2-q11) are a label; statements are options of five or more words.

**Fidelity bands** (`shape.ts`, `BANDS`). Every booklet question passes against itself with each measure a quarter longer or shorter (824 of 824 cases). Against a different booklet question of the same skill, 8% of 1,876 pairs pass all four bands and 1.3% the whole shape.

**Variety** (`variety.ts`). Setting overlap counts distinctive story words only: generic business vocabulary (words in five or more of the 23 booklet cases and the 162 bank questions written free), calendar words and exhibit labels are left out, plurals folded. Between booklet questions of different cases the overlap's 99th percentile is 0.065 and no pair of 5,039 exceeds 0.2; within one case the median is 0.41. Threshold 0.2. Numbers: reusing three or more telling numbers (years, whole numbers to 12, 100 and round numbers such as 1,500 or 2.5 aside) that make up over a quarter of a candidate's numbers; unrelated booklet questions do so in 1.3% of pairs.

**Answer positions.** Held to 18% to 32% each, as the bank is, not to the booklets' uneven 21 / 33 / 28 / 17. Per family: in the pilot, 5 of 25 sources had three or four variants answered at one letter (bcg-q04 BBBB, pracA-q14 CCCC, pst1-q06 BBBB, pracA-q25 BCCC, pst1-q15 DDCD), which a user meeting the family learns; more than 2 per letter blocks, one letter per variant is the target.

**Variants per source.** Decided after the pilot: 3 to 4 per source (about 300 to 400 candidates over all suitable booklet questions), not 10. More variants of one source teach its trap rather than the skill. Changed on 26 November 2026 for sources whose answer is worked out afresh in every variant, and for statement sources whose keyed claim moves (see "Changes to the criteria").

**Currency.** Of booklet questions naming a currency, 68% use dollars, 14% euros, 18% pounds (72 questions); pounds appear only in cases set in the UK. The pilot ran 81 / 10 / 9: pounds under-used, the safer direction (round 2's 29% pounds read as written).

**"Closest" wording** (`APPROXIMATE` in authored-verify.ts). "About" as a preposition and "estimate" as a noun do not ask for an approximation; 16 of 103 booklet questions ask for the closest value.

**Gridline parity** (`shape.ts`, `GRIDLINE_BAND`). For a chart read from gridlines, the share of values to read that sit exactly on a gridline may be up to 15 points above the source's and 30 below; more on gridlines makes reading easier.

**Distractors.** Of 42 statement questions, 7 have a statement without basis (never two); 2 of 103 questions have an option dominated by another; 2 of 45 numeric questions an evenly spaced wide grid. The judge's landing rules: distances are ratio distances; exact values within a percent or two; closest values within about 5%; coarse options (half, the same, twice, three times) the nearest multiple within about 20%; a slip more than about 20% from the correct option does not land on it merely by being nearest.

**Statements the data does not cover** (`notCovered`). The calculation gate rejects a statement that tests nothing: `true`/`false`, multiplication by zero, no figure from the question, or a verdict unchanged when any one figure is scaled from a thousandth to a thousand times. No bank statement trips it.

**Originality stems.** The booklets share stock stems word for word; their eight-word phrases are left out of the originality index (`STOCK_STEMS` in authored-verify.ts, expanded for Table and Exhibit 1 to 4), and so is any whole short booklet sentence that lies inside one. A stem followed by a source's own continuation still trips; WRITING.md section 8 lists what was tested.

**Whole sentences and titles** (`WHOLE_SENTENCE_WORDS`, `WHOLE_TITLE_WORDS` in authored-verify.ts). A booklet sentence with 6 or more words that carry wording (not numbers, symbols or single letters), or a table or exhibit title or exhibit note with 3 or more once its exhibit number is dropped, is matched whole when it is shorter than eight words in all (longer ones are covered by the eight-word runs). 54 such units. Where the line sits, and why: "Changes to the criteria", 26 November 2026, the originality gate.

**Harness check** (before any candidate was written). 8 booklet questions as candidates of themselves: fidelity passed 8/8, originality and variety failed 8/8. 10 bank questions given a `modelledOn`: fidelity failed 10/10. 2 hand-written faithful candidates (now `calibration/faithful.json`) passed every gate. A chart with a value missing was rejected.

## Files

- `candidates.eval.ts` scores and reports; `judge-input.eval.ts` writes judge inputs, pending batches and the calibration set; `judge-view.ts` builds what each judge sees and its fingerprinted id; `review.eval.ts` writes the owner's review page; `lib.ts` loads candidates, admitted variants, verdicts, booklets, their redrawn exhibits (for the originality index) and the bank; `shape.ts`, `variety.ts`, `traps.ts` hold the measures; `node-fs.d.ts` declares the `node:fs` functions used.
- `WRITING.md` the writer's brief; `judges/*.md` the judge prompts (real-or-generated retired); `source-distractors.json` the booklets' distractor analysis.
- `pilot-sources.json`, `round-2-sources.json`, `round-3-sources.json` each round's sources (round 3 fixes each new variant's id, answer letter and currency); `pilot-notes.md` the pilot's record; `rounds/pilot.md` the pilot's final scorecard; `rounds/source-review.md` the review of the distractor analysis.
- `calibration/broken.json` (broken copies, one defect each; `round: N` marks later additions), `calibration/faithful.json`, `calibration/rewrites.json`; `calibration/input/*.json` and `calibration/key.json` are generated by `npm run eval:judge-input` (deterministic; committed so the judges can be run without the tooling); `calibration/judgements/*.json` the saved calibration verdicts.
- `report/` and `judge-input/` are build output, ignored by git.
