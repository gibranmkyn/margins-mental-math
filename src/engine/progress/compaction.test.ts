import { describe, expect, it } from 'vitest';
import { createRandom, listAuthoredQuestions, listBooklets, listSkills } from '../question';
import type { DrillSkill, Question, Random, Skill, Tier } from '../question';
import {
  applyEvent,
  BADGES,
  bookletStatus,
  chooseBookletSession,
  chooseMock,
  chooseNextSession,
  chooseSpotCheck,
  compactProgress,
  continueBooklet,
  drillTimeTrend,
  initialProgress,
  KEEP_DAYS,
  levelFor,
  masteryFor,
  mockMix,
  mockTrend,
  personalBest,
  retryStatus,
  spotCheckSeen,
  streakStatus,
  totals,
  trendSkills,
} from './index';
import type { MockPlan, Progress } from './index';

const SKILLS = listSkills();
const DRILLS = SKILLS.filter((s) => s.kind === 'drill').map((s) => s.skill as DrillSkill);
const CHOICES = SKILLS.filter((s) => s.kind !== 'drill');
const BOOKLETS = listBooklets().map((b) => b.id);
const day = (n: number, hour = 9, minute = 0) => new Date(2026, 6, 1 + n, hour, minute);

function correctIndex(q: Question): number {
  if (q.answer.kind !== 'choice') throw new Error('Choice expected');
  return q.answer.correctIndex;
}

/** Play one session the way the screens do, with a mix of right, wrong, fast and slow answers. */
function play(p: Progress, plan: ReturnType<typeof chooseNextSession>, at: Date, random: Random, finish = true): Progress {
  let t = at.getTime();
  for (const q of plan.questions) {
    t += 30_000;
    const correct = random.next() < 0.75;
    p = applyEvent(p, { type: 'answer-recorded', sessionId: plan.id, question: q, correct, timeMs: Math.round(q.targetTimeMs * (0.5 + random.next())) }, new Date(t)).progress;
  }
  return finish ? applyEvent(p, { type: 'session-finished', sessionId: plan.id }, new Date(t + 1000)).progress : p;
}

/** About four months of varied practice, with days off, booklets, sprints, mocks and sessions left part-way. */
function longHistory(days: number, seed = 1): Progress {
  const random = createRandom(seed);
  let p = initialProgress();
  for (let n = 0; n < days; n++) {
    if (random.next() < 0.15) continue; // a day off
    const sessions = 1 + Math.floor(random.next() * 3);
    for (let k = 0; k < sessions; k++) {
      const at = day(n, 8 + k * 3);
      const roll = random.next();
      let plan;
      if (roll < 0.5) {
        const skill = DRILLS[Math.floor(random.next() * DRILLS.length)]!;
        plan = chooseNextSession(p, at, random, { skill, tier: (1 + Math.floor(random.next() * 3)) as Tier });
      } else if (roll < 0.85 || BOOKLETS.length === 0) {
        // Without the private booklet files, a scenario or chart session takes the booklet session's place.
        const info = CHOICES[Math.floor(random.next() * CHOICES.length)]!;
        plan = chooseNextSession(p, at, random, { skill: info.skill as Skill, tier: info.tiers[Math.floor(random.next() * info.tiers.length)]! });
      } else {
        plan = chooseBookletSession(p, BOOKLETS[Math.floor(random.next() * BOOKLETS.length)]!, at, random);
      }
      p = play(p, plan, at, random, random.next() < 0.9);
    }
    if (random.next() < 0.3) {
      const skill = DRILLS[Math.floor(random.next() * DRILLS.length)]!;
      p = applyEvent(p, { type: 'sprint-finished', skill, score: Math.floor(random.next() * 25), attempted: 30 }, day(n, 20)).progress;
    }
    if (n % 9 === 4) {
      const mock = chooseMock(p, n % 2 ? 'short' : 'full', day(n, 21), random);
      const choices = mock.questions.map((q) => (random.next() < 0.7 ? correctIndex(q) : random.next() < 0.5 ? null : (correctIndex(q) + 1) % 4));
      p = applyEvent(p, { type: 'mock-finished', mock, choices, timesMs: mock.questions.map(() => 90_000), timeMs: mock.timeLimitMs - 60_000 }, day(n, 21, 50)).progress;
    }
  }
  return p;
}

