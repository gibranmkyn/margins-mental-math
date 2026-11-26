import { describe, expect, it } from 'vitest';
import { createRandom, listAuthoredQuestions, listBookletQuestions } from '../question';
import type { Question, Skill } from '../question';
import {
  anotherSession,
  anotherSpotCheck,
  applyEvent,
  chooseNextSession,
  chooseSpotCheck,
  initialProgress,
  resumeRun,
  SPOT_CHECK_LENGTHS,
  spotCheckSeen,
  streakStatus,
  totals,
} from './index';
import type { MockPlan, Progress, SessionPlan, SpotCheckLength } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

/** Local-time dates, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);
const NOW = at(25, 18);

const POOL = listAuthoredQuestions().filter((q) => q.tier === 2 || q.tier === 3);
const ids = (questions: readonly Question[]) => questions.map((q) => q.id);

/** Answer questions one after another, a minute apart, as one earlier session. */
function answered(progress: Progress, questions: readonly Question[], correct: boolean, from: Date, sessionId = `s-${from.getTime()}`): Progress {
  let t = from.getTime();
  for (const question of questions) {
    t += 60_000;
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct, timeMs: 60_000 }, new Date(t)).progress;
  }
  return progress;
}

/** Play a spot check the way the session screen does, then finish it as a spot check. */
function play(progress: Progress, plan: SessionPlan, right: boolean[], when: Date) {
  let p = progress;
  plan.questions.forEach((question, i) => {
    p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question, correct: right[i] ?? true, timeMs: 30_000 }, when).progress;
  });
  return applyEvent(p, { type: 'session-finished', sessionId: plan.id, spotCheck: true }, when);
}

/** A copy of a pool question under a new id, optionally saying which booklet question it is modelled on. */
function variant(question: Question, id: string, modelledOn?: string): Question {
  return { ...question, id, ...(modelledOn !== undefined && { modelledOn }) };
}

const own = (plan: SessionPlan) => plan.questions.filter((q) => !plan.retries?.includes(q.id));

