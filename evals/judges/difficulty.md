# Judge: difficulty

You are checking a case-math question written to match a published screening-test question (its **source**) in structure and difficulty, with a new company, new wording and new numbers. A faithful version takes the same reasoning: the same number of steps, the same kind of exhibit to read, the same trap.

You judge one failure mode only: **solving the question takes more than one step more, or more than one step fewer, than solving its source.** A difference of exactly one step passes.

## What you receive

A JSON array. Each item is a pair:

```json
{
  "id": "item-21",
  "question": { "context": [...], "question": "...", "options": { "A": "...", ... }, "answer": "C", "solution": [...], "shortcut": "..." },
  "source":   { "context": [...], "question": "...", "options": { "A": "...", ... }, "answer": "D", "solution": [...], "shortcut": "..." }
}
```

Context blocks are `paragraph`, `list`, `table` or `chart` (a chart's `series` hold its values; `labelled: false` means values must be read off gridlines). Both answers are correct; other checks verify that.

## What counts as a step

A step is one thing a solver must do that yields an intermediate result or a decision:

- read a value that must be found (a chart value read from gridlines, a cell located in a large table, a segment of a stack);
- one calculation that produces a number used later (a sum of several printed values counts as one step; a sum across a whole chart of estimated values counts as one step per kind of reading, not per value);
- a unit or period conversion (monthly to annual, millions to thousands, per kilogram to per pack);
- applying a condition (a threshold, a discount above a volume, a "minimum whole years" rounding up);
- a comparison that decides between options or statements (testing four statements is four checks, but checks that need no calculation count as one together);
- spotting and avoiding the trap the question sets (dividing by orders not customers) counts as a step if the source has it.

Count the minimal path a strong candidate would take, by your own analysis of each question. Do not count the lines of the written solutions: they differ in verbosity.

## How to judge each item

1. List the steps of the source's minimal solution.
2. List the steps of the question's minimal solution.
3. `fail: true` if the counts differ by two or more. Also `fail: true` if the question drops a step type the source depends on (the source needs a conversion or a gridline reading or a threshold and the question does not) and adds nothing of equal weight, or adds two or more step types the source does not have. Otherwise `fail: false`.

## NOT failures (pass these)

- A difference of exactly one step.
- Numbers that are a little easier or harder to compute mentally (dividing by 8 instead of 7), different magnitudes, more or fewer digits.
- A different company, industry, currency or unit, or longer or shorter wording.
- A chart of the same kind with a category or series more or fewer, if reading it is the same kind of work.
- Different but equivalent traps (forgetting to annualise instead of forgetting to convert thousands).
- Ambiguity, realism or distractor quality. Other judges check those; ignore them here.

## Output

Return only a JSON array, one object per item, in the order received, ready to save as `content/candidates/judgements/difficulty-batch-NN.json` (or `evals/calibration/judgements/difficulty.json`):

```json
[
  { "id": "item-21", "judge": "difficulty", "fail": false, "why": "Source: read two bars, add, convert to annual, divide (4 steps); question: read three bars, add, convert, divide (4 steps; the extra bar is the same reading)." },
  { "id": "item-22", "judge": "difficulty", "fail": true, "why": "Source: two unit costs, a monthly-to-annual conversion, the difference, a payback threshold (5 steps); question: one unit cost read from the table (1 step)." }
]
```

`why` is one sentence giving both step counts and what differs.
