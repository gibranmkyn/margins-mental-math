> This is the spec the app was built from, kept as written apart from the edits needed to publish it. The booklet questions it mentions are not in this repository.

## Problem Statement

I want my mental math to be fast and reliable, and it is not. The hardest business arithmetic I know of is in consulting screening tests, so that is what I practise on. The practice material I own is a folder of PDF test booklets (screening practice tests and a calculation workbook). They are awkward to use: they need a printer or a laptop, they run out after one pass, they give no sense of which kinds of calculation I am weak at, and nothing about them pulls me back to practise every day. I want to practise in the spare minutes I actually have, on my phone, and see myself getting measurably faster and more accurate.

## Solution

Margins: a single-user, installable web app for the phone that turns case math into a daily habit. It offers short sessions of typed mental-arithmetic drills and multiple-choice scenario and chart questions, and spot checks of one or three test-level questions, drawn from three sources: the booklet questions I already own, generated questions that never repeat, and an authored bank of original scenarios. Every answer is followed by the worked solution and the fastest shortcut. A light game layer (streak, mastery per skill, sprint personal bests, XP, consulting-rank levels, badges) rewards consistency and real improvement. Timed mocks and a trends view tell me whether it is working, measured two ways: mock score of 70% or more, and falling average time per drill.

Vocabulary in this spec follows GLOSSARY.md at the repo root.

## User Stories

### Getting in and getting started

1. As the owner, I want to install Margins to my phone's home screen, so that it opens like an app rather than a website.
2. As the owner, I want Margins to work with no connection once installed, so that I can practise on the train or a plane.
3. As the owner, I want to start practising with no sign-up or login, so that nothing stands between me and the first question.
4. As the owner, I want my progress kept on my phone between visits, so that streaks, mastery and XP persist.
5. As the owner, I want one prominent "next session" action on the home screen, so that I can start practising in one tap.

### Drills

6. As the owner, I want drills in ten skills (addition, subtraction, multiplication, division, percentages, large numbers, compound growth, fraction and percent conversions, percentage change and reverse, weighted average and mix), so that I can build each component of case math separately.
7. As the owner, I want to answer drills by typing a number on a large on-screen keypad, so that I must compute rather than eliminate options.
8. As the owner, I want the keypad to support decimals, negative numbers and magnitude shorthand (k, m, bn), with the answer's unit (such as %) shown on the board rather than typed, so that I can enter large answers quickly.
9. As the owner, I want easy drills marked exactly, so that I build precision where precision is achievable.
10. As the owner, I want hard drills (long multiplication, long division, compound growth) marked within a tolerance of about 3%, so that sound estimation is rewarded.
11. As the owner, I want to be told before I answer whether a drill needs an exact or an approximate answer, so that I choose the right method.
12. As the owner, I want to see the exact value after a tolerance-marked answer, so that I know how close I was.
13. As the owner, I want drill difficulty in three tiers that adapt to my mastery of that skill, so that I am always stretched but not drowned.

### Scenario and chart questions

14. As the owner, I want scenario questions that set up a business situation with tables or lists and ask for a calculated result, so that I practise the math in the form it appears in cases.
15. As the owner, I want scenario questions to be multiple choice with closely spaced options, so that I practise estimating against options as in screening tests.
16. As the owner, I want chart questions with real drawn charts, so that I practise reading values before calculating.
17. As the owner, I want charts in bar, stacked bar (including 100% stacked), line (including indexed series), pie, cumulative and waterfall forms, so that I meet every exhibit type the booklets use.
18. As the owner, I want charts to be sharp and legible on a phone held upright, so that reading error comes from me and not the screen.
19. As the owner, I want wide tables to scroll sideways inside the question, so that nothing is cut off.
20. As the owner, I want scenario and chart questions covering break-even and payback, percentages in context, growth and trends, unit economics, ratios and comparisons, averages and mixes, building formulas, testing statements against data, and expected value, so that the recurring booklet archetypes are all represented.
21. As the owner, I want generated scenario and chart questions to use new numbers every time, so that I cannot memorise answers.
22. As the owner, I want an authored bank of varied one-off scenarios alongside the generated ones, so that practice does not feel like the same few stories with different numbers.
23. As the owner, I want my 103 booklet questions included, each labelled with its booklet and question number, so that I get value from the material I own.
24. As the owner, I want booklet questions that depended on an exhibit to show that exhibit redrawn as a chart of the original type, so that booklet questions also train chart reading.
25. As the owner, I want every question to be self-contained on one scrollable screen, so that I never need to refer back to an earlier question.

