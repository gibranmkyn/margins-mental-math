# Margins

A phone app for practising business mental math, and the AI pipeline that writes and checks its questions.

I'm a product manager. I vibecoded this in three days with Claude Code because I wanted it to exist. The app is the product; the part I'd point an AI PM to is how the questions get made and how I know they are good.

**695 questions · 6 checks on every AI-written one · 97% pass rate after one fix round · 2,100+ automated tests**

<p>
  <img src="docs/screenshots/home.png" width="24%" alt="Home screen: streak, daily goal and the next session" />
  <img src="docs/screenshots/drill.png" width="24%" alt="A typed drill with the on-screen keypad" />
  <img src="docs/screenshots/scenario.png" width="24%" alt="A multiple-choice scenario question with a table" />
  <img src="docs/screenshots/feedback.png" width="24%" alt="Feedback after an answer: the worked solution and the shortcut" />
</p>

## Why mental math

- **You can't check what you can't estimate.** AI hands you a number in a second. Number sense is how you notice it is wrong by a factor of ten.
- **Thinking happens in the room.** A pricing conversation does not pause while someone opens a tool.
- **Use it or lose it.** The skill is easy to outsource now, so it fades unless you practise on purpose.

## The problem I was solving

Good practice questions are scarce. A set of published practice tests runs out after one pass, and once you have seen a question you are remembering, not calculating. So the product question became an AI question: **can a model write new questions that train exactly what the originals train, and how would I know?**

## Where the questions come from

```mermaid
flowchart LR
    S["Practice-test questions<br/>(the reference set, not published here)"]
    S -->|"patterns turned into code"| G["Generated<br/>49 templates, new numbers every time"]
    S -->|"same skills, new stories"| O["Original<br/>162 questions"]
    S -->|"one question in, up to eight out"| V["Variants<br/>533 questions"]
    G --> B(["The app's question bank"])
    O --> B
    V --> B
```

A variant keeps the structure, difficulty and traps of one reference question and changes everything a reader would recognise: company, industry, wording and every number.

## How an AI-written question earns its place

Getting a model to write 500 plausible questions takes an afternoon. Knowing they are correct, unambiguous and as hard as the original is the real work.

```mermaid
flowchart LR
    W["Writer model<br/>drafts a variant"] --> C["4 checks<br/>by code"]
    C --> S["Blind solve<br/>by a second model"]
    S --> J["4 judges<br/>fresh models"]
    J -->|"all pass"| A(["Admitted"])
    J -->|"any fail"| F["One fix round"]
    F -->|"re-checked"| C
    F -->|"still failing"| D(["Dropped"])
```

| Eval I built | What it asks | Why it exists |
|---|---|---|
| **Calculation** (code) | Does the answer recompute from the numbers shown? | A model states a wrong answer as confidently as a right one. Arithmetic should be proved, not judged. |
| **Traps** (code) | Does each declared slip land on a wrong option, and never on the right one? | If a common mistake lands on the correct answer, the app rewards the wrong method. |
| **Originality** (code) | Are the wording, names and figures new? | A variant has to be a new question, not a paraphrase of its source. |
| **Fidelity and variety** (code) | Is it the same shape as its source, and not a copy of a sibling? | Left alone, a model drifts easier or longer, and repeats its own stories. |
| **Blind solve** (model) | Does a model that sees only the question pick the same answer? | The writer cannot see its own ambiguity. A solver without the answer key can. |
| **Four judges** (model) | Is it unambiguous, are the wrong options good, is it realistic, is it as hard as the source? | These are the qualities code cannot measure. One judge per failure mode keeps each verdict narrow. |
| **Judge calibration** | Does each judge catch known-bad questions and pass known-good ones? | A judge is a model too. It has to earn trust before its verdicts count. |

**One standard for every check:** a new question fails only where it is worse than the question it is modelled on.

| | Written | Passed every check first time | After one fix round |
|---|---|---|---|
| The two main rounds | 448 | 379 (85%) | 437 (97%) |

Across the whole project, pilot included, 548 variants were written and 533 are in the bank.

### What makes the checks trustworthy

