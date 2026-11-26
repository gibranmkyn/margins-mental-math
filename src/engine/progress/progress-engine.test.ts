import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, markAnswer } from '../question';
import type { Question } from '../question';
import { anotherSession, applyEvent, chooseNextSession, initialProgress, levelFor, totals } from './index';
import type { Progress } from './index';

const MORNING = new Date('2026-11-24T08:00:00Z');
const ADDITION_T1 = { skill: 'addition', tier: 1 } as const;

describe('choosing the next session', () => {
  it('starts a new owner on a session of exactly 5 addition drills, all different', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(1));
    expect(plan.kind).toBe('drill');
    expect(plan.skill).toBe('addition');
    expect(plan.questions).toHaveLength(5);
    expect(new Set(plan.questions.map((q) => q.id)).size).toBe(5);
    expect(plan.questions.every((q) => q.skill === 'addition')).toBe(true);
  });

  it('honours an explicit choice of skill and tier', () => {
    for (const skill of ['subtraction', 'multiplication', 'division'] as const) {
      for (const tier of [1, 2, 3] as const) {
        const plan = chooseNextSession(initialProgress(), MORNING, createRandom(5), { skill, tier });
        expect(plan.skill).toBe(skill);
        expect(plan.tier).toBe(tier);
        expect(plan.questions).toHaveLength(5);
        expect(new Set(plan.questions.map((q) => q.prompt)).size).toBe(5);
        expect(plan.questions.every((q) => q.skill === skill && q.tier === tier)).toBe(true);
      }
    }
  });

  it('records a finished session under the skill that was chosen', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(6), { skill: 'division', tier: 3 });
    let progress = initialProgress();
    for (const question of plan.questions) {
      progress = answer(progress, plan.id, question, true, 9000, MORNING).progress;
    }
    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, MORNING);
    expect(finished.happened).toContainEqual(expect.objectContaining({ kind: 'session-finished', score: 5, total: 5, timeMs: 45000 }));
    expect(finished.progress.sessions.at(-1)).toMatchObject({ skill: 'division', questionCount: 5, correctCount: 5 });
  });

  it('gives each session its own identity', () => {
    const progress = initialProgress();
    const first = chooseNextSession(progress, MORNING, createRandom(1));
    const second = chooseNextSession(progress, MORNING, createRandom(2));
    expect(first.id).not.toBe(second.id);
  });
});

/** Answer a planned question, right or wrong, the way the session screen does. */
function answer(progress: Progress, sessionId: string, question: Question, rightAnswer: boolean, timeMs: number, at: Date) {
  if (question.answer.kind !== 'numeric') throw new Error('Drill expected');
  const typed = rightAnswer ? question.answer.value : question.answer.value + 1;
  const mark = markAnswer(question, { kind: 'numeric', value: typed });
  return applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct: mark.correct, timeMs }, at);
}

describe('another session from the summary', () => {
  function played(plan: ReturnType<typeof chooseNextSession>): Progress {
    let p = initialProgress();
    for (const q of plan.questions) p = answer(p, plan.id, q, true, q.targetTimeMs - 1, MORNING).progress;
    return applyEvent(p, { type: 'session-finished', sessionId: plan.id }, MORNING).progress;
  }
  const LATER = new Date(MORNING.getTime() + 10 * 60_000);

  it("is the app's own next pick after a session the app picked, not the same skill again", () => {
    const first = chooseNextSession(initialProgress(), MORNING, createRandom(1));
    expect(first.skill).toBe('addition');
    const progress = played(first);
    const next = anotherSession(progress, first, LATER, createRandom(2));
    expect(next.skill).toBe(chooseNextSession(progress, LATER, createRandom(2)).skill);
    expect(next.skill).not.toBe('addition');
  });

  it('stays in the skill the owner chose after a session they chose', () => {
    const first = chooseNextSession(initialProgress(), MORNING, createRandom(1), { skill: 'division' });
    const next = anotherSession(played(first), first, LATER, createRandom(2));
    expect(next.skill).toBe('division');
  });
});

describe('recording answers', () => {
  it('starts with nothing answered', () => {
    expect(totals(initialProgress())).toEqual({ answered: 0, correct: 0, accuracy: null, sessionsFinished: 0 });
  });

  it('keeps credit for answers given in a session that was left part-way', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(3));
    const [q1, q2] = plan.questions;
    let progress = initialProgress();
    progress = answer(progress, plan.id, q1!, true, 4200, MORNING).progress;
    progress = answer(progress, plan.id, q2!, false, 9100, MORNING).progress;

    expect(totals(progress)).toMatchObject({ answered: 2, correct: 1, sessionsFinished: 0 });
  });

  it('never changes the progress it was given', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(3));
    const before = initialProgress();
    answer(before, plan.id, plan.questions[0]!, true, 4200, MORNING);
    expect(totals(before)).toMatchObject({ answered: 0, correct: 0, sessionsFinished: 0 });
  });
});