/** Everything the app shows or decides from progress at a moment. */
function derived(p: Progress, now: Date) {
  const skills = SKILLS.map((s) => s.skill);
  return {
    xp: p.xp,
    level: levelFor(p.xp),
    mastery: skills.map((s) => masteryFor(p, s)),
    totals: totals(p),
    streak: streakStatus(p, now),
    badges: BADGES.map((b) => [b.id, b.earned(p, { now })]),
    booklets: bookletStatus(p),
    continue: continueBooklet(p),
    mix: [mockMix(p, 'short'), mockMix(p, 'full')],
    time: (['2w', '3m', 'all'] as const).flatMap((range) => [drillTimeTrend(p, now, { range }), ...DRILLS.map((skill) => drillTimeTrend(p, now, { skill, range }))]),
    mocks: (['2w', '3m', 'all'] as const).map((range) => mockTrend(p, now, range)),
    trendSkills: trendSkills(p),
    bests: DRILLS.map((s) => personalBest(p, s)),
    retries: retryStatus(p, now),
    nextSessions: [1, 2, 3].map((seed) => chooseNextSession(p, now, createRandom(seed))),
    bookletSessions: BOOKLETS.map((b) => chooseBookletSession(p, b, now, createRandom(4))),
    mock: chooseMock(p, 'full', now, createRandom(5)),
    spotChecks: [1, 2, 3].flatMap((seed) => [chooseSpotCheck(p, 1, now, createRandom(seed)), chooseSpotCheck(p, 3, now, createRandom(seed))]),
    spotCheckSeen: spotCheckSeen(p),
  };
}

const full = longHistory(120);
const LAST = day(120, 7);