### Feedback and learning

26. As the owner, I want to know immediately whether my answer was right, so that the correction lands while the problem is fresh.
27. As the owner, I want a concise worked solution after every answer, so that I can see where my method diverged.
28. As the owner, I want the fastest shortcut for the question shown after every answer, so that I learn quicker methods and not just correct answers.
29. As the owner, I want the correct option highlighted when I pick a wrong one, so that I can compare the two.
30. As the owner, I want a quiet pace bar that drains toward a target time without showing digits, so that I feel time pressure without staring at a clock.
31. As the owner, I want a speed bonus when I answer correctly inside the target time, so that speed is rewarded but slowness is not punished.
32. As the owner, I want my time on every question recorded, so that speed trends can be shown later.

### Sessions

33. As the owner, I want a drill session to be exactly 5 drills, so that it fits in about two minutes.
34. As the owner, I want a scenario session to be exactly 3 scenario or chart questions, so that it fits in about four minutes.
35. As the owner, I want the app to pick the skill I most need (weak, or not practised recently), so that I do not avoid my weak areas.
36. As the owner, I want a skills screen where I can start a session in any skill I choose, so that I can override the app's pick.
37. As the owner, I want a session summary showing score, XP earned, time and anything unlocked, so that each session ends with a sense of progress.
38. As the owner, I want to start another session straight from the summary, so that I can keep going when I have time.
39. As the owner, I want to leave a session part-way without losing credit for the answers already given, so that an interruption costs nothing.
40. As the owner, I want every session question to require an answer, so that every question produces feedback.
40a. As the owner, I want no session, spot check or mock to hold two siblings (two questions modelled on the same booklet question, or one beside the booklet question it is modelled on), and a question's siblings kept out of the rest of the day I answered it while others are left, so that I meet each structure once at a time and a variant never gives away its source.

### Retries

41. As the owner, I want a missed question to return as a retry in my next session of that kind, so that I fix mistakes while they are fresh.
42. As the owner, I want a retry of a booklet or authored question to be the same question, so that I prove I can now solve that exact problem.
43. As the owner, I want a retry of a generated question to be a fresh question of the same kind, so that I prove the method rather than recall the number.
44. As the owner, I want a retry I answer correctly to return once more about three days later and then be cleared, so that I confirm the lesson stuck.
45. As the owner, I want a retry I answer wrongly to keep returning, so that it is not dropped until fixed.
46. As the owner, I want to see how many retries are pending, so that I know what is outstanding.

### Sprints

47. As the owner, I want a 60-second sprint in a single drill skill, so that I can test raw speed.
48. As the owner, I want a sprint scored by the number of correct answers, so that the goal is unambiguous.
49. As the owner, I want my personal best per drill skill shown before a sprint and updated after, so that I always have a number to beat.
50. As the owner, I want a celebration when I set a new personal best, so that improvement feels like an event.
51. As the owner, I want sprints to move to the next drill instantly after each answer, so that no time is lost to feedback screens.

### Mocks

52. As the owner, I want a short mock of 10 questions in 20 minutes and a full mock of 26 questions in 55 minutes, so that I can test myself under time pressure at two commitment levels.
53. As the owner, I want mocks made only of scenario and chart questions in multiple choice, so that they resemble a screening test's quantitative section.
54. As the owner, I want a mock to be about half booklet questions I have not yet answered correctly and half generated or authored questions, so that mocks stay fresh after the booklet questions run out.
55. As the owner, I want no feedback during a mock, so that it feels like a test.
56. As the owner, I want to skip a mock question and return to it, and to change an answer before submitting, so that I can manage my time.
57. As the owner, I want a visible countdown in a mock and automatic submission at zero, so that the time limit is real.
58. As the owner, I want a warning listing unanswered questions before I submit early, so that I do not leave marks behind by accident.
59. As the owner, I want a mock result with score, pass or fail against 70%, and a review of every question with worked solutions, so that the mock doubles as a learning tool.
60. As the owner, I want questions I missed in a mock to become retries, so that mock mistakes feed back into practice.

