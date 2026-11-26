import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, markAnswer } from '../question';
import type { Question, Skill, Tier } from '../question';
import { applyEvent, chooseNextSession, initialProgress, masteryFor, offeredTier } from './index';
import type { Progress } from './index';

const START = new Date('2026-11-24T08:00:00Z');
const HOUR = 3_600_000;

/** How an answer went: right and inside the target time, right but slow, or wrong. */
type Outcome = 'fast' | 'slow' | 'wrong';

/**
 * Answer questions in a skill, one per outcome, the way the session screens do,
 * a minute apart from `at`. Every five answers make one session.
 */
function practise(progress: Progress, skill: Skill, outcomes: Outcome[], at = START, tier: Tier = 1, seed = 1): Progress {
  const random = createRandom(seed);
  outcomes.forEach((outcome, i) => {
    const question = createQuestion(skill, tier, random);
    const sessionId = `${skill}-${at.getTime()}-${Math.floor(i / 5)}`;
    const timeMs = outcome === 'fast' ? question.targetTimeMs - 1000 : question.targetTimeMs + 1000;
    const correct = markAnswer(question, submissionFor(question, outcome !== 'wrong')).correct;
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId, question, correct, timeMs }, new Date(at.getTime() + i * 60_000)).progress;
  });
  return progress;
}

function submissionFor(question: Question, right: boolean) {
  if (question.answer.kind === 'choice') {
    const { correctIndex, options } = question.answer;
    return { kind: 'choice' as const, index: right ? correctIndex : (correctIndex + 1) % options.length };
  }
  return { kind: 'numeric' as const, value: right ? question.answer.value : question.answer.value * 2 + 7 };
}

const times = (n: number, outcome: Outcome): Outcome[] => Array.from({ length: n }, () => outcome);

describe('mastery', () => {
  it('starts at nothing for a skill never practised', () => {
    expect(masteryFor(initialProgress(), 'multiplication')).toMatchObject({ score: 0, stars: 0, answered: 0, lastPractisedAt: null });
  });

  it('rises with correct answers inside the target time and falls with wrong ones', () => {
    const scores: number[] = [];
    let progress = initialProgress();
    for (let round = 0; round < 4; round++) {
      progress = practise(progress, 'multiplication', times(5, 'fast'), new Date(START.getTime() + round * HOUR), 1, round + 1);
      scores.push(masteryFor(progress, 'multiplication').score);
    }
    // One clean session is a start, not mastery; each further one adds to it.
    expect(scores[0]).toBeGreaterThan(0.3);
    expect(scores[0]).toBeLessThan(0.7);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]!);
    expect(scores[3]).toBeGreaterThan(0.8);

    const falling = practise(progress, 'multiplication', times(5, 'wrong'), new Date(START.getTime() + 5 * HOUR), 1, 9);
    expect(masteryFor(falling, 'multiplication').score).toBeLessThan(scores[3]! - 0.1);
  });

  it('counts recent answers more than old ones', () => {
    const oldMisses = practise(initialProgress(), 'division', [...times(10, 'wrong'), ...times(10, 'fast')]);
    const recentMisses = practise(initialProgress(), 'division', [...times(10, 'fast'), ...times(10, 'wrong')]);
    expect(masteryFor(oldMisses, 'division').score).toBeGreaterThan(masteryFor(recentMisses, 'division').score + 0.1);
  });

  it('gives right-but-slow answers less credit than answers inside the target time', () => {
    const fast = practise(initialProgress(), 'addition', times(20, 'fast'));
    const slow = practise(initialProgress(), 'addition', times(20, 'slow'));
    expect(masteryFor(slow, 'addition').score).toBeGreaterThan(0.3);
    expect(masteryFor(slow, 'addition').score).toBeLessThan(masteryFor(fast, 'addition').score - 0.3);
  });

  it('is kept per skill', () => {
    const progress = practise(initialProgress(), 'addition', times(10, 'fast'));
    expect(masteryFor(progress, 'addition').answered).toBe(10);
    expect(masteryFor(progress, 'subtraction')).toMatchObject({ score: 0, answered: 0 });
  });
});

