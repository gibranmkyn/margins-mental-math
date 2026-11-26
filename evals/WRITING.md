# Writing candidates: the brief

You are writing **candidates**: new authored questions for Margins, a case-math practice app, each modelled on one **booklet question** (a question transcribed from a McKinsey PST or BCG practice booklet). A candidate keeps its source's structure, exhibit, difficulty and traps, and changes everything a reader would recognise: company, industry, wording and every number. If it passes the evals (evals/README.md lists every check and its pass rule), a blind solve, four judges and the owner's sample review, it is admitted to the authored bank.

Terms, as the project uses them (GLOSSARY.md): a *booklet question* comes from a booklet; an *authored question* is an original question with fixed wording and numbers; a *generated question* comes from a template with random numbers. Never call anything "synthetic". A *skill* is a question category (break-even-payback, testing-statements, ...); a *tier* is a difficulty step, 1 to 3. A *shortcut* is the fastest mental method, shown after the answer.

You need nothing beyond this file and the repository. Work only in `content/candidates/`.

**The standard is parity with the source.** A candidate fails only where it is worse than the booklet question it is modelled on: easier, harder, looser, odder or more recognisably written. A quirk of the source reproduced (a common slip that still gives the right answer, a no-data statement, a loose premise, a dip in a series, an awkward label) is not a defect. Do not make a candidate cleaner than its source: in the pilot, "fixing" the booklets' quirks made candidates less faithful and slightly harder.

This brief holds every rule a writer needs; the pilot (three rounds, 100 candidates, 2026-11) is where they come from, and the examples below are its findings. Section 10 says how to revise in the fix round; section 13 is a checklist of the slips the pilot's judges found most often.

## 1. Your assignment

The round's source list (for example `evals/round-3-sources.json`) gives each source its number of variants and puts sources in writer groups. Your group is given to you; its sources' `note`s say what each tests, which quirks to keep and what earlier variants got wrong. From round 3 the list also fixes, for each new variant, its id, the letter its answer must sit at, and its currency.

- **Id:** `bk-<source id>-<letter>`, e.g. `bk-pst2-q02-a`. Letters start at `a`, or after the last letter a source has already used, in the bank, in `content/candidates`, or dropped: a source with a to d admitted continues e, f, g, h (an id already in the bank fails the structure gate). Use the ids the source list gives.
- **File:** one file per source, `content/candidates/<source id>.json`, holding a JSON array of its variants.
- **Siblings already admitted: read them first.** Where a source already has variants in the bank (`content/authored/*.json` entries with its `modelledOn`; the source list names them with their industries and answer letters), read every one before you choose a setting. Each new variant takes **a different industry from every admitted sibling and from each other**: not the same kind of business renamed (a second pizza chain, a second sports league, a second food-delivery app). The variety check cannot see that, because common industry words (hotel, coffee, bakery, airline, software) are not counted; the owner is asked to review the families that grow past 4 (a missing review warns; it does not block). Siblings count towards the family cap and the cap of 2 answers at one letter (section 4, "Where the correct option sits").
- **The family cap** (evals/README.md, "Changes to the criteria"): 8 variants where every variant's answer is worked out from its own numbers (numeric, ranking and label options, and statements that differ only in their numbers), 4 otherwise. Once a family has more than 4, each new variant may share at most 15% of its story words with any sibling, not 20%.
- **A statement family past 4: key the claim you are given** (README, "The keyed claim"). Where your source entry has `keyedClaim`, each new variant carries `keys`: which of the source's claims its correct option must make. `keyedClaim.claims` names the claim each source option makes, and `sourceKeys` names the one the admitted siblings usually key. The point is that a reader who knows the family cannot pick the usual claim and be right:
  - **Make the usual claim false, through a slip.** Build the numbers so that the claim the siblings key is false. A common slip should make it look true: the source's own slip on another option turned round, or a natural one (a wrong base, revenue read for profit, absolute growth for relative). Declare that slip in `traps`. You still need as many trapped wrong options as the source has, and the usual claim is now one of them; without a slip it is a filler the distractors judge fails.
  - **Make the `keys` claim true, clearly.** Not a near miss, and the slip the source used on that statement must now land the other way or on another option.
  - **Keep the rest in their roles.** Options in `neverKeyed` stay what the source has: not covered by the data (marked `notCovered`) or dominated. The other statements keep their traps.
  - **Same steps, same exhibit.** The solver still tests every statement with the same work as the source. Only which one is true changes.
  - **Report it if you cannot.** If you cannot make the given claim true and the usual one false with honest numbers, write the variant on another claim from `claims` (not the usual one, not a `neverKeyed` one) and say so in your report, so that the round list's `keys` is changed to match: the eval checks the list, and the person admitting reads your answer against it. Never fall back to the usual claim.
