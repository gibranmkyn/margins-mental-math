import { listAuthoredQuestions, listBookletQuestions, randomInt, randomSeed } from '../question';
import type { Question, Random, Skill, Tier } from '../question';
import { latestAuthoredAnswers } from './history';
import { retryQuestions } from './retries';
import { answeredToday, fits, noSiblingOf, preferring } from './siblings';
import type { Kin } from './siblings';
import type { Progress, SessionPlan, SpotCheckLength } from './types';

/** The two lengths a spot check comes in. */
export const SPOT_CHECK_LENGTHS: readonly SpotCheckLength[] = [1, 3];

/** Spot checks ask authored questions at the tiers of the booklets' screening tests. */
const SPOT_CHECK_TIERS: readonly Tier[] = [2, 3];

/** A 3-question spot check brings back at most one due retry; a 1-question one never does. */
const RETRY_ROOM: Record<SpotCheckLength, number> = { 1: 0, 3: 1 };

/**
 * Each skill's share of the booklet questions: how often the tests ask it. Without the
 * booklets (their files are private), each skill's share of the authored bank stands in.
 */
const BOOKLET_SHARES: ReadonlyMap<Skill, number> = (() => {
  const booklet = listBookletQuestions();
  const questions = booklet.length > 0 ? booklet : listAuthoredQuestions();
  const counts = new Map<Skill, number>();
  for (const q of questions) counts.set(q.skill, (counts.get(q.skill) ?? 0) + 1);
  return new Map([...counts].map(([skill, n]) => [skill, n / questions.length]));
})();

/** Every authored question at tier 2 or 3: the test-level set spot checks draw on. New ones join it as they are added. */
export function spotCheckPool(): Question[] {
  return listAuthoredQuestions().filter((q) => SPOT_CHECK_TIERS.includes(q.tier));
}

/** How many of the spot check questions have been answered at least once, anywhere, and how many there are. */
export interface SpotCheckSeen {
  seen: number;
  total: number;
}

/** How much of the test-level set has been seen: an answer in a session, a spot check or a mock counts. */
export function spotCheckSeen(progress: Progress, pool: readonly Question[] = spotCheckPool()): SpotCheckSeen {
  const latest = latestAuthoredAnswers(progress);
  return { seen: pool.filter((q) => latest.has(q.id)).length, total: pool.length };
}

/**
 * Choose a spot check: 1 or 3 authored questions at tiers 2 and 3, played as a
 * scenario session. Questions never answered come first, picked at random with
 * each skill weighted by its share of the booklet questions (of the authored bank
 * when there are no booklets); then questions whose
 * latest answer was wrong; then those answered correctly, the longest ago first.
 * An answer counts wherever it was given. A 3-question spot check avoids repeating
 * a skill while the same group has another, but never takes a later group to do so.
 * No question repeats and no two are siblings (see siblings.ts). Within each group, a
 * question that is a sibling of one answered today is passed over while others are left.
 * Among those already seen, a question with a retry pending is passed over, since
 * the retry brings it back; it is taken only when nothing else would fill the spot check.
 *
 * A 3-question spot check gives its last place to the longest-waiting due scenario
 * retry, if any, whatever its source or tier. The skill and tier of the plan are
 * the first question's. `pool` is the set to draw on; tests pass their own.
 */
export function chooseSpotCheck(
  progress: Progress,
  length: SpotCheckLength,
  now: Date,
  random: Random,
  pool: readonly Question[] = spotCheckPool(),
): SessionPlan {
  const retries = retryQuestions(progress, 'scenario', now, RETRY_ROOM[length]);
  const latest = latestAuthoredAnswers(progress);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const answered = [...latest].flatMap(([id, correct]) => {
    const question = byId.get(id);
    return question ? [{ question, correct }] : [];
  });
  const unseen = pool.filter((q) => !latest.has(q.id));
  const wrong = answered.filter((a) => !a.correct).map((a) => a.question);
  const right = answered.filter((a) => a.correct).map((a) => a.question);

  const awaiting = new Set(progress.retries.flatMap((r) => [r.id, r.questionId]));
  const settled = (questions: readonly Question[]) => questions.filter((q) => !awaiting.has(q.id));

  const today = answeredToday(progress, now);
  const picked: Question[] = [...retries];
  while (picked.length < length) {
    const next =
      unseenPick(unseen, picked, today, random) ??
      stalestPick(settled(wrong), picked, today) ??
      stalestPick(settled(right), picked, today) ??
      stalestPick(wrong, picked, today) ??
      stalestPick(right, picked, today);
    if (!next) break;
    picked.push(next);
  }
  const questions = [...picked.slice(retries.length), ...retries];
  const first = questions[0];
  if (!first) throw new Error('No authored questions at tiers 2 and 3 for a spot check');
  return {
    id: `s-${now.getTime().toString(36)}-${randomSeed(random).toString(36)}`,
    kind: 'scenario',
    skill: first.skill,
    tier: first.tier,
    questions,
    ...(retries.length > 0 && { retries: retries.map((q) => q.id) }),
    spotCheck: length,
  };
}

/** Another spot check straight after one, from its summary: the same length. */
export function anotherSpotCheck(progress: Progress, after: SessionPlan & { spotCheck: SpotCheckLength }, now: Date, random: Random): SessionPlan {
  return chooseSpotCheck(progress, after.spotCheck, now, random);
}

/** In a skill the spot check does not have yet. */
function freshSkill(question: Question, picked: readonly Question[]): boolean {
  return picked.every((p) => p.skill !== question.skill);
}

/**
 * An unseen question that fits, preferring a fresh skill, then one that is no sibling
 * of a question answered today: a skill drawn by booklet share, then a question in it at random.
 */
function unseenPick(unseen: readonly Question[], picked: readonly Question[], today: readonly Kin[], random: Random): Question | null {
  const fitting = unseen.filter((q) => fits(q, picked));
  if (fitting.length === 0) return null;
  const from = preferring(preferring(fitting, (q) => freshSkill(q, picked)), (q) => noSiblingOf(q, today));
  const skills = [...new Set(from.map((q) => q.skill))];
  const skill = weightedPick(skills, skills.map((s) => BOOKLET_SHARES.get(s) ?? 0), random);
  const inSkill = from.filter((q) => q.skill === skill);
  return inSkill[randomInt(random, 0, inSkill.length - 1)]!;
}

/** The stalest question that fits, preferring a fresh skill, then one that is no sibling of a question answered today. */
function stalestPick(stalestFirst: readonly Question[], picked: readonly Question[], today: readonly Kin[]): Question | null {
  const fitting = stalestFirst.filter((q) => fits(q, picked));
  return preferring(preferring(fitting, (q) => freshSkill(q, picked)), (q) => noSiblingOf(q, today))[0] ?? null;
}

/** One item drawn with chance in proportion to its weight; evenly when no item has any. */
function weightedPick<T>(items: readonly T[], weights: readonly number[], random: Random): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[randomInt(random, 0, items.length - 1)]!;
  let roll = random.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