describe('finishing a session', () => {
  it('reports the score and time of that session only, and counts it as finished', () => {
    let progress = initialProgress();

    // An earlier session left part-way: its answers must not leak into the summary.
    const abandoned = chooseNextSession(progress, MORNING, createRandom(10));
    progress = answer(progress, abandoned.id, abandoned.questions[0]!, true, 3000, MORNING).progress;

    const plan = chooseNextSession(progress, MORNING, createRandom(11));
    const outcomes: Array<[boolean, number]> = [
      [true, 4000],
      [true, 5000],
      [false, 12000],
      [true, 6000],
      [true, 3000],
    ];
    plan.questions.forEach((question, i) => {
      const [right, ms] = outcomes[i]!;
      progress = answer(progress, plan.id, question, right, ms, MORNING).progress;
    });

    const finished = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, MORNING);

    expect(finished.happened).toEqual([expect.objectContaining({ kind: 'session-finished', score: 4, total: 5, timeMs: 30000 })]);
    expect(totals(finished.progress)).toMatchObject({ answered: 6, correct: 5, sessionsFinished: 1 });
  });
});

/** A one-question helper: record an answer to a fixed question and return what happened. */
function xpFor(progress: Progress, sessionId: string, question: Question, right: boolean, timeMs: number) {
  const result = answer(progress, sessionId, question, right, timeMs, MORNING);
  const earned = result.happened.find((h) => h.kind === 'xp-earned');
  return { ...result, earned };
}

describe('XP', () => {
  const addition = chooseNextSession(initialProgress(), MORNING, createRandom(5), ADDITION_T1).questions[0]!;
  // A question with a 20-second target: base 10 XP, half an XP per second of target time.
  const question: Question = { ...addition, targetTimeMs: 20_000 };
  const slow = question.targetTimeMs + 1000;
  const fast = question.targetTimeMs - 1000;

  it('earns nothing for a wrong answer', () => {
    const { earned, progress } = xpFor(initialProgress(), 'a', question, false, fast);
    expect(earned).toMatchObject({ xp: 0, speedBonus: 0 });
    expect(progress.xp).toBe(0);
  });

  it('pays a correct answer half an XP per second of its target time, with no bonus when over it', () => {
    const { earned, progress } = xpFor(initialProgress(), 'a', question, true, slow);
    expect(earned).toMatchObject({ xp: 10, base: 10, speedBonus: 0, combo: 1, comboBonus: 0 });
    expect(progress.xp).toBe(10);
    // An 8-second addition drill pays 4.
    expect(xpFor(initialProgress(), 'a', addition, true, 99_999).earned).toMatchObject({ xp: addition.targetTimeMs / 2000 });
  });

  it('adds a speed bonus for beating the target time, but not for matching it', () => {
    expect(xpFor(initialProgress(), 'a', question, true, fast).earned).toMatchObject({ xp: 15, speedBonus: 5 });
    expect(xpFor(initialProgress(), 'a', question, true, question.targetTimeMs).earned).toMatchObject({ speedBonus: 0 });
  });

  it('pays more for questions expected to take longer', () => {
    const longer: Question = { ...question, tier: 3, targetTimeMs: 30_000 };
    expect(xpFor(initialProgress(), 'a', longer, true, 99_999).earned).toMatchObject({ xp: 15 });
  });

  it('pays a scenario question for its longer target time, by the same rate and bonuses as a drill', () => {
    // A generated payback question at tier 2, whatever else a session would draw: it has a 100-second target, so 50 base.
    const scenario = createQuestion('break-even-payback', 2, createRandom(5), { template: 'payback-savings' });
    if (scenario.answer.kind !== 'choice') throw new Error('Scenario question expected');
    expect(scenario.targetTimeMs).toBe(100_000);
    const { correctIndex, options } = scenario.answer;
    const pick = (right: boolean, timeMs: number, progress = initialProgress()) => {
      const mark = markAnswer(scenario, { kind: 'choice', index: right ? correctIndex : (correctIndex + 1) % options.length });
      return applyEvent(progress, { type: 'answer-recorded', sessionId: 'a', question: scenario, correct: mark.correct, timeMs }, MORNING);
    };
    const earned = (t: ReturnType<typeof pick>) => t.happened.find((h) => h.kind === 'xp-earned');
    const slow = scenario.targetTimeMs + 1;

    expect(earned(pick(true, slow))).toMatchObject({ xp: 50, base: 50, speedBonus: 0 });
    expect(earned(pick(true, scenario.targetTimeMs - 1))).toMatchObject({ xp: 75, base: 50, speedBonus: 25 });
    expect(earned(pick(true, slow, pick(true, slow).progress))).toMatchObject({ xp: 55, comboBonus: 5, combo: 2 });
    expect(earned(pick(false, 1000))).toMatchObject({ xp: 0 });
  });

  it('grows a combo across consecutive correct answers in a session and caps it', () => {
    let progress = initialProgress();
    const xps: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = xpFor(progress, 'a', question, true, slow);
      progress = r.progress;
      xps.push((r.earned as { xp: number }).xp);
    }
    expect(xps).toEqual([10, 11, 12, 13, 14, 15, 15, 15]);
  });

  it('resets the combo on a wrong answer, and does not carry it into another session', () => {
    let progress = initialProgress();
    for (let i = 0; i < 3; i++) progress = xpFor(progress, 'a', question, true, slow).progress;
    progress = xpFor(progress, 'a', question, false, slow).progress;
    expect(xpFor(progress, 'a', question, true, slow).earned).toMatchObject({ xp: 10, combo: 1 });
    const third = xpFor(initialProgress(), 'a', question, true, slow).progress;
    expect(xpFor(third, 'b', question, true, slow).earned).toMatchObject({ xp: 10, combo: 1 });
  });

  it('stacks speed bonus and combo', () => {
    let progress = xpFor(initialProgress(), 'a', question, true, fast).progress;
    expect(xpFor(progress, 'a', question, true, fast).earned).toMatchObject({ xp: 16, base: 10, speedBonus: 5, comboBonus: 1, combo: 2 });
  });

  it('reports XP earned in the session summary', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(8), { skill: 'compound-growth', tier: 1 });
    let progress = initialProgress();
    for (const q of plan.questions) progress = answer(progress, plan.id, q, true, q.targetTimeMs + 1, MORNING).progress;
    const done = applyEvent(progress, { type: 'session-finished', sessionId: plan.id }, MORNING);
    // Compound growth tier 1 has a 20-second target: 10 base, then the combo.
    expect(done.happened[0]).toMatchObject({ kind: 'session-finished', xp: 10 + 11 + 12 + 13 + 14 });
  });
});