- **Answer letter:** put the answer at the letter the source list gives, by choosing the numbers (section 4). If you cannot keep every trap with the answer there, say so in your report rather than moving the answer.
- **Currency:** use the currency the source list gives (`dollars`, `euros`, `pounds`, or `none` where the source names none); the round assigns them to bring the bank towards the booklets' mix (section 12). Euros go with an unnamed country where euros are plausible; pounds only for a source in pounds. Never name a real country, the UK included (section 4: at most an invented or unnamed country).

## 2. Read the source as the app serves it

Run `npm run eval:candidates` once. It writes every booklet question as served to `evals/report/sources/<id>.json`:

- `context`: what the owner sees. A table the booklet showed as a chart has been replaced by its **redrawn chart** (a `chart` block); copy that block's form, not the transcription in `content/booklets/`.
- `prompt`, `options`, `correctIndex`, `solution`, `shortcut`, and `note` where the booklet's key needed one.
- `fidelity`: the shape your candidate must have and the `allowed` range for each measured count (section 4), the source's `surplusShare` (the share of its given numbers the solution never uses), and, for a chart read from gridlines, `chartValuesOnGridlines` (section 6).
- `distractors`: how the source builds its wrong options, from an analysis of every booklet question (evals/source-distractors.json): `traps` (each slip and the wrong option it lands on), `trappedOptionsRequired` (how many distinct wrong options your traps must reach), `notCoveredAllowed` (how many wrong statements you may mark `notCovered`), and `sourceHas` (no-basis statements, dominated options or a wide grid, which you may use only where the source does; `slipsOnAnswer`, the common slips that in the source itself still give its correct option, each with its working; and `fillers`, the source's wrong options that no slip lands on, each with its kind). The analysis is a model's: if you find a trap it missed, reproduce it too; if you think it names a trap that is not there, say so in your report.

Solve the source yourself before writing. Name, in your notes: the steps of its solution, the exhibit reading it needs, and the trap each wrong option catches. Your candidate keeps all three.

## 3. The entry format

A candidate is an authored-bank entry plus `modelledOn` and `traps`:

```json
{
  "id": "bk-pracC-q21-a",
  "modelledOn": "pracC-q21",
  "skill": "unit-economics",
  "tier": 2,
  "context": [ { "type": "paragraph", "text": "..." }, { "type": "table", "title": "...", "headers": [...], "rows": [[...]] }, { "type": "chart", ... } ],
  "prompt": "...",
  "options": ["...", "...", "...", "..."],
  "correctIndex": 2,
  "solution": ["step", "step", "last step reaches the answer"],
  "shortcut": "...",
  "check": { ... },
  "traps": [ { "slip": "...", "option": "...", ... } ]
}
```

- `skill` and `tier` are the source's. Leave out `targetTimeMs` (it follows the tier).
- `context` blocks: `paragraph` (`text`), `list` (`items`), `table` (`title` optional, `headers`, `rows`; every row as long as the headers), `chart` (section 6).
- Four options, all different. Numeric options share one unit and show four different values. They may mix scales of that unit only where the source does (pracA-q14: "$650,000" beside "$2.5 million"); then the check's `answer` gives the value in the plain unit (dollars, not millions). **Follow the source's order pattern, not ascending by habit**: 87% of booklet numeric questions ascend, and in the pilot's second round every one of the 44 numeric candidates did. Where the source ascends, ascend. Where it does not, copy its pattern: pst2-q25, pst2-q14 and sample-q08 pair each value with its ten-times slip ($5,000, $25,000, $6,000, $30,000), and pst2-q21, pst2-q23 and bcg-q14 list theirs in no order. Never reorder options to get a letter, and never drop a trap to keep an order.
- `solution`: short steps, one per line, as in `content/authored/*.json`: "Weekly tonnage: 2,200 + 1,400 + 1,100 + 1,700 + 2,400 = 8,800 tonnes". Use × ÷ − (true signs), thousands commas, units on every figure. At least two steps; the last reaches the answer.
- `shortcut`: the fastest mental route, one or two sentences, genuinely quicker than the solution.

Two complete, faithful examples are in `evals/calibration/faithful.json` (modelled on pst2-q05 and pracC-q21, which are never used as sources), traps included. Read them; do not reuse their settings.

### The check: four kinds

Every entry carries a `check` that recomputes its answer from numbers the owner can see. Expressions are JavaScript arithmetic; `abs`, `min`, `max`, `sqrt`, `log`, `pow` and the ternary `a ? b : c` are available. **Every literal number in a check must appear in the context or prompt** (for `best` and `truth`, the options count too), except unit constants (24, 30, 52, 60, 100, 360, 365, 1000, 10000, 1000000, 1000000000) and whole numbers up to 12. Write `8000`, not `8,000`.

- **`value`**, for numeric options. `answer` computes the true value in the options' unit:
  ```json
  { "kind": "value", "answer": "9600 / (2200 + 1400 + 1100 + 1700 + 2400)" }
  ```
  The correct option must be the closest, clearly (the runner-up at least 0.5% of the truth further away), and equal the truth as displayed (within half its last digit), or, only if the prompt asks for the closest value (closest, nearest, approximately, best approximates, roughly, "about how many", "about 20%", "estimate the"), within 5% of it. "About" as a preposition ("a conclusion about the data") and "estimate" as a noun ("the council's estimate of 150,000") do not ask for an approximation.
- **`best`**, for options that are choices (names, years, prices, plans, "twice as much", whole years to break even). One score per option; the highest (`"pick": "max"`) or lowest (`"min"`) wins, clearly:
  ```json
  { "kind": "best", "pick": "max", "scores": ["(1.6 - 1.5) * 130", "(1.7 - 1.5) * 100", "..."] }
  ```
  For "minimum whole years" use a feasibility score per option: `"3 * (8000 * 365 * 8 / 1000000 - 12 * 500 / 1000) >= 40 ? -3 : -1000"` (the smallest feasible option wins). For "half / the same / twice as much" score closeness: `"-abs(14 / 14.1 - 1)"`.
- **`truth`**, for statements, thresholds ("At least 1,125") and rankings. One entry per option, exactly one true, each testing the data:
  ```json
  { "kind": "truth", "statements": ["2.9 / 2.4 > 3.5 / 3.1 && 2.9 / 2.4 > 4.6 / 4.2", "(4.6 + 3.5) / (4.2 + 3.1) > 1 + 15 / 100", "...", "..."] }
  ```
  A ranking "B, E, C, D, A" is the statement `b > e && e > c && c > d && d > a` written in the data's numbers.
- **`formula`**, for options that are formulas. List the symbols; `target` is the quantity worked out from first principles. Options are written as the owner sees them, with × ÷ − ^ and % ("2%" means 2 ÷ 100); never `x` or `*` for times. Each option is evaluated at random symbol values: the correct one must equal the target everywhere, each distractor must differ.
  ```json
  { "kind": "formula", "symbols": ["M", "f", "R"], "target": "12 * M * f - 12 * R" }
  ```

### Statements the data does not cover: `notCovered`

Some wrong statements cannot be tested by an expression, because the data does not cover them: prices where the table has none, profit where only margins are given, a flow between groups the survey never tracks, "main reason" read as "only reason". Do **not** invent an expression for them (`0 > 1`, `29 < 22`, `false && ...`, `70 * 0 == 70`). Mark them honestly, with a one-line reason:

```json
{ "kind": "truth", "statements": [
  "11200 / 552 > 18400 / 935",
  { "notCovered": "the table gives margins but no revenue, so profits cannot be compared" },
  { "notCovered": "the table gives no fares or rides" },
  { "notCovered": "maintenance is given only as a share of revenue, never as an amount" }
] }
```

A `notCovered` statement counts as false; it can never be the correct option. You may mark at most as many as the source has wrong statements the data cannot settle (`distractors.notCoveredAllowed`); the report lists every candidate that uses the marker, because for those options it relies on the blind solve and the judges. The calculation gate rejects a statement that tests nothing: one using `true` or `false`, multiplying by zero, using no figure from the question, or giving the same verdict whatever its figures are (each comparison joined by `&&` or `||` is tried with each of its figures scaled up and down).

### Traps: what each common mistake leads to (its own gate)

In the pilot's first round, fourteen candidates let a common mistake land on the correct option, so a candidate who made it was marked right. Declare, in `traps`, every trap of the source as your candidate reproduces it. Each trap is the slip in a few words, the wrong option it leads to (its exact text), and, where one exists, a calculation the gate can check:

| Check | What a trap gives | The gate checks |
|---|---|---|
| `value` | `result`: the slip's result, an expression grounded like `check.answer` | the option nearest the result is the declared one, clearly (a 0.5% wobble does not move it), and the result is not close enough to the correct option to be marked right |
| `best`, numeric options (thresholds, whole years, prices) | `result` and `rule`: `"at-least"` (the first option at or above the result: a minimum), `"at-most"` (a maximum) or `"nearest"`; or `scores`, the check's scores as the slip computes them | the option the rule (or the scores) picks is the declared one, clearly |
| `best`, names or plans | `result`/`rule` or `scores` where you can; otherwise the option alone | as above, when given |
| `truth` (statements, rankings) | the option; `holds` where you can: a true expression showing what the slip makes of it | `holds` is true and tests data (no placeholders) |
| `formula` | the option; `target` where you can: the formula the slip builds | `target` equals the declared option at every sample |

```json
"traps": [
  { "slip": "forgets the monthly running cost", "option": "2", "result": "40 / (8000 * 365 * 8 / 1000000)", "rule": "at-least" },
  { "slip": "takes the self-checkout column's $12 million investment", "option": "1", "result": "12 / (8000 * 365 * 8 / 1000000 - 12 * 500 / 1000)", "rule": "at-least" }
]
```
```json
"traps": [ { "slip": "divides tonnes by pounds instead of pounds by tonnes", "option": "£0.89", "result": "(2200 + 1400 + 1100 + 1700 + 2400) / 9600" } ]
```
```json
"traps": [
  { "slip": "reads the higher margin as the higher profit", "option": "Spokewise earned a larger profit than Velora in 2024", "holds": "19 > 15" },
  { "slip": "ranks by cost alone, ignoring probability", "option": "W, Y, X, Z", "holds": "8 > 5 && 5 > 3 && 3 > 2" }
]
```

Rules:

- Your traps must reach at least as many **distinct wrong options** as the source's traps do (`distractors.trappedOptionsRequired`, at most 3). More traps are welcome; two slips onto one option are fine. Where the source has no trap (`trappedOptionsRequired` is 0: pracC-q02, pst1-q05, pst3-q14 and pst3-q26, whose wrong options are all fillers), none is required: keep its grid and fillers as `sourceHas` describes them, and declare any real slip you do find.
- A declared trap never leads to the correct option. If one of the source's traps (a slip that, in the source, gives a wrong option) lands on your answer, change your numbers until it lands on a wrong option. This is what to check: leaving out a second revenue line or a cost; adding bars without applying the changes; reading an adjacent row; forgetting a cost in a threshold question (the slip must move the threshold past an option, so that the answer under the slip is a different option).
- **Parity:** some booklet questions let a common slip still give the correct option. `distractors.sourceHas.slipsOnAnswer` lists them, worked out with the source's numbers: in bcg-q04, taking the whole second revenue line as profit still picks the right price; in pst2-q03, skipping the growth step gives the right multiple, because both lines grow at nearly the same rate; in pst2-q19, counting four years instead of three year-steps still lands nearest the answer. The same slip may land on your answer too: do not declare it as a trap, and do not change your numbers to move it. The distractors judge is told the source's list and fails only a slip-on-answer the source does not have. Any slip not on the list must still land on a wrong option, never the answer.
- **Fillers.** Some booklet questions keep a wrong option that no slip produces (`distractors.sourceHas.fillers`): pst2-q15's ranking "A, D, C, B", pst2-q03's "three times", pst2-q19's 3.5%, which continues the spacing of 1.5% and 5.5%. Where your source has one, you may keep one of the same kind (a ranking, a step of a coarse scale, a value, a formula, a statement, a label), placed among your options as the note says the source's is, and no more of them than the source. Where the source has none, every wrong option needs a slip. A filler is never declared as a trap.
- For a threshold or minimum question answered with a `best` check, give the slip as `result` with `rule: "at-least"` (or `"at-most"`), so the gate reads it as a candidate reading the options would.

## 4. What stays and what changes

**Stays the same as the source** (the fidelity check enforces the first eight):

1. skill and tier;
2. option kind: numeric, statement, label, ranking or formula (as `fidelity.optionKind` says);
3. four options;
4. the number of tables;
5. the number and kinds of charts, in the same order of kind, and whether each is labelled (values printed) or read from gridlines, with about as many chart values on gridlines as the source (section 6);
6. "closest" wording: if the source asks for the closest or approximate value, so does the candidate, and if not, not;
7. words of context, words of prompt, data cells and numbers given, each within the `allowed` range;
8. a candidate never reuses the source's setting or numbers (sections 5 and 7), and marks no more statements `notCovered` than the source has;
9. the reasoning: the same steps in the same order, the same kind of exhibit reading, the same conversion or threshold, and **every trap of the source reproduced, declared, and leading to a wrong option** (section 3);
10. the exhibit's form and size: as many rows, columns, series and categories as the source, give or take one; the same title style ("Exhibit 1: ...", "Table 2: ...", "Doc 2: ...");
11. **surplus data**: where the source carries rows, columns, series or a whole exhibit the question does not need, so does yours, in about the same proportion. Written questions that give exactly the numbers the question uses were the commonest giveaway. The report's batch table measures the share of given numbers the solution never uses (booklets: a median of 54%); your source's is `fidelity.surplusShare`.
12. the house style of the source:
    - the source's stem. The booklets' stock stems are allowed word for word (section 8); use the source's own kind of stem rather than inventing a smoother one.
    - capitals where the source has them: CLOSEST, TRUE, FALSE, MINIMUM, MOST, LEAST, CANNOT.
    - plain prose. No notes on how to read a chart ("each bar shows ...", "parts sum to 100%") unless the source has one, and no planted caveats ("nobody is counted twice", "all staff work full-time") unless the source has that sentence's job to do.
    - statement options stay full sentences of similar length and structure; a long conditional prompt stays long and conditional.
    - no spurious precision: "36%", not "36.0%", unless the source writes one decimal.

**Changes, always:**

- **the setting, chosen first**. Pick a plain, generic setting as the booklets do: a kind of company ("a regional bus operator", "a chain of garden centres", "an online retailer of spare parts") and, at most, an invented or unnamed country. No real towns, regions or landmarks, no local colour, no national institutions. Then **scale every number to that business**: customers, outlets, staff, volumes, prices, costs and revenue a consultant would accept for it. Check the figures that follow from yours too: revenue per employee, profit per outlet, purchases per customer per year, share of the market or of the population. In the pilot's first round, about 35 candidates had numbers possible but odd for the business (a cinema chain with 500 members; 12 cups of coffee a commuter a week; one city emitting a third of its country's CO2). If the source's arithmetic needs numbers your setting cannot carry, change the setting, not the arithmetic.
- one currency, used consistently with the setting (no Irish chain priced in pounds), and the setting's own terms throughout (no "GP surgeries" in Spain). Mostly dollars, as the booklets are (section 12);
- every number. Keep the arithmetic the same kind (if the source divides 7,000 by 6,850 to get just over 1, yours divides something by something to get a little over or under a round figure). **Numbers as irregular as the source's**: the booklets use values like 6,983, 317 and 230 and their divisions rarely come out exact. Do not engineer numbers that divide cleanly (a machine cost that divides exactly by its life in days, 54 ÷ 0.30), steps that are all multiples of 5 or 50, or two lines that grow by exactly the same rate, unless the source does. **And no heavier than the source's**: irregular means as irregular as the source, not more. Where the source multiplies 90 × 16, do not multiply 715 × 5.42; where its result comes out round (exactly 3 teams, £341), make yours come out round too; where its chart values sit on a gridline or halfway between two, put yours there as often. Several pilot candidates were harder than their sources for this reason alone. Near-equal growth that lets base-year figures give the answer (pst2-q03) is the source's shortcut, a feature to keep: rates a point or two apart, not identical.
- all wording. Rewrite every sentence. You may use the stock stems in section 8.