describe('stars', () => {
  const starsAfter = (outcomes: Outcome[], skill: Skill = 'multiplication') => masteryFor(practise(initialProgress(), skill, outcomes), skill).stars;

  it('gives one star for a first clean drill session, and none for a poor one', () => {
    expect(starsAfter(times(5, 'fast'))).toBe(1);
    expect(starsAfter(['fast', 'wrong', 'wrong', 'fast', 'wrong'])).toBe(0);
  });

  it('needs three sessions of answers for two stars and six for three, however good the score', () => {
    expect(starsAfter(times(4, 'fast'))).toBe(0);
    expect(starsAfter(times(14, 'fast'))).toBe(1);
    expect(starsAfter(times(15, 'fast'))).toBe(2);
    expect(starsAfter(times(29, 'fast'))).toBe(2);
    expect(starsAfter(times(30, 'fast'))).toBe(3);
  });

  it('holds back stars when the score is too low, however many answers', () => {
    // Always right, never inside the target time: one star at most.
    expect(starsAfter(times(40, 'slow'))).toBe(1);
    // Right and fast half the time, wrong otherwise.
    const mixed = Array.from({ length: 40 }, (_, i): Outcome => (i % 2 === 0 ? 'fast' : 'wrong'));
    expect(starsAfter(mixed)).toBe(1);
    // Fast three times in four, slow otherwise: two stars, not three.
    const mostlyFast = Array.from({ length: 40 }, (_, i): Outcome => (i % 4 === 3 ? 'slow' : 'fast'));
    expect(starsAfter(mostlyFast)).toBe(2);
  });

  it('counts scenario skills in sessions of three questions', () => {
    expect(starsAfter(times(3, 'fast'), 'break-even-payback')).toBe(1);
    expect(starsAfter(times(8, 'fast'), 'break-even-payback')).toBe(1);
    expect(starsAfter(times(9, 'fast'), 'break-even-payback')).toBe(2);
    expect(starsAfter(times(18, 'fast'), 'break-even-payback')).toBe(3);
  });

  it('are lost again when recent answers go wrong', () => {
    const strong = practise(initialProgress(), 'multiplication', times(30, 'fast'));
    expect(masteryFor(strong, 'multiplication').stars).toBe(3);
    const shaky = practise(strong, 'multiplication', times(3, 'wrong'), new Date(START.getTime() + 2 * HOUR), 1, 7);
    expect(masteryFor(shaky, 'multiplication').stars).toBeLessThan(3);
  });
});

describe('one bad session', () => {
  const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

  it('costs three stars and tier 3 no more than one star and one tier (the QA case: 36 right, then a session all wrong)', () => {
    const strong = practise(initialProgress(), 'multiplication', times(36, 'fast'));
    expect(masteryFor(strong, 'multiplication')).toMatchObject({ stars: 3, tier: 3 });
    const bad = practise(strong, 'multiplication', times(5, 'wrong'), at(2), 3, 5);
    expect(masteryFor(bad, 'multiplication')).toMatchObject({ stars: 2, tier: 2 });
  });

  it('never costs more than one star or one tier, whatever came before, in drills and scenarios alike', () => {
    const outcomes: Outcome[] = ['fast', 'fast', 'fast', 'slow', 'wrong'];
    for (const [skill, length] of [['division', 5], ['break-even-payback', 3]] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const random = createRandom(seed);
        // A history of 1 to 12 sessions, mostly good, in a random mix.
        const count = length * (1 + (seed % 12));
        const history = Array.from({ length: count }, (): Outcome => (random.next() < 0.7 ? 'fast' : outcomes[Math.floor(random.next() * outcomes.length)]!));
        const before = practise(initialProgress(), skill, history, START, 1, seed);
        const after = practise(before, skill, times(length, 'wrong'), at(5), 1, seed + 100);
        const was = masteryFor(before, skill);
        const now = masteryFor(after, skill);
        expect(now.stars).toBeGreaterThanOrEqual(was.stars - 1);
        expect(now.tier).toBeGreaterThanOrEqual(was.tier - 1);
      }
    }
  });

  it('is followed down by a genuine slump: a few bad sessions take it to one star, a few more to none', () => {
    let progress = practise(initialProgress(), 'multiplication', times(36, 'fast'));
    for (let n = 1; n <= 3; n++) progress = practise(progress, 'multiplication', times(5, 'wrong'), at(n), 1, n);
    expect(masteryFor(progress, 'multiplication')).toMatchObject({ stars: 1, tier: 1 });
    for (let n = 4; n <= 6; n++) progress = practise(progress, 'multiplication', times(5, 'wrong'), at(n), 1, n);
    expect(masteryFor(progress, 'multiplication').stars).toBe(0);
  });

  it('is followed down by a slump of poor rather than hopeless sessions, too', () => {
    let progress = practise(initialProgress(), 'division', times(36, 'fast'));
    const poor: Outcome[] = ['fast', 'wrong', 'wrong', 'slow', 'wrong'];
    for (let n = 1; n <= 8; n++) progress = practise(progress, 'division', poor, at(n), 1, n);
    expect(masteryFor(progress, 'division').stars).toBeLessThanOrEqual(1);
  });
});