### Spot checks

83. As the owner, I want to start a spot check of 1 or 3 questions from Home in one tap, so that a two-minute gap is enough.
84. As the owner, I want both spot check buttons outlined in the pinned area under Start session, with the skills screen kept as a Skills row at the top of the Home list, so that Start session stays the only lit button and nothing is lost.
85. As the owner, I want every spot check question to be an authored question at tier 2 or 3, so that it is at the level of a screening test whatever my mastery.
86. As the owner, I want questions I have never answered to come first, then those I answered correctly longest ago, so that I work through the whole set before anything repeats. A question I last answered wrong returns as a retry, not as an ordinary pick.
87. As the owner, I want a question to count as seen wherever I answered it (session, spot check or mock), so that "unseen" is true.
88. As the owner, I want a 3-question spot check to mix skills, leaning toward the skills the booklets ask most, so that I cannot predict the method and practice resembles the tests.
89. As the owner, I want the skill kept back until I have answered ("Spot check · pick one", then "Spot check" and the skill), so that I must work out the method myself.
90. As the owner, I want a 1-question spot check to show "Spot check · 1 question" in the bar with no tally or count, and a 3-question one to show the tally and count as a session does.
91. As the owner, I want to leave a spot check part-way and keep credit for answers given, and to have one interrupted by a reload resume, as a session does.
92. As the owner, I want a summary headed "Spot check done" with the score, tally and stats (the third stat is the target time for one question, the time per question for three), a "Test level" panel saying how many of the spot check questions I have seen out of how many exist, and a lit button for another spot check of the same length.
93. As the owner, I want a spot check to count as a session does: streak day, XP, mastery, the Sessions total, retries and celebrations.

### Booklet library

61. As the owner, I want a library listing my 8 booklets with progress on each, so that I can see how much of my own material I have worked through.
62. As the owner, I want to open a booklet and continue where I left off, three questions at a time, so that I can work through one booklet deliberately.
63. As the owner, I want to see which booklet questions I have answered correctly, so that I know when a booklet is exhausted.

### Motivation

64. As the owner, I want a streak that grows each day I finish at least one session, spot check or mock (a sprint does not count), so that a busy day does not break the habit.
65. As the owner, I want to see whether today's streak day is already secured, so that I know if I still need to practise.
66. As the owner, I want a daily XP goal that I can adjust, so that I have a reason to do more than the minimum.
67. As the owner, I want missing the daily goal to leave my streak intact, so that the two incentives do not conflict.
68. As the owner, I want mastery shown per skill as zero to three stars, so that I can see at a glance where I am strong and weak.
69. As the owner, I want mastery to reflect both accuracy and speed over recent questions, so that it tracks current ability rather than lifetime totals.
70. As the owner, I want XP for every correct answer, with more for harder questions, speed and consecutive correct answers, so that effort always produces visible progress.
71. As the owner, I want levels themed as consulting ranks from Intern to Senior Partner, so that progression matches the world the questions come from.
72. As the owner, I want badges for milestones (streak lengths, questions answered, perfect sessions, sprint scores, mock passes, completing a booklet), so that long-term goals exist beyond the daily loop.
73. As the owner, I want a small celebration on level-ups, badges and personal bests, so that milestones feel rewarding.
74. As the owner, I want no lives or hearts, so that mistakes are never a reason to stop practising.

### Trends

75. As the owner, I want a trends view of my mock scores over time against the 70% line, so that I can see whether I would pass.
76. As the owner, I want a trends view of my average drill time over time, overall and per skill, so that I can see myself getting faster. Both trend charts can show the last two weeks (by day), the last three months (by week) or all time (by day, week or month, depending on how long the history is); the engine does the bucketing, a chart skips stretches with no practice and says how many, and the mock chart averages by week or month once a range holds more than twelve mocks.
77. As the owner, I want lifetime totals (questions answered, accuracy, longest streak), so that I can see the work I have put in.