### Wrong options come from slips, never from another reading

Every wrong option is what a capable candidate gets by a slip: a wrong base, a skipped or doubled step, a unit slip, the wrong row, the wrong side of a threshold. Never build one from a second reasonable reading of the question: the change in percentage points beside the same change in relative percent, a period counted with and without its first year, a simple average beside a weighted one. If the question could be read two ways, fix the reading in the prompt ("in percentage points", "from the end of 2018 to the end of 2021", "weighted by sales"), and make sure no option is the answer under the other reading. Options in "%" where the quantity is percentage points are a slip of yours, not a trap. But fix it no tighter than the source: where the source's premise is loose yet reads one way to a careful solver, keep yours as loose, in new words. pracC-q23 says only "assuming the relationship between premium income and costs remains the same"; a pilot candidate's "courier payments stay at 78% of order revenue and the other costs change only if cut" went past it and made a blind solver rule out the keyed option.

Labels match: an option names things exactly as the context does ("clubs" in the context, "clubs" in the options). A part that the context says belongs to a bigger cost must not sit beside that bigger cost as an option (it is ruled out by wording alone) unless the source does exactly that (`distractors.sourceHas`). Where it does (pracC-q23: administration, part of operations), keep it as the source has it: part of another option's cost, dismissed by reasoning, its share never stated. Likewise a statement about something the data does not cover: where the source has one (pracB-q02's menu prices), keep one.

