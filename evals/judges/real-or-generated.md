# RETIRED: do not run (judge: real or generated)

> **Retired after the pilot (2026-11).** This is not a gate and no longer feeds the scorecard or admission. It proved invalid: judges recognise the published cases themselves, so every batch, half real by design, could not be passed whatever the candidates were like (round 2: 197 of 200 told apart). Its replacement is the owner's review of a sample on the review page (`npm run eval:review`, verdicts in `content/candidates/judgements/owner.json`; see evals/README.md). Kept only as a record of what the pilot asked; `npm run eval:judge-input` no longer writes its batches or calibration.

You will see a batch of multiple-choice case-math questions. About half are real questions from published consulting screening practice tests (McKinsey Problem Solving Test practice booklets, a BCG Potential Test sample). The rest were written to imitate them. Your task is to tell which is which.

You judge one thing only: **does this question read as written to imitate the real tests, rather than taken from one?** `fail: true` means "written"; `fail: false` means "real".

## What you receive

A JSON array. Each item:

```json
{ "id": "q-3f9a1c20", "context": [ ...blocks... ], "question": "...", "options": { "A": "...", "B": "...", "C": "...", "D": "..." } }
```

Ids are opaque and carry no information. Context blocks are `paragraph`, `list`, `table` or `chart`. A chart is given as the data it draws (`chart` kind, `categories`, `series` values, `unit`, axis); real questions' charts were redrawn into this same form, with the same fields in the same order, so the JSON format itself is not a clue. Where a chart's values are not printed (`labelled: false`), the values given are what a reader would read off its gridlines (to a quarter of a gridline step), for real and written questions alike, so how round they are is not a clue either. Tables and exhibits keep their titles ("Exhibit 1: ...", "Table 2: ...") in both kinds.

A batch never holds two questions on one case or company, nor a written question beside the real one it follows.

You do not see answers or solutions.

## How to judge

Read each item on its own and compare across the batch. Signs worth weighing (none is decisive alone):

- how the context is built: real questions often carry more data than the question needs, mix several exhibits, and use a case's own jargon; imitations may hold exactly the numbers needed;
- the wording of the question and options: real tests have house phrasings, occasional awkwardness and inconsistency; imitations may be smoother, more uniform, or oddly specific;
- the numbers: real data has irregular values (317 returns, $6,850, 4,117 of 9,352); imitations may be too round or too tidy;
- the options: how distractors are built, how statements are phrased, their spacing;
- anything else you notice. Say what it was.

Guess for every item, even when unsure. About half of each batch is real; do not label them all one way.

## Output

Return only a JSON array, one object per item, in the order received, ready to save as `content/candidates/judgements/real-or-generated-batch-NN.json` (or `evals/calibration/judgements/real-or-generated.json`):

```json
[
  { "id": "q-3f9a1c20", "judge": "real-or-generated", "fail": true, "why": "Every number in the table is used exactly once and the context has no extra data." },
  { "id": "q-81be04d7", "judge": "real-or-generated", "fail": false, "why": "Irregular survey counts and a clumsy, test-like stem." }
]
```

`why` is one sentence naming the main clue. The evals score your accuracy over all batches: near 50% means the written questions pass for real.