describe('the tier offered', () => {
  /** How often each tier is offered over many sessions' worth of random draws. */
  function tierCounts(progress: Progress, skill: Skill): Record<Tier, number> {
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
    for (let seed = 1; seed <= 400; seed++) counts[offeredTier(progress, skill, createRandom(seed))]++;
    return counts;
  }

  it('follows mastery: tier 1 when new, tier 2 at two stars, tier 3 at three', () => {
    const fresh = initialProgress();
    const twoStars = practise(initialProgress(), 'division', times(15, 'fast'));
    const threeStars = practise(initialProgress(), 'division', times(30, 'fast'));
    expect(masteryFor(fresh, 'division').tier).toBe(1);
    expect(masteryFor(twoStars, 'division')).toMatchObject({ stars: 2, tier: 2 });
    expect(masteryFor(threeStars, 'division')).toMatchObject({ stars: 3, tier: 3 });

    const counts = [fresh, twoStars, threeStars].map((p) => tierCounts(p, 'division'));
    // A skill never practised always starts at tier 1: no variation without evidence.
    expect(counts[0]).toEqual({ 1: 400, 2: 0, 3: 0 });
    expect(counts[1]![2]).toBeGreaterThan(300);
    expect(counts[2]![3]).toBeGreaterThan(300);
  });

  it('stays at tier 1 on one star', () => {
    const oneStar = practise(initialProgress(), 'division', times(5, 'fast'));
    expect(masteryFor(oneStar, 'division')).toMatchObject({ stars: 1, tier: 1 });
  });

  it('drops back a tier when mastery falls', () => {
    const strong = practise(initialProgress(), 'division', times(30, 'fast'));
    const slipping = practise(strong, 'division', times(5, 'wrong'), new Date(START.getTime() + 3 * HOUR), 3, 4);
    expect(masteryFor(slipping, 'division').tier).toBeLessThan(3);
  });

  it('varies occasionally, one tier up or down, never further and never off the ends', () => {
    const bottom = tierCounts(practise(initialProgress(), 'division', times(5, 'fast')), 'division');
    expect(bottom[2]).toBeGreaterThan(10);
    expect(bottom[2]).toBeLessThan(100);
    expect(bottom[3]).toBe(0);

    const middle = tierCounts(practise(initialProgress(), 'division', times(15, 'fast')), 'division');
    expect(middle[1]).toBeGreaterThan(10);
    expect(middle[3]).toBeGreaterThan(10);
    expect(middle[1] + middle[3]).toBeLessThan(100);

    const top = tierCounts(practise(initialProgress(), 'division', times(30, 'fast')), 'division');
    expect(top[2]).toBeGreaterThan(10);
    expect(top[1]).toBe(0);
  });
});

