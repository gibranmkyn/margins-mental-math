import { listSkills, randomInt } from '../question';
import type { Random, Skill, Tier } from '../question';
import { sessionLengthFor } from './lengths';
import type { AnswerRecord, MasteryState, Progress } from './types';

export type StarCount = 0 | 1 | 2 | 3;

/** How well recent questions in one skill went. */
export interface SkillMastery {
  skill: Skill;
  /** 0 to 1: recency-weighted average credit for answers, full credit only for a correct one inside the target time. */
  score: number;
  stars: StarCount;
  /** The tier mastery points to: 1 up to one star, 2 at two, 3 at three (nearest the skill offers). */
  tier: Tier;
  /** Every question answered in the skill, ever. */
  answered: number;
  /** ISO timestamp of the latest answer in the skill; null if never practised. */
  lastPractisedAt: string | null;
}

/** Credit for one answer: right inside the target time, right but slow, wrong. */
const CREDIT_FAST = 1;
const CREDIT_SLOW = 0.5;

/**
 * How much weight an answer keeps after one more session's worth of answers in its skill.
 * Every answer counts, the recent ones most: a session's answers weigh as much as about a
 * sixth of everything before them, so one all-wrong session lowers the score by at most
 * about a sixth (never across two star lines), while several bad sessions in a row bring
 * it down a star at a time.
 */
const SESSION_KEEP = 0.84;

/**
 * Before any answer the score leans on one session's worth of imagined misses, which
 * fade like real answers do: one clean session lifts a new skill to about half, not to full.
 */
const PRIOR_SESSIONS = 1;

/**
 * Each star needs a score and enough sessions' worth of answers behind it, so
 * a lucky start cannot earn three stars.
 */
const STAR_RULES: ReadonlyArray<{ stars: StarCount; score: number; sessions: number }> = [
  { stars: 3, score: 0.85, sessions: 6 },
  { stars: 2, score: 0.65, sessions: 3 },
  { stars: 1, score: 0.4, sessions: 1 },
];

/** Where every skill starts: no answers, only the prior. */
export function startMastery(skill: Skill): MasteryState {
  return { credit: 0, weight: PRIOR_SESSIONS * sessionLengthFor(skill), answered: 0, lastAt: null };
}

/** The state after more answers in the skill, in the order given. */
export function foldMastery(skill: Skill, state: MasteryState, answers: readonly AnswerRecord[]): MasteryState {
  const keep = keepPerAnswer(skill);
  let { credit, weight, answered, lastAt } = state;
  for (const a of answers) {
    credit = credit * keep + creditFor(a);
    weight = weight * keep + 1;
    answered++;
    lastAt = a.answeredAt;
  }
  return { credit, weight, answered, lastAt };
}

/** The weight an answer keeps per later answer, so that a session's worth of them leaves SESSION_KEEP. */
function keepPerAnswer(skill: Skill): number {
  return SESSION_KEEP ** (1 / sessionLengthFor(skill));
}

/**
 * Mastery of one skill: a weighted average of answer credit in which each answer's
 * weight fades as later ones come in, so recent answers count most. Carries on from
 * the state rolled up with older history, so compaction never changes it.
 */
export function masteryFor(progress: Progress, skill: Skill): SkillMastery {
  const earlier = progress.earlier.mastery[skill] ?? startMastery(skill);
  return masteryOf(skill, foldMastery(skill, earlier, progress.answers.filter((a) => a.skill === skill)));
}

/** What a mastery state shows: score, stars and the tier they point to. */
export function masteryOf(skill: Skill, state: MasteryState): SkillMastery {
  const score = state.weight > 0 ? state.credit / state.weight : 0;
  const perSession = sessionLengthFor(skill);
  const stars = STAR_RULES.find((rule) => score >= rule.score && state.answered >= rule.sessions * perSession)?.stars ?? 0;
  return { skill, score, stars, tier: nearestTier(skill, TIER_FOR_STARS[stars]), answered: state.answered, lastPractisedAt: state.lastAt };
}

const TIER_FOR_STARS: Record<StarCount, Tier> = { 0: 1, 1: 1, 2: 2, 3: 3 };

/** Out of ten sessions, one is offered a tier lower and one a tier higher than mastery points to. */
const VARY_DOWN = 0;
const VARY_UP = 1;
const VARY_OUT_OF = 10;

/**
 * The tier to offer for a session in a skill: the one mastery points to, with
 * occasional variation one tier up or down to keep the owner stretched. A skill
 * never practised always starts at the tier mastery points to.
 */
export function offeredTier(progress: Progress, skill: Skill, random: Random): Tier {
  const { tier, answered } = masteryFor(progress, skill);
  if (answered === 0) return tier;
  const roll = randomInt(random, 0, VARY_OUT_OF - 1);
  const shift = roll === VARY_DOWN ? -1 : roll === VARY_UP ? 1 : 0;
  const tiers = tiersOf(skill);
  const wanted = tier + shift;
  return tiers.includes(wanted as Tier) ? (wanted as Tier) : tier;
}

function tiersOf(skill: Skill): Tier[] {
  return listSkills().find((s) => s.skill === skill)?.tiers ?? [1];
}

/** The skill's own tier closest to the one wanted, preferring the easier on a tie. */
function nearestTier(skill: Skill, wanted: Tier): Tier {
  return [...tiersOf(skill)].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)[0] ?? wanted;
}

function creditFor(answer: AnswerRecord): number {
  if (!answer.correct) return 0;
  return answer.metTarget ? CREDIT_FAST : CREDIT_SLOW;
}
