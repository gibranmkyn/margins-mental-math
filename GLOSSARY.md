# Margins

A personal, single-user trainer for business mental math: fast, accurate arithmetic on the kind of numbers a business case throws up. Consulting screening tests (McKinsey PST, BCG Potential Test) are the source material and the practice format, not the thing being simulated. The booklet questions themselves are not in this repository; see the README.

## Language

### Questions

**Drill**:
A bare arithmetic question with no business context, answered by typing a number.
_Avoid_: Mental-math question, calculation, exercise

**Scenario question**:
A multiple-choice question that sets up a business situation with data and asks for a calculated result.
_Avoid_: Case question, case, word problem

**Chart question**:
A scenario question whose data is given as a drawn chart, so values must be read or estimated before calculating.
_Avoid_: Exhibit question, graph question

**Booklet question**:
A scenario or chart question transcribed from one of the owner's practice test booklets, as opposed to a generated one.
_Avoid_: Real question, PDF question, test question

**Generated question**:
A drill, scenario or chart question produced by a template that draws new numbers each time it is asked, so it never repeats exactly.
_Avoid_: Random question, synthetic question, template question

**Authored question**:
An original one-off scenario or chart question with fixed wording and numbers, written for the app rather than taken from a booklet. Some are modelled on one booklet question (same structure, new company, wording and numbers) and say which.
_Avoid_: Bank question, custom question, AI question

**Candidate**:
An authored question modelled on a booklet question, waiting to pass the candidate evals before it is admitted and served.
_Avoid_: Draft, synthetic question

**Sibling**:
Two questions too alike to share a sitting: two authored questions modelled on the same booklet question, or an authored question and the booklet question it is modelled on. No session, spot check or mock holds two siblings.
_Avoid_: Duplicate, twin, near-repeat

**Booklet**:
One of the owner's practice test documents that booklet questions are drawn from.
_Avoid_: Test, PDF, paper

**Skill**:
A named category of question (for example multiplication, break-even, growth rates) that mastery is tracked against.
_Avoid_: Topic, category, type

**Tier**:
One of three difficulty steps within a skill; the tier offered follows the owner's mastery of that skill.
_Avoid_: Level (reserved for XP), difficulty setting

**Target time**:
The time within which a question is expected to be answered; beating it earns a speed bonus and exceeding it costs nothing else.
_Avoid_: Time limit, deadline

### Marking

**Exact marking**:
A typed answer is correct only if it equals the true value.

**Tolerance marking**:
A typed answer is correct if it falls within a small percentage of the true value; used for drills where estimation is the intended method.
_Avoid_: Fuzzy marking, approximate marking

**Shortcut**:
The fastest mental method for a question, shown with the worked solution after every answer.
_Avoid_: Tip, hint, trick

### Practice

**Session**:
A short, fixed-length set of questions with feedback after each answer: 5 drills or 3 scenario questions. A spot check counts as a session wherever sessions are counted.
_Avoid_: Round, lesson, set, quiz

**Spot check**:
One or three authored questions at tiers 2 and 3 (test level), mixed across skills, with feedback after each answer. The skill is named only once the question is answered. Questions never answered come first.
_Avoid_: Quick check, mini mock, quiz

**Sprint**:
A 60-second timed challenge in a single drill skill, scored by the number of correct answers; the only place a personal best is recorded.
_Avoid_: Blitz, time attack, speed round

**Retry**:
A missed question scheduled to return in the next session or 3-question spot check and, once answered correctly, one final time some days later: the same booklet or authored question, or a fresh generated question of the same kind.
_Avoid_: Mistake, review item, redo

**Mock**:
A timed set of scenario and chart questions with no feedback until the end, at roughly two minutes per question, passed at 70%.
_Avoid_: Exam, test, simulation

### Motivation

**Streak**:
The number of consecutive days on which at least one session, spot check or mock was finished. A sprint does not count.

**Daily goal**:
An XP target for the day that rewards practising beyond the single session, spot check or mock a streak requires; missing it does not break the streak.

**Mastery**:
A per-skill measure of how accurately and quickly recent questions in that skill were answered.
_Avoid_: Level (reserved for XP), proficiency, rating

**Personal best**:
The owner's highest sprint score in a given drill skill.
_Avoid_: High score, record