describe('choosing the next session', () => {
  const ALL = listSkills().map((s) => s.skill);
  const DAY = 24 * HOUR;

  /** Every skill practised well (six sessions' worth, all fast) at the given time. */
  function allStrong(at = START): Progress {
    return ALL.reduce((p, skill, i) => practise(p, skill, times(30, 'fast'), at, 1, i + 1), initialProgress());
  }

  it('starts a new owner at the first skill, then works through the skills not yet practised', () => {
    const first = chooseNextSession(initialProgress(), START, createRandom(1));
    expect(first).toMatchObject({ skill: ALL[0], kind: 'drill', tier: 1 });

    const later = new Date(START.getTime() + HOUR);
    const afterFirst = practise(initialProgress(), ALL[0]!, times(5, 'fast'));
    expect(chooseNextSession(afterFirst, later, createRandom(1)).skill).toBe(ALL[1]);
  });

  it('favours the weakest skill when all were practised equally recently', () => {
    let progress = allStrong();
    progress = practise(progress, 'percentages', times(10, 'wrong'), new Date(START.getTime() + 30 * 60_000), 1, 50);
    for (let seed = 1; seed <= 20; seed++) {
      expect(chooseNextSession(progress, new Date(START.getTime() + 2 * HOUR), createRandom(seed)).skill).toBe('percentages');
    }
  });

  it('favours a skill not practised for days over equally strong skills practised today', () => {
    let progress = practise(initialProgress(), 'compound-growth', times(30, 'fast'), START, 1, 99);
    const today = new Date(START.getTime() + 3 * DAY);
    for (const [i, skill] of ALL.entries()) {
      if (skill !== 'compound-growth') progress = practise(progress, skill, times(30, 'fast'), today, 1, i + 1);
    }
    expect(chooseNextSession(progress, new Date(today.getTime() + 2 * HOUR), createRandom(3)).skill).toBe('compound-growth');
  });

  it('does not send the owner straight back to a weak skill just practised when another weak one has waited', () => {
    let progress = allStrong();
    progress = practise(progress, 'division', [...times(3, 'fast'), ...times(7, 'wrong')], new Date(START.getTime() + HOUR), 1, 60);
    const later = new Date(START.getTime() + DAY);
    progress = practise(progress, 'percentages', [...times(3, 'fast'), ...times(7, 'wrong')], later, 1, 61);
    expect(chooseNextSession(progress, new Date(later.getTime() + 15 * 60_000), createRandom(5)).skill).toBe('division');
  });

  it('offers the tier mastery points to in the skill it picks', () => {
    let progress = allStrong();
    progress = practise(progress, 'large-numbers', times(10, 'wrong'), new Date(START.getTime() + HOUR), 1, 70);
    const plan = chooseNextSession(progress, new Date(START.getTime() + 3 * HOUR), createRandom(2));
    expect(plan.skill).toBe('large-numbers');
    expect(plan.questions.every((q) => q.tier === plan.tier)).toBe(true);
    const tiers = new Set(Array.from({ length: 40 }, (_, seed) => chooseNextSession(progress, START, createRandom(seed)).tier));
    expect([...tiers].sort()).toEqual([1, 2]);
  });

  it('honours an explicit choice of skill over the app pick, offering the tier its mastery points to', () => {
    const progress = practise(initialProgress(), 'multiplication', times(15, 'fast'));
    for (let seed = 1; seed <= 30; seed++) {
      const plan = chooseNextSession(progress, START, createRandom(seed), { skill: 'multiplication' });
      expect(plan.skill).toBe('multiplication');
      expect(plan.questions).toHaveLength(5);
      expect(plan.questions.every((q) => q.skill === 'multiplication' && q.tier === plan.tier)).toBe(true);
    }
    const tiers = Array.from({ length: 100 }, (_, seed) => chooseNextSession(progress, START, createRandom(seed), { skill: 'multiplication' }).tier);
    expect(tiers.filter((t) => t === 2).length).toBeGreaterThan(70);

    const scenario = chooseNextSession(progress, START, createRandom(4), { skill: 'expected-value' });
    expect(scenario).toMatchObject({ kind: 'scenario', skill: 'expected-value' });
    expect(scenario.questions).toHaveLength(3);
  });
});
