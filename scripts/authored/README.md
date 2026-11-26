# Authored bank: re-checking a question

Every authored question (`content/authored/<skill>.json`) must pass two checks before the app serves it:

1. **Its own calculation.** The entry's `check` recomputes the answer from numbers the owner can see. `npm test` runs it.
2. **An independent check.** Someone who has not seen the bank (a fresh model session, or a person) solves the question from its visible text alone and picks the same option. The result is recorded in `content/authored/checks/independent-check.json` against a fingerprint of the visible text (context, prompt, options).

If you edit a question's context, prompt or options, its fingerprint changes and `npm test` fails with `au-XXX: changed since its check`. That is deliberate. Re-check the question like this:

```sh
# 1. Export only what the owner sees (no answer, solution or check) for the edited questions.
node scripts/authored/export.mjs content/authored /tmp/authored-check 1 au-037,au-052

# 2. Give /tmp/authored-check/batch-1.json to the independent checker. It must not see the bank.
#    Ask it to solve each question and answer as JSON:
#    [{ "id": "au-037", "choice": "B", "working": "48.4 / 40 = 1.21; sqrt = 1.10, so 10%" }, ...]
#    Save that as /tmp/authored-check/answers.json.

# 3. Compare with the bank's answers. This writes nothing.
node scripts/authored/compare.mjs content/authored /tmp/authored-check/answers.json

# 4. Only if they agree, record the check (questions the checker got wrong are left unrecorded).
node scripts/authored/record.mjs content/authored content/authored/checks/independent-check.json /tmp/authored-check/answers.json

# 5. Confirm.
npm test
```

If the checker disagrees, the question or its answer is wrong or ambiguous. Fix it and check it again. Do not record a disagreement.

To check many questions at once, raise the batch count (`export.mjs ... 4`). Questions are shuffled across batches so each batch mixes skills and tiers, and each batch can go to a separate checker.

`rebalance.py` is a one-off helper the bank was built with. It spreads the position of the correct option evenly across A to D. It rewrites the content files and so changes fingerprints: every question it moves needs re-checking afterwards.

## Candidates modelled on booklet questions

New authored questions modelled on booklet questions wait in `content/candidates/` until they pass the candidate evals. Their blind solve uses `export-candidates.mjs` in place of `export.mjs`: it hides each candidate's id (which names its source) behind an opaque one, writes the key to `<outDir>.map.json` beside the batches, and gives charts read from gridlines as readings to a quarter of a gridline step. Pass that map to `compare.mjs` and `record.mjs` with `--map`, with `content/candidates` as the content directory, recording into `content/candidates/checks/independent-check.json`; `record.mjs` then refuses an answer on a question whose text changed since the export. The whole flow (write, eval, blind solve, judges, owner review, report) is in `evals/README.md`; the writer's brief is `evals/WRITING.md`.

## Admitting candidates

```sh
# 1. See what would move. Runs the candidate evals first, so the admissible list is the current one; writes nothing else.
npm run admit:candidates -- --dry-run

# 2. Move them.
npm run admit:candidates

# 3. Confirm.
npm run typecheck && npm test && npm run build
```

`admit.mjs` reads the admissible list (`admit: true`) from `evals/report/candidates.json` after running the candidate evals. With `--no-eval` it uses the report as it is, and refuses if it is missing or older than any candidate, record, verdict, bank file or eval source. Before moving anything it checks that every admitted candidate's blind-solve record matches its current text and agrees with its key, and that the bank's answer positions stay within 18% to 32%; any problem and nothing moves.

For each admitted candidate it:

- appends the entry to `content/authored/<skill>.json` with its id (`bk-<booklet question>-<letter>`), `modelledOn` and content unchanged, but without `traps`;
- moves its blind-solve record into `content/authored/checks/independent-check.json` (the fingerprint covers context, prompt and options, not the id, so it carries over as it is);
- keeps its `traps` in `content/candidates/admitted/traps.json`. Traps are eval metadata: the app never reads them, and in the bank they would add about 50 kB to the bundle;
- removes it from `content/candidates` (a file left empty is deleted) and its record from `content/candidates/checks`.

Candidates that are not admissible stay in `content/candidates`, and the dry run says why each one is not. Judge verdicts stay in `content/candidates/judgements`. Running it again moves nothing more, and a run cut short is finished by the next one.

The bank's content test accepts both id forms: `au-NNN` for questions written free, and `bk-` for questions modelled on a booklet question, whose id must name that question. A `bk-` question keeps its numeric options in its booklet question's order, so the ascending-order rule applies to `au-` questions only.