- **Judges are tested before they are trusted.** Each judge first ran on questions with known verdicts, including copies that had been deliberately broken. A judge was used only if it passed at least 90% of the good ones and caught at least 80% of the broken ones.
- **No model marks its own work.** One model writes, a different one solves blind, fresh ones judge.
- **Checks are tied to the exact text.** Each result is stored against a fingerprint of the question, so editing a question voids its checks.
- **Code first, models second.** Anything that can be computed is computed. Models judge only what code cannot.

## One pattern, many questions

The reference question gave a table of product counts and profits by category, and asked for profit per product after a rise in profits. Its wrong options came from two slips: getting the direction of the change wrong, and losing a factor of ten when converting millions. Eight variants were written from that pattern. Three of them:

| Setting | The change | Right answer | Slip 1: wrong direction | Slip 2: factor of ten |
|---|---|---|---|---|
| Garden products retailer | profits up 10% | £390,071 | £319,149 | £3,900,709 |
| Online sports equipment seller | profits up 20% | $313,043 | $208,696 | $31,304 |
| Kitchenware chain | profits up 10% | £417,722 | £341,772 | £4,177,215 |

Each one is stored with the formula that proves its answer and the formulas for its slips:

```json
"check": { "kind": "value", "answer": "(14 + 6 + 10) * (1 + 20 / 100) * 1000000 / (12 + 64 + 39)" },
"traps": [
  { "slip": "cuts profits by 20% instead of raising them", "option": "$208,696" },
  { "slip": "slips a factor of ten when turning millions into units", "option": "$31,304" }
]
```

## What changed because of what the evals found

```mermaid
flowchart LR
    R["Run a round"] --> E["Read the failures"]
    E --> Q{"Is the question wrong,<br/>or the rule?"}
    Q -->|"question"| X["Fix it or drop it"]
    Q -->|"rule"| U["Change the rule,<br/>write down why,<br/>re-test the judge"]
    X --> R
    U --> R
```

- **Traps became their own check.** In the first round, fourteen candidates let a common mistake land on the correct answer, so a wrong method would have been marked right.
- **One judge was retired.** A "real or AI-written?" judge recognised the published questions, so it could not give a fair verdict. A human sample review replaced it.
- **Tightening a question made it worse.** One variant fixed a loose premise in its source, and the blind solver then ruled out the intended answer. The rule became: as loose as the source, in new words.
- **One solve per question.** Re-solving after seeing the answer key is not a blind solve. Those results were thrown out and counted as failures.

## What I did and what the AI did

| Me | Claude |
|---|---|
| The problem, 93 user stories, what is out of scope | All the code and the tests |
| Success measures: mock score of 70% or more, falling time per drill | The question templates and the question writing |
| The quality bar: the one standard, which checks block and which only warn | Blind solving and judging |
| When to change a rule and when to drop a question | Drafting the docs from my decisions |
| Design direction: a scoreboard for an adult, no mascots, no confetti | |

| If you want to see | Look at |
|---|---|
| Problem framing and scope | [`docs/spec.md`](docs/spec.md) |
| Eval design, and every rule change with its reason | [`evals/README.md`](evals/README.md) |
| The brief the writer model works from | [`evals/WRITING.md`](evals/WRITING.md) |
| Judge prompts | [`evals/judges/`](evals/judges) |
| What each round found | [`evals/rounds/`](evals/rounds) |
| Product and design principles | [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md) |
| The shared vocabulary used by the spec, the code and the prompts | [`GLOSSARY.md`](GLOSSARY.md) |

## Run it

```sh
npm install
npm run dev        # the app, at the address Vite prints
npm test           # tests that need the reference questions are skipped
npm run build
```

The evals themselves cannot be re-run from this repository: they compare each variant with its reference question, and the reference questions are not mine to publish. The code, the prompts, the recorded verdicts and the round records are all here.

TypeScript, Preact and Vite. An installable web app that works offline, with no accounts and no backend. Best viewed at phone width.

## Use

A personal, non-commercial project, shared to show how it was made. No licence is granted: you are welcome to read it, but please do not reuse or redistribute it. If you hold rights in anything here and want it changed or removed, open an issue.
