import { describe, expect, it } from 'vitest';
import { createRandom, listAuthoredQuestions, listBooklets, listBookletQuestions, listSkills } from '../question';
import type { Question, Random } from '../question';
import { applyEvent, chooseBookletSession, chooseMock, chooseNextSession, chooseSpotCheck, initialProgress, mockMix, retryStatus } from './index';
import type { Progress } from './index';
import { NO_BOOKLETS } from '../question/test-support/booklets';

/** Local-time dates, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute);
const NOW = at(25, 18);

const AUTHORED = listAuthoredQuestions();
const BOOKLET = listBookletQuestions();
const ids = (questions: readonly Question[]) => questions.map((q) => q.id);

/** Siblings, as the glossary defines them: modelled on the same booklet question, or one modelled on the other. */
function siblings(a: Question, b: Question): boolean {
  return (
    (a.modelledOn !== undefined && (a.modelledOn === b.modelledOn || a.modelledOn === b.id)) ||
    (b.modelledOn !== undefined && b.modelledOn === a.id)
  );
}

function siblingPairs(questions: readonly Question[]): string[] {
  const pairs: string[] = [];
  questions.forEach((a, i) => questions.slice(i + 1).forEach((b) => siblings(a, b) && pairs.push(`${a.id} + ${b.id}`)));
  return pairs;
}

/** Answer questions one after another, a minute apart. */
function answered(progress: Progress, questions: readonly Question[], correct: boolean, from: Date): Progress {
  let t = from.getTime();
  for (const question of questions) {
    t += 60_000;
    progress = applyEvent(progress, { type: 'answer-recorded', sessionId: `s-${from.getTime()}`, question, correct, timeMs: 60_000 }, new Date(t)).progress;
  }
  return progress;
}

/** Authored questions grouped by the booklet question they are modelled on, largest groups first. */
const FAMILIES: Array<{ source: Question | undefined; variants: Question[] }> = (() => {
  const groups = new Map<string, Question[]>();
  for (const q of AUTHORED) if (q.modelledOn) groups.set(q.modelledOn, [...(groups.get(q.modelledOn) ?? []), q]);
  return [...groups]
    .map(([id, variants]) => ({ source: BOOKLET.find((b) => b.id === id), variants }))
    .sort((a, b) => b.variants.length - a.variants.length);
})();

/** A family with at least two variants at the same skill and tier as each other. */
const PAIR = (() => {
  for (const { source, variants } of FAMILIES) {
    for (const v of variants) {
      const twin = variants.find((w) => w !== v && w.skill === v.skill && w.tier === v.tier);
      if (twin) return { source, first: v, second: twin, family: variants };
    }
  }
  throw new Error('No two variants of one booklet question share a skill and tier');
})();

const CHOICE_SKILLS = listSkills().filter((s) => s.kind !== 'drill');

/** Progress states the selection must hold up in. */
const STATES: Array<[string, Progress]> = [
  ['fresh', initialProgress()],
  [
    'half the booklets right, a third of the bank seen',
    answered(answered(initialProgress(), BOOKLET.filter((_, i) => i % 2 === 0), true, at(10)), AUTHORED.filter((_, i) => i % 3 === 0), true, at(11)),
  ],
  [
    'due retries of variants and their booklet questions',
    answered(initialProgress(), [...FAMILIES.slice(0, 6).flatMap((f) => [...f.variants.slice(0, 2), ...(f.source ? [f.source] : [])])], false, at(24)),
  ],
  ['many variants answered today', answered(initialProgress(), FAMILIES.slice(0, 30).map((f) => f.variants[0]!), true, at(25, 9))],
];