### Where the correct option sits

A user who meets a source's variants learns where their answers sit. So:

- **At most 2 variants of one source may have the answer at the same letter**, counting variants already admitted. More blocks every waiting variant of that source from admission. The pilot's bcg-q04 (BBBB), pracA-q14 (CCCC) and pst1-q06 (BBBB) broke this.
- Aim for a different letter for each variant (the report warns otherwise), and about a quarter at each letter across your group (the batch warns outside 18% to 32%; the bank as a whole must stay inside it).
- Move the answer by changing the numbers, not the option order: where the options keep a fixed order (ascending prices, a half / same / twice scale), choose numbers that make a different option correct, with the same traps landing on wrong ones. Never reorder options to get a letter, and never give up a trap for a letter; if you cannot meet the cap without that, say so in your report.

## 5. Variety across your variants

Your variants of one source must be different questions, not one question several times, and different from any variant of it already admitted:

- a different kind of business for every variant of the source, admitted ones included, each with its own invented names;
- no two variants sharing more than a fifth of their distinctive story words, or reusing three or more of each other's irregular numbers (the variety check measures both);
- different numbers, so that the answer differs;
- the same structure, steps and traps (section 4).

Variants of one source may share exhibit labels ("Profit margin", "Other reasons", "Direct contribution") and round numbers (1,500, 250, 40, 2.5): the variety check leaves both out, because they are what the source's structure dictates. Use the plain label the source would use; do not strain for a synonym ("Another purpose drew me to ...") or nudge 1,500 to 1,520. What the check still catches is a renamed copy: the same story told twice with the names swapped, or the same irregular numbers.