describe('compacting old history', () => {
  const compact = compactProgress(full, LAST);

  it('keeps only the last 30 days of answers, sessions and sprints in full', () => {
    expect(full.answers.length).toBeGreaterThan(500);
    expect(full.mocks.length).toBeGreaterThan(8);
    expect(compact.mocks.filter((m) => m.questions.length === 0).length).toBeGreaterThan(5);
    expect(compact.answers.length).toBeGreaterThan(0);
    expect(compact.answers.length).toBeLessThan(full.answers.length / 2);
    const first = new Date(LAST.getFullYear(), LAST.getMonth(), LAST.getDate() - KEEP_DAYS);
    for (const a of compact.answers) expect(a.day! >= `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`).toBe(true);
    expect(compact.earlier.answered + compact.answers.length).toBe(full.answers.length);
  });

  it('shrinks the stored document to a fraction of its size', () => {
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length * 0.45);
  });

  it('leaves every number the app derives unchanged, now and days later', () => {
    for (const now of [LAST, day(121, 18), day(125, 12), day(140, 12)]) {
      expect(derived(compactProgress(full, now), now)).toEqual(derived(full, now));
    }
  });

  it('keeps the streak when old days have only a mock or only a sprint', () => {
    // Days 0-39 of the history: one mock-only day every day for ten days, a sprint-only day, then a gap.
    const random = createRandom(9);
    let p = initialProgress();
    for (let n = 0; n < 10; n++) {
      const mock = chooseMock(p, 'short', day(n, 21), random);
      p = applyEvent(p, { type: 'mock-finished', mock, choices: mock.questions.map(() => null), timesMs: mock.questions.map(() => 0), timeMs: mock.timeLimitMs }, day(n, 21, 50)).progress;
    }
    p = applyEvent(p, { type: 'sprint-finished', skill: DRILLS[0]!, score: 5, attempted: 6 }, day(10, 12)).progress;
    const mock = chooseMock(p, 'short', day(60, 21), random);
    p = applyEvent(p, { type: 'mock-finished', mock, choices: mock.questions.map(() => null), timesMs: mock.questions.map(() => 0), timeMs: mock.timeLimitMs }, day(60, 21, 50)).progress;
    const now = day(60, 22);
    const rolled = compactProgress(p, now);
    expect(rolled.mocks.filter((m) => m.questions.length === 0).length).toBe(10);
    expect(streakStatus(p, now)).toMatchObject({ current: 1, longest: 10, securedToday: true });
    expect(derived(rolled, now)).toEqual(derived(p, now));
    expect(streakStatus(rolled, day(61, 8))).toMatchObject({ current: 1, longest: 10 });
  });

  it('can be repeated, and changes nothing the second time', () => {
    expect(compactProgress(compact, LAST)).toBe(compact);
    const later = day(150, 12);
    expect(derived(compactProgress(compact, later), later)).toEqual(derived(full, later));
  });

  it('keeps giving the same results as play carries on from it', () => {
    const at = day(121, 9);
    const random = () => createRandom(77);
    const plan = (p: Progress) => chooseNextSession(p, at, random());
    const fromFull = play(full, plan(full), at, random());
    const fromCompact = play(compact, plan(compact), at, random());
    const now = day(121, 12);
    expect(derived(fromCompact, now)).toEqual(derived(fromFull, now));
  });

  it('keeps the spot check order and the seen count when every test-level question was answered long ago', () => {
    // Every authored question at tier 2 or 3 answered on days 0-2 (some right, some wrong, some in a mock),
    // a few answered again later, and a handful recent: spot checks then work through what was answered wrong.
    const pool = listAuthoredQuestions().filter((q) => q.tier >= 2);
    const random = createRandom(21);
    let p = initialProgress();
    pool.forEach((question, i) => {
      if (i % 10 === 3) return;
      p = applyEvent(p, { type: 'answer-recorded', sessionId: `s-${i % 3}`, question, correct: random.next() < 0.7, timeMs: 60_000 }, day(i % 3, 9, i % 60)).progress;
    });
    const inMock = pool.filter((_, i) => i % 10 === 3);
    const mock: MockPlan = { id: 'm-old', length: 'full', questions: inMock, timeLimitMs: 55 * 60_000 };
    const choices = inMock.map((q, i) => (i % 2 === 0 ? correctIndex(q) : (correctIndex(q) + 1) % 4));
    p = applyEvent(p, { type: 'mock-finished', mock, choices, timesMs: inMock.map(() => 60_000), timeMs: 30 * 60_000 }, day(3, 21)).progress;
    p = applyEvent(p, { type: 'answer-recorded', sessionId: 's-again', question: pool[0]!, correct: false, timeMs: 60_000 }, day(10, 9)).progress;
    p = applyEvent(p, { type: 'answer-recorded', sessionId: 's-again', question: pool[1]!, correct: true, timeMs: 60_000 }, day(10, 9, 1)).progress;
    p = applyEvent(p, { type: 'answer-recorded', sessionId: 's-recent', question: pool[2]!, correct: false, timeMs: 60_000 }, day(55, 9)).progress;
    const now = day(56, 12);
    const rolled = compactProgress(p, now);
    expect(rolled.answers.length).toBe(1);
    expect(rolled.earlier.authoredTrail.length).toBe(pool.length);
    expect(spotCheckSeen(rolled, pool)).toEqual({ seen: pool.length, total: pool.length });
    const plans = (q: Progress) => Array.from({ length: 6 }, (_, seed) => [chooseSpotCheck(q, 1, now, createRandom(seed)), chooseSpotCheck(q, 3, now, createRandom(seed))]);
    expect(plans(rolled)).toEqual(plans(p));
    // Answering on, the two stay in step: every wrong answer comes back, then the stalest right ones.
    let full = p;
    let compact = rolled;
    for (let k = 0; k < 40; k++) {
      const at = new Date(now.getTime() + k * 60_000);
      const next = chooseSpotCheck(full, 1, at, createRandom(k));
      expect(chooseSpotCheck(compact, 1, at, createRandom(k))).toEqual(next);
      const event = { type: 'answer-recorded' as const, sessionId: next.id, question: next.questions[0]!, correct: k % 4 !== 0, timeMs: 60_000 };
      full = applyEvent(full, event, at).progress;
      compact = applyEvent(compact, event, at).progress;
    }
  });

  it('leaves a young history alone', () => {
    const young = longHistory(20, 3);
    expect(compactProgress(young, day(20, 12))).toBe(young);
  });
});