describe('choosing a spot check', () => {
  it.each(SPOT_CHECK_LENGTHS)('a %s-question spot check is that many authored questions at tier 2 or 3, none repeated', (length) => {
    for (let seed = 0; seed < 60; seed++) {
      const plan = chooseSpotCheck(initialProgress(), length, NOW, createRandom(seed));
      expect(plan.questions).toHaveLength(length);
      expect(new Set(ids(plan.questions)).size).toBe(length);
      for (const q of plan.questions) {
        expect(q.source).toBe('authored');
        expect([2, 3]).toContain(q.tier);
        expect(q.answer.kind).toBe('choice');
      }
    }
  });

  it('is a scenario session marked as a spot check of its length, named after its first question', () => {
    for (const length of SPOT_CHECK_LENGTHS) {
      const plan = chooseSpotCheck(initialProgress(), length, NOW, createRandom(3));
      expect(plan).toMatchObject({ kind: 'scenario', spotCheck: length, skill: plan.questions[0]!.skill, tier: plan.questions[0]!.tier });
      expect(plan.retries).toBeUndefined();
      expect(plan.chosen).toBeUndefined();
    }
    expect(chooseNextSession(initialProgress(), NOW, createRandom(3)).spotCheck).toBeUndefined();
  });

  it('is the same for the same seed', () => {
    const progress = answered(initialProgress(), POOL.slice(0, 40), false, at(20));
    for (const length of SPOT_CHECK_LENGTHS) {
      expect(chooseSpotCheck(progress, length, NOW, createRandom(8))).toEqual(chooseSpotCheck(progress, length, NOW, createRandom(8)));
    }
  });

  it('mixes skills within a 3-question spot check while it can', () => {
    for (let seed = 0; seed < 100; seed++) {
      const plan = chooseSpotCheck(initialProgress(), 3, NOW, createRandom(seed));
      expect(new Set(plan.questions.map((q) => q.skill)).size).toBe(3);
    }
  });

  it.skipIf(NO_BOOKLETS)('draws unseen questions with each skill weighted by its share of the booklet questions', () => {
    const booklet = listBookletQuestions();
    const share = (skill: Skill) => booklet.filter((q) => q.skill === skill).length / booklet.length;
    const counts = new Map<Skill, number>();
    const runs = 3000;
    for (let seed = 0; seed < runs; seed++) {
      const skill = chooseSpotCheck(initialProgress(), 1, NOW, createRandom(seed)).questions[0]!.skill;
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
    for (const skill of new Set(POOL.map((q) => q.skill))) {
      expect(Math.abs((counts.get(skill) ?? 0) / runs - share(skill))).toBeLessThan(0.03);
    }
  });

  it.runIf(NO_BOOKLETS)('draws unseen questions with each skill weighted by its share of the authored bank when there are no booklets', () => {
    const bank = listAuthoredQuestions();
    const share = (skill: Skill) => bank.filter((q) => q.skill === skill).length / bank.length;
    const counts = new Map<Skill, number>();
    const runs = 3000;
    for (let seed = 0; seed < runs; seed++) {
      const skill = chooseSpotCheck(initialProgress(), 1, NOW, createRandom(seed)).questions[0]!.skill;
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
    for (const skill of new Set(POOL.map((q) => q.skill))) {
      expect(Math.abs((counts.get(skill) ?? 0) / runs - share(skill))).toBeLessThan(0.03);
    }
  });

  it('asks questions never answered before any that were', () => {
    const seen = POOL.slice(0, POOL.length - 5);
    const progress = answered(answered(initialProgress(), seen.slice(0, 20), false, at(10)), seen.slice(20), true, at(11));
    // Five unseen questions that are no siblings of one another, so the bank's families cannot decide which fit.
    const fresh = POOL.slice(POOL.length - 5).map(({ modelledOn: _, ...q }, i) => variant(q, `u-${i}`));
    const pool = [...seen, ...fresh];
    const unseen = new Set(ids(fresh));
    for (let seed = 0; seed < 30; seed++) {
      // The 20 missed are due retries; one may take a place, the others come from the unseen.
      for (const q of own(chooseSpotCheck(progress, 3, NOW, createRandom(seed), pool))) expect(unseen.has(q.id)).toBe(true);
      expect(unseen.has(chooseSpotCheck(progress, 1, NOW, createRandom(seed), pool).questions[0]!.id)).toBe(true);
    }
  });

  it('keeps siblings apart before it asks the unseen: with one family left unseen, it asks one of them and fills in from those answered', () => {
    const answeredRight = POOL.slice(0, 6).map(({ modelledOn: _, ...q }, i) => variant(q, `a-${i}`));
    const family = POOL.slice(6, 11).map((q, i) => variant(q, `f-${i}`, 'pst1-q4'));
    const pool = [...answeredRight, ...family];
    const progress = answered(initialProgress(), answeredRight, true, at(10));
    const familyIds = new Set(ids(family));
    for (let seed = 0; seed < 30; seed++) {
      const plan = chooseSpotCheck(progress, 3, NOW, createRandom(seed), pool);
      expect(plan.questions).toHaveLength(3);
      expect(plan.questions.filter((q) => familyIds.has(q.id))).toHaveLength(1);
      expect(familyIds.has(chooseSpotCheck(progress, 1, NOW, createRandom(seed), pool).questions[0]!.id)).toBe(true);
    }
  });

  it('then asks those answered right, the longest ago first, passing over any with a retry pending', () => {
    // Every question answered right, then four answered wrong later, two of those put right again: all four keep a retry.
    let progress = answered(initialProgress(), POOL, true, at(5));
    const [w1, w2, fixed1, fixed2] = [POOL[10]!, POOL[40]!, POOL[70]!, POOL[90]!];
    progress = answered(progress, [w1, fixed1, w2, fixed2], false, at(10));
    progress = answered(progress, [fixed1, fixed2], true, at(12));

    const one = (p: Progress) => chooseSpotCheck(p, 1, NOW, createRandom(1)).questions[0]!;
    expect(one(progress)).toEqual(POOL[0]);
    progress = answered(progress, [POOL[0]!], true, at(15));
    expect(one(progress)).toEqual(POOL[1]);
  });

  it('counts a question as seen wherever it was answered, a mock included', () => {
    const [inSession, inMock] = [POOL[0]!, POOL[1]!];
    let progress = answered(initialProgress(), [inSession], true, at(10));
    const mock: MockPlan = { id: 'm-1', length: 'short', questions: [inMock, POOL[2]!], timeLimitMs: 20 * 60_000 };
    const correct = inMock.answer.kind === 'choice' ? inMock.answer.correctIndex : 0;
    // The second mock question is left unanswered: that is not an answer.
    progress = applyEvent(progress, { type: 'mock-finished', mock, choices: [correct, null], timesMs: [60_000, 0], timeMs: 120_000 }, at(11)).progress;
    expect(spotCheckSeen(progress)).toEqual({ seen: 2, total: POOL.length });
    for (let seed = 0; seed < 50; seed++) {
      const plan = chooseSpotCheck(progress, 3, NOW, createRandom(seed));
      expect(ids(plan.questions)).not.toContain(inSession.id);
      expect(ids(plan.questions)).not.toContain(inMock.id);
    }
  });

  it('keeps to unseen questions when only one skill has any left, repeating that skill', () => {
    const skill = POOL[0]!.skill;
    const progress = answered(initialProgress(), POOL.filter((q) => q.skill !== skill), true, at(10));
    for (let seed = 0; seed < 30; seed++) {
      const plan = chooseSpotCheck(progress, 3, NOW, createRandom(seed));
      expect(plan.questions.map((q) => q.skill)).toEqual([skill, skill, skill]);
    }
  });

  it('mixes skills among questions answered before, too, by passing over one in a skill already asked', () => {
    // Every question answered right, oldest first in pool order: the two stalest share a skill.
    const progress = answered(initialProgress(), POOL, true, at(10));
    expect(POOL[1]!.skill).toBe(POOL[0]!.skill);
    const plan = chooseSpotCheck(progress, 3, NOW, createRandom(1));
    expect(plan.questions[0]).toEqual(POOL[0]);
    expect(new Set(plan.questions.map((q) => q.skill)).size).toBe(3);
  });

  it('never asks two questions modelled on the same booklet question', () => {
    const base = POOL.slice(0, 9);
    const pool = base.map((q, i) => variant(q, `v-${i}`, i < 6 ? 'pst1-q4' : undefined));
    for (let seed = 0; seed < 60; seed++) {
      const plan = chooseSpotCheck(initialProgress(), 3, NOW, createRandom(seed), pool);
      expect(plan.questions).toHaveLength(3);
      expect(plan.questions.filter((q) => q.modelledOn === 'pst1-q4').length).toBeLessThanOrEqual(1);
    }
    // Among questions answered before as well.
    const seenAll = answered(initialProgress(), pool, true, at(10));
    expect(chooseSpotCheck(seenAll, 3, NOW, createRandom(1), pool).questions.filter((q) => q.modelledOn === 'pst1-q4')).toHaveLength(1);
    // With nothing else to ask, the spot check is shorter rather than break the rule.
    const siblings = base.slice(0, 3).map((q, i) => variant(q, `s-${i}`, 'pst1-q4'));
    expect(chooseSpotCheck(initialProgress(), 3, NOW, createRandom(1), siblings).questions).toHaveLength(1);
  });

  it.skipIf(NO_BOOKLETS)('keeps a question modelled on a booklet question out of a spot check that carries that question as a retry', () => {
    const booklet = listBookletQuestions()[0]!;
    const progress = answered(initialProgress(), [booklet], false, at(20));
    const pool = POOL.slice(0, 9).map((q, i) => variant(q, `v-${i}`, i === 0 ? booklet.id : undefined));
    for (let seed = 0; seed < 60; seed++) {
      const plan = chooseSpotCheck(progress, 3, NOW, createRandom(seed), pool);
      expect(plan.retries).toEqual([booklet.id]);
      expect(plan.questions).toHaveLength(3);
      expect(ids(plan.questions)).not.toContain('v-0');
    }
  });

  it('leaves questions that do not say what they are modelled on alone', () => {
    const pool = POOL.slice(0, 3).map((q, i) => variant(q, `v-${i}`));
    for (let seed = 0; seed < 20; seed++) {
      expect(ids(chooseSpotCheck(initialProgress(), 3, NOW, createRandom(seed), pool).questions).sort()).toEqual(['v-0', 'v-1', 'v-2']);
    }
  });

  it('brings back at most one due scenario retry in three questions, and none in one', () => {
    // Four questions missed in an earlier scenario session: all four are due.
    // The first is a booklet question, or without the booklets a tier 1 authored one: either way outside the spot check set.
    const tierOne = listAuthoredQuestions().filter((q) => q.tier === 1);
    const missed = [listBookletQuestions()[0] ?? tierOne[1]!, POOL[5]!, POOL[50]!, tierOne[0]!];
    const progress = answered(initialProgress(), missed, false, at(20));
    const missedIds = new Set(ids(missed));
    for (let seed = 0; seed < 20; seed++) {
      const three = chooseSpotCheck(progress, 3, NOW, createRandom(seed));
      expect(three.questions).toHaveLength(3);
      expect(three.retries).toEqual([missed[0]!.id]);
      // The retry keeps its own source and tier, and takes the last place.
      expect(three.questions[2]).toEqual(missed[0]);
      expect(own(three).filter((q) => missedIds.has(q.id))).toHaveLength(0);

      const one = chooseSpotCheck(progress, 1, NOW, createRandom(seed));
      expect(one.retries).toBeUndefined();
      expect(missedIds.has(one.questions[0]!.id)).toBe(false);
    }
  });

  it('does not serve a question with a retry pending from the seen ones: the retry brings it back', () => {
    // Every question seen, one of them missed a minute ago.
    const missed = POOL[30]!;
    const progress = answered(answered(initialProgress(), POOL, true, at(5)), [missed], false, at(24));
    const later = new Date(at(24).getTime() + 10 * 60_000);
    for (let seed = 0; seed < 20; seed++) {
      expect(ids(chooseSpotCheck(progress, 1, later, createRandom(seed)).questions)).not.toContain(missed.id);
    }
  });

  it('carries at most one question with a retry pending in three, the one listed in the plan', () => {
    const missed = [POOL[3]!, POOL[30]!, POOL[60]!];
    const progress = answered(answered(initialProgress(), POOL, true, at(5)), missed, false, at(20));
    const pending = new Set(ids(missed));
    for (let seed = 0; seed < 20; seed++) {
      const plan = chooseSpotCheck(progress, 3, NOW, createRandom(seed));
      const carried = plan.questions.filter((q) => pending.has(q.id));
      expect(carried.length).toBeLessThanOrEqual(1);
      expect(ids(carried)).toEqual(plan.retries ?? []);
    }
  });

  it('still has its full length when every seen question has a retry pending', () => {
    const progress = answered(initialProgress(), POOL, false, at(20));
    for (const length of SPOT_CHECK_LENGTHS) {
      const plan = chooseSpotCheck(progress, length, NOW, createRandom(1));
      expect(plan.questions).toHaveLength(length);
      expect(new Set(ids(plan.questions)).size).toBe(length);
    }
  });

  it('comes again at the same length, from its summary', () => {
    for (const length of SPOT_CHECK_LENGTHS) {
      const first = chooseSpotCheck(initialProgress(), length, NOW, createRandom(1));
      const { progress } = play(initialProgress(), first, [true, true, true], NOW);
      const again = anotherSpotCheck(progress, { ...first, spotCheck: length }, NOW, createRandom(2));
      expect(again.spotCheck).toBe(length);
      expect(again.questions).toHaveLength(length);
      for (const q of again.questions) expect(ids(first.questions)).not.toContain(q.id);
      expect(anotherSession(progress, first, NOW, createRandom(2))).toEqual(again);
    }
  });

  it('picks up after a reload as a session does', () => {
    const plan = chooseSpotCheck(initialProgress(), 3, NOW, createRandom(1));
    const run = { kind: 'session' as const, plan, results: [true], levelUps: [], badges: [], savedAt: NOW.getTime() };
    expect(resumeRun(JSON.parse(JSON.stringify(run)), new Date(NOW.getTime() + 60_000))).toMatchObject({ action: 'resume-session', index: 1, run: { plan: { spotCheck: 3 } } });
  });
});

describe('how much of the spot check set has been seen', () => {
  it('counts each question answered once, out of every authored question at tier 2 or 3', () => {
    expect(POOL.length).toBeGreaterThan(0);
    expect(spotCheckSeen(initialProgress())).toEqual({ seen: 0, total: POOL.length });
    let progress = answered(initialProgress(), [POOL[0]!, POOL[1]!], false, at(10));
    progress = answered(progress, [POOL[0]!], true, at(11));
    // A tier 1 authored question is not part of the set.
    progress = answered(progress, [listAuthoredQuestions().find((q) => q.tier === 1)!], true, at(12));
    expect(spotCheckSeen(progress)).toEqual({ seen: 2, total: POOL.length });
  });

  it('grows with the set: questions added later count toward the total', () => {
    const pool = [...POOL, variant(POOL[0]!, 'new-1')];
    expect(spotCheckSeen(initialProgress(), pool)).toEqual({ seen: 0, total: POOL.length + 1 });
  });
});

describe('a finished spot check', () => {
  const finish = (length: SpotCheckLength, right: boolean[], progress = initialProgress()) =>
    play(progress, chooseSpotCheck(progress, length, NOW, createRandom(4)), right, NOW);

  it.each(SPOT_CHECK_LENGTHS)('of %s question(s) secures the streak day and counts as a session, marked as a spot check', (length) => {
    const { progress, happened } = finish(length, [true, false, true]);
    expect(streakStatus(progress, NOW)).toMatchObject({ current: 1, securedToday: true });
    expect(totals(progress)).toMatchObject({ sessionsFinished: 1, answered: length });
    expect(progress.sessions[0]).toMatchObject({ kind: 'scenario', spotCheck: true, questionCount: length });
    expect(happened).toContainEqual(expect.objectContaining({ kind: 'session-finished', total: length }));
  });

  it('earns a clean sheet only with at least three questions', () => {
    const single = finish(1, [true]);
    expect(single.happened.some((h) => h.kind === 'badge-unlocked' && h.id === 'perfect-1')).toBe(false);
    expect(single.progress.badges.map((b) => b.id)).not.toContain('perfect-1');
    const three = finish(3, [true, true, true]);
    expect(three.happened).toContainEqual(expect.objectContaining({ kind: 'badge-unlocked', id: 'perfect-1' }));
  });

  it('schedules a miss as a scenario retry, which the next scenario session brings back', () => {
    const plan = chooseSpotCheck(initialProgress(), 1, NOW, createRandom(4));
    const missed = plan.questions[0]!;
    const { progress } = play(initialProgress(), plan, [false], NOW);
    expect(progress.retries).toEqual([expect.objectContaining({ id: missed.id, source: 'authored', stage: 'next' })]);
    const later = new Date(NOW.getTime() + 60_000);
    const session = chooseNextSession(progress, later, createRandom(5), { skill: 'expected-value' });
    expect(session.retries).toEqual([missed.id]);
    expect(chooseSpotCheck(progress, 3, later, createRandom(5)).retries).toEqual([missed.id]);
  });

  it('is recorded as a plain session when the finish does not say spot check', () => {
    const plan = chooseNextSession(initialProgress(), NOW, createRandom(1), { skill: 'growth-trends' });
    let p = initialProgress();
    for (const question of plan.questions) p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question, correct: true, timeMs: 30_000 }, NOW).progress;
    p = applyEvent(p, { type: 'session-finished', sessionId: plan.id }, NOW).progress;
    expect(p.sessions[0]!.spotCheck).toBeUndefined();
  });
});