### Look and feel

78. As the owner, I want a sharp, scoreboard-like interface with very large numbers, one bright accent and playful touches, so that it feels like a game without feeling childish.
78a. As the owner, I want a dark theme and a light theme of equal quality, following my phone's appearance by default with a setting to pin either, so that the app reads well at night and in daylight.
78b. As the owner, I want the app designed first for my iPhone 14 Pro, in Safari and installed to the home screen, so that it feels made for the phone I actually use.
79. As the owner, I want every control reachable with one thumb, so that I can practise one-handed.
80. As the owner, I want sound effects I can switch off, so that I can practise silently in public.
81. As the owner, I want animations to respect my device's reduced-motion setting, so that the app stays comfortable.
82. As the owner, I want to reset all progress deliberately, with a confirmation, so that I can start over if I choose.

## Implementation Decisions

**Shape of the product**

- A static, client-only single-page web app, installable as a PWA with an offline cache. No backend, no accounts, no analytics.
- TypeScript, built with Vite, using Preact for the interface. Deployed to Vercel as a static site; the page is marked not to be indexed by search engines.
- Progress is persisted in the browser's local storage as one versioned document. There is no export, import or sync. A stored document with an older version number is migrated on load. Answers, sessions and sprints are kept in full for the last 30 days; older ones are rolled up into exactly what mastery, trends, totals, badges, booklets, spot checks and personal bests read from them (and an older mock keeps its result but not its per-question review), so the document stays small for good and nothing the app shows changes. A document that cannot be read is kept as a backup before anything is written; Settings lists backups and can restore the newest readable one or delete them. Home says when the browser blocks saving, when storage is full, or when it is nearly full.
- All content (booklet questions, authored bank) ships inside the app bundle so it works offline.

**Modules**

- *Question engine* (deep, pure): the single place questions come from and answers are marked. Its interface is small: produce a question for a given skill and tier using a supplied random source; mark a submitted answer against a question; list the skills and which sources serve each. Behind it sit the drill templates, the scenario and chart templates, the booklet questions and the authored bank. All randomness comes through an injected seeded source so any question can be reproduced.
- *Progress engine* (deep, pure): the single place game rules live. Its interface is a transition function: given the current progress, an event (answer recorded, session finished, sprint finished, mock finished) and the current date and time, return the new progress and the list of things that just happened (level-up, badge, streak extended, personal best). A second function chooses the next session: given progress, the time and a random source, return which skill and which questions, including due retries. A third chooses a spot check of a given length, as a plan the same session flow plays. It owns XP, levels, streak, daily goal, mastery, retries, personal bests, badges and the history that trends are drawn from. It never touches storage or the clock directly.
- *Chart renderer*: turns a chart description (type, series, axis range, labels) into a drawn chart. Used for generated chart questions and for redrawn booklet exhibits alike.
- *Interface*: thin screens (home, session, sprint, mock, results, skills, library, trends, profile) that call the two engines and render what they return. No game rules or math in screens.
- *Storage adapter*: loads, migrates and saves the progress document.

**Design system**

- The visual direction is "Scoreboard": a black board band carrying lit amber numerals, a condensed heavy numeral face for every large figure, segmented bars, and controls drawn as tiles that press. It was chosen from six rendered directions (including the original lime-on-black look) for number legibility at speed, one-thumb use and parity between themes. `DESIGN.md` is the guide; `PRODUCT.md` holds the personality and principles.
- Two themes, dark and light, defined as two values for every colour step. The app follows the phone's appearance by default and switches live; the owner can pin light or dark; the choice is stored on the device and applied before first paint. The board is black in both themes. Amber is never text on a white page.
- Primary device: iPhone 14 Pro (393×852 CSS px, Dynamic Island, safe areas respected, Safari and installed standalone). 375×667 and 320×568 are floor checks. Every screen keeps its primary action in the thumb zone without scrolling, never summons the system keyboard for answers, and has touch targets of at least 44px.
- Every colour, size, space, radius and duration is a named step; every screen is composed from the shared parts. Tests enforce the steps, both theme values, WCAG AA contrast for each pairing, and the no-system-keyboard rule.
- Fonts (Big Shoulders, Hanken Grotesk; both SIL Open Font Licence) are bundled with the app so it works offline.