describe('no sitting holds two siblings', () => {
  it.each(STATES)('scenario and chart sessions of every skill and tier (%s)', (_, progress) => {
    for (const { skill, tiers } of CHOICE_SKILLS) {
      for (const tier of tiers) {
        for (let seed = 1; seed <= 40; seed++) {
          const plan = chooseNextSession(progress, NOW, createRandom(seed), { skill, tier });
          expect(plan.questions, `${skill} tier ${tier} seed ${seed}`).toHaveLength(3);
          expect(siblingPairs(plan.questions), `${skill} tier ${tier} seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it.each(STATES)("the app's own pick and another session after it (%s)", (_, progress) => {
    for (let seed = 1; seed <= 60; seed++) {
      expect(siblingPairs(chooseNextSession(progress, NOW, createRandom(seed)).questions)).toEqual([]);
    }
  });

  it.each(STATES)('mocks of both lengths, keeping their length and booklet half (%s)', (_, progress) => {
    for (const length of ['short', 'full'] as const) {
      const { booklet } = mockMix(progress, length);
      for (let seed = 1; seed <= 120; seed++) {
        const mock = chooseMock(progress, length, NOW, createRandom(seed));
        expect(mock.questions).toHaveLength(length === 'short' ? 10 : 26);
        expect(mock.questions.filter((q) => q.source === 'booklet')).toHaveLength(booklet);
        expect(new Set(ids(mock.questions)).size).toBe(mock.questions.length);
        expect(siblingPairs(mock.questions), `${length} seed ${seed}`).toEqual([]);
      }
    }
  });

  it.each(STATES)('spot checks (%s)', (_, progress) => {
    for (let seed = 1; seed <= 60; seed++) expect(siblingPairs(chooseSpotCheck(progress, 3, NOW, createRandom(seed)).questions)).toEqual([]);
  });

  it.each(STATES)('every booklet session (%s)', (_, progress) => {
    for (const { id } of listBooklets()) {
      if (listBooklets().find((b) => b.id === id)!.questions.length === 0) continue;
      expect(siblingPairs(chooseBookletSession(progress, id, NOW, createRandom(1)).questions), id).toEqual([]);
    }
  });

  it('holds even when the random source always draws the same number', () => {
    const stuck: Random = { next: () => 0.5 };
    for (const [, progress] of STATES) {
      for (const { skill, tiers } of CHOICE_SKILLS) {
        for (const tier of tiers) {
          const plan = chooseNextSession(progress, NOW, stuck, { skill, tier });
          expect(plan.questions).toHaveLength(3);
          expect(siblingPairs(plan.questions), `${skill} tier ${tier}`).toEqual([]);
          const fixed = plan.questions.filter((q) => q.source !== 'generated');
          expect(new Set(ids(fixed)).size, `${skill} tier ${tier}`).toBe(fixed.length);
        }
      }
      expect(siblingPairs(chooseMock(progress, 'full', NOW, stuck).questions)).toEqual([]);
    }
  });
});

describe('retries and their siblings', () => {
  it("a due retry keeps its place, and the session's other questions are no siblings of it", () => {
    const progress = answered(initialProgress(), [PAIR.first], false, at(24));
    for (let seed = 1; seed <= 60; seed++) {
      const plan = chooseNextSession(progress, NOW, createRandom(seed), { skill: PAIR.first.skill, tier: PAIR.first.tier });
      expect(plan.retries).toEqual([PAIR.first.id]);
      for (const q of plan.questions.filter((x) => x.id !== PAIR.first.id)) expect(siblings(q, PAIR.first), q.id).toBe(false);
    }
  });

  it('of two due retries that are siblings, the older comes back and the other waits, still due, for the next session', () => {
    let progress = answered(initialProgress(), [PAIR.first], false, at(23));
    progress = answered(progress, [PAIR.second], false, at(24));
    const plan = chooseNextSession(progress, NOW, createRandom(1), { skill: PAIR.first.skill, tier: PAIR.first.tier });
    expect(plan.retries).toEqual([PAIR.first.id]);
    expect(retryStatus(progress, NOW)).toEqual({ pending: 2, due: 2 });

    const after = answered(progress, [PAIR.first], true, NOW);
    const next = chooseNextSession(after, new Date(NOW.getTime() + 600_000), createRandom(2), { skill: PAIR.first.skill, tier: PAIR.first.tier });
    expect(next.retries).toEqual([PAIR.second.id]);
  });

  it.skipIf(NO_BOOKLETS)("a booklet session keeps its own questions in order; a due retry that is a sibling of one of them waits", () => {
    const booklet = listBooklets().find((b) => b.questions.slice(0, 3).some((q) => FAMILIES.some((f) => f.source?.id === q.id)))!;
    const source = booklet.questions.slice(0, 3).find((q) => FAMILIES.some((f) => f.source?.id === q.id))!;
    const variant = FAMILIES.find((f) => f.source?.id === source.id)!.variants[0]!;
    const progress = answered(initialProgress(), [variant], false, at(24));
    const plan = chooseBookletSession(progress, booklet.id, NOW, createRandom(1));
    expect(ids(plan.questions)).toEqual(ids(booklet.questions.slice(0, 3)));
    expect(plan.retries).toBeUndefined();
    expect(retryStatus(progress, NOW).due).toBe(1);
  });
});

describe('steering clear of the siblings of questions answered today', () => {
  const answeredToday = (day: number) => answered(initialProgress(), [PAIR.first], true, at(day, 9));
  const kinOfFirst = (q: Question) => q.id !== PAIR.first.id && siblings(q, PAIR.first);

  it('a session of the same skill and tier passes over them while it has others', () => {
    const today = answeredToday(25);
    for (let seed = 1; seed <= 200; seed++) {
      const plan = chooseNextSession(today, NOW, createRandom(seed), { skill: PAIR.first.skill, tier: PAIR.first.tier });
      expect(plan.questions.filter(kinOfFirst).map((q) => q.id), `seed ${seed}`).toEqual([]);
    }
  });

  it('only on the same day: the next day they may come back', () => {
    const yesterday = answeredToday(24);
    let served = 0;
    for (let seed = 1; seed <= 400; seed++) {
      served += chooseNextSession(yesterday, NOW, createRandom(seed), { skill: PAIR.first.skill, tier: PAIR.first.tier }).questions.filter(kinOfFirst).length;
    }
    expect(served).toBeGreaterThan(0);
  });

  it('a mock passes over them while it has others', () => {
    const today = answered(initialProgress(), FAMILIES.slice(0, 20).map((f) => f.variants[0]!), true, at(25, 9));
    const done = FAMILIES.slice(0, 20).map((f) => f.variants[0]!);
    for (let seed = 1; seed <= 150; seed++) {
      const mock = chooseMock(today, 'full', NOW, createRandom(seed));
      for (const q of mock.questions) for (const d of done) expect(q.id !== d.id && siblings(q, d), `${q.id} beside today's ${d.id}`).toBe(false);
    }
  });

  it('a spot check passes over unseen ones while other unseen questions are left', () => {
    const done = FAMILIES.slice(0, 30).map((f) => f.variants[0]!);
    const today = answered(initialProgress(), done, true, at(25, 9));
    for (let seed = 1; seed <= 150; seed++) {
      for (const q of chooseSpotCheck(today, 3, NOW, createRandom(seed)).questions) {
        for (const d of done) expect(siblings(q, d), `${q.id} beside today's ${d.id}`).toBe(false);
      }
    }
  });
});

describe('the mix of sources stays as it was', () => {
  it.skipIf(NO_BOOKLETS)('about half the sessions of a skill and tier with an open booklet question include one', () => {
    let sessions = 0;
    let withBooklet = 0;
    for (const { skill, tiers } of CHOICE_SKILLS) {
      for (const tier of tiers) {
        if (!BOOKLET.some((q) => q.skill === skill && q.tier === tier)) continue;
        for (let seed = 1; seed <= 100; seed++) {
          sessions++;
          if (chooseNextSession(initialProgress(), NOW, createRandom(seed), { skill, tier }).questions.some((q) => q.source === 'booklet')) withBooklet++;
        }
      }
    }
    expect(withBooklet / sessions).toBeGreaterThan(0.45);
    expect(withBooklet / sessions).toBeLessThan(0.55);
  });

  it.each(STATES)('a session and a mock are the same for the same seed (%s)', (_, progress) => {
    for (const { skill, tiers } of CHOICE_SKILLS) {
      const tier = tiers[tiers.length - 1]!;
      expect(chooseNextSession(progress, NOW, createRandom(5), { skill, tier })).toEqual(chooseNextSession(progress, NOW, createRandom(5), { skill, tier }));
    }
    expect(chooseMock(progress, 'full', NOW, createRandom(5))).toEqual(chooseMock(progress, 'full', NOW, createRandom(5)));
  });
});