describe('levels', () => {
  it('maps XP to consulting ranks at fixed thresholds', () => {
    expect(levelFor(0).rank).toBe('Intern');
    expect(levelFor(349).rank).toBe('Intern');
    expect(levelFor(350).rank).toBe('Analyst');
    expect(levelFor(62_999).rank).toBe('Partner');
    expect(levelFor(63_000).rank).toBe('Senior Partner');
    expect(levelFor(999_999).rank).toBe('Senior Partner');
  });

  it('shows progress to the next level, and none at the top', () => {
    expect(levelFor(400)).toMatchObject({ xpIntoLevel: 50, xpForLevel: 1050, nextRank: 'Senior Analyst' });
    expect(levelFor(70_000).nextRank).toBeNull();
  });

  it('reports a level-up as something that just happened, once', () => {
    const question = chooseNextSession(initialProgress(), MORNING, createRandom(5), ADDITION_T1).questions[0]!;
    const near: Progress = { ...initialProgress(), xp: 348 };
    const up = answer(near, 'a', question, true, 99999, MORNING);
    expect(up.happened).toContainEqual({ kind: 'level-up', from: 'Intern', to: 'Analyst' });
    const again = answer(up.progress, 'a', question, true, 99999, MORNING);
    expect(again.happened.some((h) => h.kind === 'level-up')).toBe(false);
  });
});

describe('time on a question', () => {
  it('records at most three times the target time, so one interruption cannot distort the trend', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(3), ADDITION_T1);
    const question = plan.questions[0]!;
    // A 10-minute phone call in the middle of a drill.
    const { progress, happened } = answer(initialProgress(), plan.id, question, true, 600_000, MORNING);
    expect(progress.answers[0]!.timeMs).toBe(question.targetTimeMs * 3);
    expect(progress.answers[0]!.metTarget).toBe(false);
    expect(happened).toContainEqual(expect.objectContaining({ kind: 'xp-earned', speedBonus: 0 }));
  });

  it('records a time inside the cap as given', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(3), ADDITION_T1);
    const question = plan.questions[0]!;
    const { progress } = answer(initialProgress(), plan.id, question, true, question.targetTimeMs + 1234, MORNING);
    expect(progress.answers[0]!.timeMs).toBe(question.targetTimeMs + 1234);
  });

  it('records a time that is not a number as the cap, with no speed bonus', () => {
    const plan = chooseNextSession(initialProgress(), MORNING, createRandom(3), ADDITION_T1);
    const question = plan.questions[0]!;
    const { progress } = answer(initialProgress(), plan.id, question, true, Number.NaN, MORNING);
    expect(progress.answers[0]).toMatchObject({ timeMs: question.targetTimeMs * 3, metTarget: false });
  });
});