## 6. Charts

A chart block (full definition in `src/engine/question/types.ts`, `ChartBlock`):

```json
{
  "type": "chart", "chart": "line", "title": "Chart 1: Material delivered to the depot on each day of the week",
  "unit": "Material delivered, tonnes", "categories": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "series": [{ "name": "Material delivered", "values": [2200, 1400, 1100, 1700, 2400, 0, 0] }],
  "axis": { "min": 0, "max": 3000, "step": 500 }, "labelled": false, "decimals": 0
}
```

Kinds: `bar`, `stacked-bar`, `stacked-bar-100`, `line`, `indexed-line`, `pie`, `cumulative`, `waterfall`, `scatter`. Start from the source's chart block and change its content; keep its optional fields (`horizontal`, `barNotes`, `barNoteRows`, `groups`, `totals`, `axisRight`, `prefix`, `suffix`, `note`, `highlight`, and for a scatter `x`, `xAxis`, `xUnit`, `join`, `references`) where the source uses them. The evals reject a chart that would not draw soundly:

- at most four series, each with one value per category, all finite;
- `axis` from `min` to `max` in whole `step`s, covering every plotted value (stack ends, running totals, waterfall levels); a right-hand series needs `axisRight`;
- a pie: one series, positive slices, adding to 100 when `suffix` is "%"; a 100% stack: no negative parts, each bar adding to 100 when given as "%";
- a cumulative chart never falls; a waterfall has one series and lists its total bars in `totals`;
- `barNotes`, `barNoteRows`, `horizontal` and `groups` only on bar kinds; `groups` counts adding to the categories;
- a scatter has one series, one `x` per point, an `xAxis` and an `xUnit`.