**Question model**

- Every question has an identity, a skill, a tier (1 to 3), a source (generated, authored, booklet), a target time, a prompt, optional context blocks, a worked solution and a shortcut.
- Context blocks are one of: paragraph, list, table, chart.
- A question's answer is one of two kinds: a typed numeric answer with a marking mode (exact, or tolerance with a stated percentage) and a display unit; or a multiple-choice answer with options and the correct index. Drills use the first, scenario and chart questions the second.
- Booklet questions additionally carry their booklet name, case title and original question number. The existing 103 transcribed questions are the starting data; their exhibit tables flagged as charts are converted to chart blocks of the original chart type, checked against the PDFs.
- Authored questions carry a machine-checkable calculation alongside the stated answer, so a test can recompute the answer from the question's own data. An authored question modelled on a booklet question also names it (`modelledOn`), and its identity carries it (`bk-pst1-q06-a`, the first written on pst1-q06); the others are numbered (`au-001`).

**Rules fixed during design**

- Session length: 5 drills, or 3 scenario/chart questions. Sessions require an answer to every question.
- Spot checks: 1 or 3 authored questions at tiers 2 and 3, chosen by the progress engine and played through the session flow (resume included). Questions never answered come first, picked at random with each skill weighted by its share of the booklet questions; then, once none is unseen, those answered correctly, the longest ago first. A question with a retry pending is passed over, since the retry brings it back (so a missed question returns in a 3-question spot check or a scenario session, never as the pick of a 1-question one); only when too few others are left do they fill in, those last answered wrong first. A 3-question spot check avoids repeating a skill while the same group has another, but never takes a later group to do so; no question repeats, and no two are siblings. The skill is not named until the question is answered. A finished spot check is stored as a session marked as a spot check, so it counts for the streak, XP, mastery, the Sessions total and badges as a session does. Newly admitted authored questions at tiers 2 and 3 join the set with no further work.
- Siblings: two authored questions modelled on the same booklet question, or an authored question and the booklet question it is modelled on, are siblings; questions that do not say what they are modelled on, and generated questions, have none. One rule, applied wherever a sitting's questions are chosen: no scenario or chart session, booklet session, spot check or mock holds two siblings. Retries are placed first and the rest are chosen around them; a due retry that is a sibling of one already in the session (an earlier retry, or one of a booklet session's own questions) waits, still due, for a later session. When a place's own source has nothing left that fits, it falls back in order: another booklet question, then another authored question of that skill and tier, then a generated one (a place meant to be generated, in a tier with no templates, takes an authored one); only a skill and tier with nothing else left (none today: every scenario and chart tier has templates) would take the old draw, which may repeat, so a sitting is never shorter. A scenario session fills its booklet place first, then its authored places, then its generated ones, at the same random positions as before. Questions answered today (anywhere) also steer the choice, read from the answers kept in full: a booklet question with a sibling answered today is not offered for a session's booklet place that day, and booklet and authored questions with a sibling answered today are passed over in sessions, spot checks (within each group) and mocks while others fit.
- Seen: a question counts as seen once it has been answered, wherever: in a session, a spot check or a mock. A mock question left unanswered does not count as seen. The roll-up keeps a trail of authored questions answered (each once, at its latest answer, with whether it was right), so the seen count and the spot check order are the same before and after compaction. Wrong answers rolled up before that trail existed cannot be recovered and count as unseen.
- Clean sheet: a perfect session counts toward the clean sheet badges only when it had at least three questions. A spot check of one question never earns it, and neither does a booklet session of one or two questions at the end of a booklet, which did before. Totals already rolled up are not recomputed.
- Marking: exact for addition, subtraction, small products, simple percentages, large-number questions and division that comes out even (division tiers 1 and 2); tolerance of about 3% for long multiplication, long division (division tier 3), compound growth and other estimation drills. The question states which applies.
- Tolerance and multiple choice: generated multiple-choice options are spaced so exactly one option is closest to the true value, and distractors keep the same trailing digits as the correct option so last-digit tricks do not work.
- Difficulty: three tiers per skill; the tier offered follows mastery in that skill, with occasional variation up or down.
- Mastery: a recency-weighted score per skill combining correctness and whether the target time was met, shown as zero to three stars with minimum question counts for each star (one, three and six sessions' worth). Each answer's weight fades as later answers come in, so that one session's answers weigh about a sixth of everything before them: a single bad session can cost at most one star and one tier, while a slump over several sessions brings mastery down a star at a time.
- Streak: a day counts when at least one session (a spot check included) or mock is finished that day, on the local day it finished (a mock started before midnight and finished after counts on the later day; one submitted at zero counts like any other). A sprint does not count, and by the owner's decision sprints stay at tier 1. Existing history gets this retroactively, as the streak is derived; mocks are never rolled up out of the stored document, so compaction keeps their days. The daily XP goal (default 100, adjustable) is independent of the streak.
- XP: one economy, so that a minute of honest practice earns about the same whatever it is spent on. A correct answer in a session pays half an XP per second of the question's target time (so harder questions, which are given longer, pay more), plus a speed bonus of half that for beating the target time and a combo bonus of 10% of it per consecutive correct answer within the session (at most five). A mock pays each correct answer for its share of the mock's time (about 60 XP), with no speed bonus or combo, a quarter more when the mock is passed and a quarter less when it is failed. A sprint pays one XP per correct answer. The time recorded for an answer leaves out time the app was hidden and is capped at three times the target time. Levels map to consulting ranks.
- Rank pacing: honest practice (four answers in five right, each at about its target time) earns about 35 XP per minute spent answering in drill, scenario, chart and booklet sessions and about 30 in a passed mock that uses its full time; a failed mock earns about half that. About 20 minutes a day is therefore some 700 XP, and the ranks begin at 0 (Intern), 350 (Analyst, the first day), 1,400 (Senior Analyst, day 2), 4,200 (Associate, day 6), 9,000 (Senior Associate, day 13), 17,000 (Engagement Manager, day 24), 28,000 (Associate Partner, day 40), 43,000 (Partner, day 61) and 63,000 (Senior Partner, day 90). Each rank takes longer than the one before. Slower or less accurate practice earns proportionally less. When the economy changes, stored XP is worked out again from the answer, mock and sprint history in a migration, never kept as it was.
- Retries: a missed question is scheduled for the next session of its kind (drill or scenario), whoever picked it: the app, the owner choosing a skill, a booklet or a spot check. A spot check's misses are scenario retries. A 3-question spot check takes at most one due scenario retry, in its last place, whatever that question's source or tier; a 1-question spot check never takes one. Due retries take places in that session without making it longer, oldest first, from any skill of the kind; the session's own skill or booklet keeps at least the first place, and a due booklet question that is already one of the booklet's next questions keeps its place, marked as the retry; a due retry that is a sibling of one already in the session waits for a later session; after a correct retry it is scheduled once more about three days later, then cleared. Booklet and authored retries repeat the same question; generated retries draw a fresh question of the same template.
- Sprints: 60 seconds, one drill skill, typed answers, score is the count of correct answers, personal best kept per drill skill, one XP per correct answer. A right answer is taken the moment the typed entry reads as a number marked correct (the same marking as Submit, so tolerance and shorthand count), with no Submit press; a wrong number stays on the board. The button under the keypad is an outlined Skip, enabled throughout, which counts the drill as attempted and missed and shows its answer; Enter does the same, except while a keypad key has focus, when Enter presses that key once (as it does in a session, where Enter elsewhere submits). Nothing is taken once the clock has run out. Drills in sessions are never auto-accepted. Sprint misses do not create retries, and sprint answers are not counted as answered.
- Mocks: 10 questions in 20 minutes or 26 in 55; multiple choice only; roughly half booklet questions not yet answered correctly, the rest generated or authored; no two siblings; skipping and changing answers allowed; no feedback until submission; pass mark 70%; missed questions become retries.
- Pace bar: drains toward the question's target time, shows no digits, and never ends a question.
- No scratchpad, no calculator, no lives, no multiplayer.

**Content production**

- Generated questions come from templates in code whose answers are computed, never hand-entered.
- The authored bank is written by a stronger model (Opus) in batches and admitted only after each question's embedded calculation reproduces its stated answer and a second independent check agrees. Simpler chores use a lighter model (Sonnet).
- Authored questions modelled on a booklet question (same structure, exhibit, difficulty and traps; new company, wording and numbers) wait as candidates until the candidate evals find them admissible (the same two checks, plus fidelity to the source, variety, judged quality and the owner's review); then a script moves them into the authored bank. The bank started as 162 numbered questions, 18 per scenario skill; admitted candidates are added to them, up to four per booklet question.

**Build order**

1. Drills end to end: question engine for the ten drill skills, typed answering, sessions, sprints, progress engine (XP, levels, streak, daily goal, mastery, retries, personal bests), installable and deployed to Vercel.
2. Scenario questions: templates, booklet questions without exhibits, authored bank, multiple-choice answering.
3. Chart questions: chart renderer, generated chart templates, redrawn booklet exhibits.
4. Mocks, booklet library, trends, badges.

## Testing Decisions

A good test here exercises behaviour through a module's public interface and would survive a complete rewrite of its internals. Tests never assert on private helpers, internal data layout or rendering details.

Two seams carry almost all of the testing, agreed with the owner:

- **Question engine.** Property-style tests generate thousands of questions per skill and tier from seeded random sources and, for each, recompute the answer independently from the numbers presented to the user. They assert that the stated answer is right; that multiple-choice questions have distinct options with exactly one correct or strictly closest option; that tolerance-marked answers accept values inside the tolerance and reject values outside it; that exact-marked answers reject near misses; that no question text contains malformed numbers; and that the same seed reproduces the same question. Content tests check every booklet and authored question for structural validity and, for authored questions, that the embedded calculation reproduces the stated answer.
- **Progress engine.** Example-based tests drive the transition function with sequences of events and explicit dates: a streak extending, surviving and breaking across day boundaries and around midnight; the daily goal not affecting the streak; XP with speed bonus and combo; level thresholds; mastery rising and falling and star thresholds; a retry returning next session, returning again about three days after a correct answer, then clearing; a wrong retry persisting; generated versus fixed retries; personal bests only improving; mock scoring and pass mark; badge unlocks firing once. Session selection is tested for including due retries, favouring weak and neglected skills, and honouring an explicit skill choice. Property-style tests over many seeds and progress states check that no session, booklet session, spot check or mock holds two siblings, that lengths and the booklet share hold, and that the same seed gives the same sitting.

One browser smoke test confirms the built app loads, a drill session can be completed with typed answers, and progress survives a reload. It also plays spot checks: the skill is not named until the answer is in, a 1-question spot check has no tally, a 3-question one resumes after a reload, and the summary is headed "Spot check done" with the Test level panel.

Design-step tests guard the design system (named steps only, both theme values, contrast, no system keyboard). The interface is otherwise verified by hand on a phone, in both themes. There is no prior art in the repository; these tests establish the pattern.

## Out of Scope

- Verbal reasoning questions from the booklets.
- A scratchpad, calculator or any written-working aid inside the app.
- Lives, hearts or any mechanic that ends practice on mistakes.
- Multiplayer, leaderboards or any comparison with other people.
- Accounts, a backend, cross-device sync, and export or import of progress.
- Live AI generation of questions inside the app.
- Technique lessons separate from the per-question shortcut.
- Simulating the newer game-based or chatbot screening formats, and negative marking.
- Publishing the booklet questions. The owner's own deployment contains them and is for personal use only; the public repository leaves them out (see the README).
- Native iOS or Android apps and app-store distribution.

## Further Notes

- The transcribed booklet questions were each verified against the booklet's answer key and recomputed. A handful were deliberately left out because the booklet's key was ambiguous or inconsistent (three questions) or the question turned on verbal judgement.
- An earlier no-build draft was abandoned before this design was agreed. Nothing from it carries over except the transcribed booklet questions and the glossary.
- Progress loss is an accepted risk: clearing browser data or changing phone resets everything.