**Charts read from gridlines** (`labelled: false`), if the source's is:

- **Reading.** A careful reader reads a value on a gridline, or exactly halfway between two, as exact, and places any other value to within about a quarter of a gridline step (the same rule the ambiguity judge applies, evals/judges/ambiguity.md). Place values so that every reading within that (a quarter step off, the worst case not stacked across values) gives the same answer. A misreading of half a step or more is a slip: it may land on a wrong option, never on the answer.
- **Parity**. Values the solver must read fall between gridlines as often as the source's: the share of your chart's values that sit exactly on a gridline must be no more than 15 points above the source's and no more than 30 below (`fidelity.chartValuesOnGridlines`; a stacked bar counts its segment edges, a waterfall its levels). The pilot's first round put every value of some charts on a gridline where the source made the solver estimate between them.
- **The blind solve** sees such a chart as readings to a quarter of a gridline step, not your exact values (scripts/authored/export-candidates.mjs): a question whose key turns on a finer reading will fail it.

## 7. Originality

The originality gate rejects a candidate that uses:

- a booklet name: any case title or company, product or person name from the booklets (Selecto, mybasket.com, Freddie's, PharmaCo, Marcadia, McKinsey, ...);
- any run of **eight consecutive words** found anywhere in a booklet (context, prompt, options, explanation, tip) or in a source's redrawn chart as `evals/report/sources/<id>.json` shows it (title, unit line, note, labels), punctuation and case ignored, stock stems excepted (section 8);
- a **whole booklet title or short sentence**, even under eight words: a chart or table title or chart note of three or more words once its "Exhibit 3:" is dropped ("Exhibit 3: Average one year value", "Average after 90 days"), and a sentence of six or seven words from the booklet's text, worked solution or tip ("Profit is proportional to revenue × margin index."). It counts wherever it appears, in a title, a series name, a unit line or a solution step. Keep the source's exhibit number ("Exhibit 3:") and its plain labels, but write the title in your own words ("Exhibit 3: One year value, average"). Still allowed, because they are generic: the exhibit number alone, one- or two-word titles ("Exhibit 2: Taste"), unit lines ("Revenue, $m", "% of all respondents"), year and index labels ("2010-2013", "Index, H1 2011 = 100"), labels and options, equations ("Profit = revenue × margin") and short sentences ("Country D is highest.");
- more than two **distinctive figures** (three or more significant digits, years aside) shared with any single booklet question.

The variety check adds, against your source and your sibling variants: no more than a fifth of distinctive story words shared (paragraphs, lists, titles and notes; exhibit labels, generic business words and calendar words do not count), and no more than a quarter of your irregular numbers (three or more) reused. Years, whole numbers up to 12, 100 and round numbers are not counted.

## 8. Question stems (checked)

Stock stems are allowed, and preferred where the source uses one: the booklets share them word for word, and the originality check exempts them, expanded for Table and Exhibit 1 to 4. These pass:

- "Which of the following statements is true?" / "...is true, based on the data above?"
- "Which of the following statements is a valid conclusion?" / "...a valid conclusion, based on the data presented in Table 2 and Exhibit 1?" / "...based on the exhibit?"
- "Which of the following statements can be concluded from the data in Exhibit 3?"
- "Which of the following cannot be concluded from the information presented in Exhibit 2?"
- "Which of the following statements is most accurate regarding the data in Table 1?"
- "Which of the following statements is true, based on the information provided in Exhibit 1?"
- "Which of the following values best approximates the staff cost per tonne?"
- "Which of the following statements is supported by the data in Exhibit 1?" / "Based on Exhibit 1, which of the following statements is true?"
- "Which of the following is closest to the expected profit?" / "...is CLOSEST to ..."
- "Which of the following lists is the best ranking of the ..."; "Which of the following would be the MINIMUM ..."

What still trips the check is a stem followed by the source's own continuation, or a source prompt copied with the names changed:

- "Which of the following figures is closest to the average cost per tonne?" trips ("the following figures is closest to the average" is in pst2-q25). Write "...closest to the cost per tonne, on average?".
- "What is the minimum number of years for the company to break even?" trips (pst2-q05). Write "How many full years does the chain need before the lockers have paid for themselves?".
- "What is the correct ranking of the five quintiles in Exhibit 1?" trips (pracA-q13, pst3-q03).

If a phrase trips, the report quotes it and names the booklet question: reword past it.

## 9. The loop

1. Write or revise the source's file in `content/candidates/`.
2. Run `npm run eval:candidates`. It prints `evals/report/candidates.md` (the full record is `evals/report/candidates.json`).
3. Find your ids under "Candidates with findings" and fix every finding:
   - **gate, structure**: shape of the entry (options, table rows, chart soundness, malformed numbers, numeric options' unit and distinct values);
   - **gate, calculation**: the check does not reproduce the answer, uses a number the owner cannot see, or has a statement that tests nothing (use `notCovered`, section 3);
   - **gate, traps**: no traps declared where the source has some, a trap that lands on the correct option or not on the option declared, or fewer trapped options than the source;
   - **gate, chart drawn**: the chart could not be drawn at phone width;
   - **gate, originality**: booklet names, phrases, whole titles or sentences, figures (section 7), in the question or in a trap's slip;
   - **fidelity**: a measure outside its range or a feature that differs from the source (section 4), including gridline parity and the `notCovered` allowance;
   - **variety**: keeps the source's or a sibling's story or numbers, or shares context wording with another question.
4. Repeat until each of your candidates shows as **ready** ("ready, waiting for the blind solve or judges"). Do not chase "not yet blind-solved" or "not yet judged": the blind solve and the judges run later, by others, on ready candidates. Also clear any "Source families" line naming your source (too many variants, or too many answers at one letter: these block). Ignore the batch table except where a line names something in your control (ascending options, gridline values, surplus data, the currency mix, years named and how recent they are, arithmetic heavier than the source's).

When all your candidates are ready, report: your ids, one line per source on how each variant differs (setting, numbers, answer letter), each trap you could not reproduce or found missing from `distractors.traps`, and anything in a source you could not keep (and why).

## 10. Revising a candidate (the fix round)

A round has one fix round; what still fails after it is dropped. For each of your candidates with a finding:

1. Read its lines in `evals/report/candidates.md` (gates, fidelity, variety, blind solve, judges, owner, and its source's family line). Clear every one. Judge verdicts stop counting once you change the text (the report counts them as stale and the judges run again on the changed candidates only), so do not keep old wording to keep a pass.
2. Fix towards the source, not past it: a premise as loose as the source's, a no-data statement, dominated option or filler where the source has one, the source's shortcut, arithmetic and chart readings no heavier than the source's (section 4), a common slip that lands on the answer only where `slipsOnAnswer` says the source's does too (section 3).
3. Check the register against section 12 and the checklist in section 13, measured against your source, not an ideal.
4. Keep what was right. If a candidate needs nothing, change nothing.
5. Run the loop (section 9) until ready.

## 11. Do not

- Edit anything outside your own files in `content/candidates/` (not the evals, not the checks or judgements folders, not the booklets).
- Copy the faithful examples, another writer's settings or a bank question's wording.
- Make a question easier or harder than its source to get it past a check; fix the numbers instead.
- Change a source's answer logic because the check is awkward to write: every source judged suitable can be expressed with the four check kinds and `notCovered`.
- Write a placeholder expression for a statement you cannot test, or a trap `result` that you tuned to land on an option without being the slip's real result.

## 12. What marks a candidate as written

In the pilot's second round, model judges told candidates from booklet questions 99% of the time (197 of 200), most often from one question read alone. Some of that was the judges recognising the published cases, but these were the tells they named, with what the 103 booklet questions actually do. Match the source's register; do not add errors gratuitously.

- **Currency.** Of the booklet questions naming a currency, 68% use dollars, 14% euros, 18% pounds (72 questions; 29 name none). Pounds appear only in four cases set in the UK and saying so (a Manchester hospital, a UK baby retailer, a UK confectionery group, a London charity); euros in six (three of them beside dollars), dollars in the rest, including a German basketball league priced in dollars. The pilot's second round used pounds in 29% and euros in 30%; the bank's variants after round 2 were about 92% dollars. Where the source list assigns a currency, use it; otherwise use the source's currency where your setting allows it, dollars by default, and pounds only where the source is in pounds. Name no real country with it (section 4). The batch table measures the mix.
- **Years.** 74% of booklet questions name no year. Those that do date their data 2004 to 2014, mostly 2010 to 2013 ("since 2000" as a baseline; 2016 and 2023 appear only as projection horizons). The pilot's second round named years in a third of its candidates, 97% of them after 2016 (2018 to 2025). Name a year only where the source does, and use the source's years or ones within 2008 to 2014 (years are not counted by the originality or variety checks). The batch table measures both.
- **Vocabulary and spelling.** The booklets are international business English. Spelling varies by booklet and is not itself a clue (PST 1 and 3 and the BCG test write "labour", "organisations", "litre"; Practice Tests A and B write "organization", "labor"; Practice Test C writes "trash" and "garbage" beside "analysed"), but no booklet uses colloquial British words. The pilot's "dearer", "lorries", "takings", "neighbourhood bakeries" read as written. Use plain words a non-British reader would use ("more expensive", "trucks", "revenue", "sales"), and follow your source's spelling.
- **Company names.** Booklet cases are named like products or pitch decks: coined or playful (StarCoffee, Babylove, Mail-It, Milky Choc, Selecto, Liftex, Marcadia, ExpensiveOil, mybasket.com), generic with a stock suffix (PharmaCo, InCo, Energy Data, National Garbage Inc, Imagine Learning), a first name (Freddie's Shrimp Shack, Paul Bakery), an acronym (WFGLA), or none at all ("the client", "a professional basketball league"). The pilot's names were mostly plain British place-and-surname names (Brannock, Hollin, Ashgrove, Elmbridge, Fernhill, Kettlewell, Oakham & Pryce). Name your company in your source's style; where the source has no name, give none.
- **Cut from a longer case.** A booklet question reads as one page of a case: 18% refer to "the CEO", "the team", "your team" or "the client" without introducing them, and 55 of the 90 with an exhibit open on one not numbered 1 (Exhibit 2, Exhibit 3, Table 2, Exhibit 4a, Doc 2). The pilot's contexts explained themselves, with 4% such references and 40 of 84 first exhibits not numbered 1. Keep your source's exhibit numbers and labels (its "Doc 2", its "Exhibit 4a"), and refer to people as the source does, without introducing them more than it does.
- **Totals worked backwards.** Where the source's figures do not add to a round total or give an exact answer, yours should not either: do not pick the answer first and work the data back from it so that everything comes out exact (section 4, "no heavier and no lighter").
- **Options.** Numeric options in the source's order pattern (section 3), spaced as the source's are: do not build wrong options by changing one operator at a time, and do not space them evenly unless the source does (its grid of 0.5%, 1.5%, 3.5%, 5.5% is uneven).
- **Prose.** Booklet prose is plain and a little uneven: an occasional awkward or non-native phrase ("how much profits would the gardening category generate", "thru"), labels not quite consistent between exhibit and text, keywords in capitals (SMALLEST, FALSE, MOST, LEAST). Smooth, uniform, explanatory prose marks a candidate as written. Write in the source's register: its sentence length, its stem, its capitals, its label style. Where the source is awkward in one place, you may be plain but not polished; never add a typo or an error that changes meaning.

A source's quirk reproduced is not a defect. A candidate that reads exactly like its source, quirks included, is the target.

## 13. Checklist: what the pilot's judges and solvers found

Each of these failed or nearly failed a pilot candidate. Check every one before you report.

- **Labels match.** Options name things exactly as the context does ("clubs" in the context, "clubs" in the options); an exhibit's title and the text agree ("First 90 days" and "for the first 90 days", not "after the first 90 days" against "the first 90 days").
- **One setting, its own terms.** One currency, consistent with the setting (no Irish chain priced in pounds); local terms only where they belong (no "GP surgeries" in Spain, no "limited companies" in Canada).
- **Numbers scaled to the business** (section 4), including what follows from them: profit per outlet, purchases per customer, share of the market, a probability per year (a 60% annual chance of a serious flood reads as wrong).
- **Periods stated.** An average spend, a rate or a count says its period (per visit, per week, a year), as the source does.
- **A statement no looser than the source's.** A keyed statement about "all passengers" where the chart covers long-haul passengers only is looser than the source; a false statement that works only if a cost counts as "spent on visits" must say so as the source does; a grouping ("public funding") must be as plain as the source's.
- **Dips and quirks at the source's size.** A series may dip where the source's dips, once, about as much (pst3-q04's quintile 3 below quintile 2); not more often.
- **Answers that survive reading.** For a chart read from gridlines, the answer holds when every value is read a quarter step off (section 6); the blind solver sees only such readings. A pilot candidate's answer moved from 1.2 to 1.09 this way.
- **No second reading behind an option.** Fix the reading in the prompt where the source does (percentage points, the exact period), and check no option is the answer under the other reading (section 4).
- **Slips land where you declared them,** and none of the source's slips lands on your answer unless `slipsOnAnswer` lists it. In particular: leaving out a second revenue line or a cost; forgetting to multiply by a volume per customer (bk-bcg-q04-a: the source's same slip gives a wrong option, the candidate's gave the answer); reading an adjacent row; adding bars without applying changes; a threshold that a forgotten cost does not move past an option.
- **The source's own features kept:** its shortcut (pst2-q03's near-equal growth), its no-data statement (pracB-q02), its loose premise and dominated sub-cost (pracC-q23), its filler (pst2-q15), its surplus data and its exhibit numbering.
