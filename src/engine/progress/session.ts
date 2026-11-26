import { createQuestion, isScenarioSkill, listAuthoredQuestions, listSkills, listTemplates, randomInt, randomSeed, shuffle } from '../question';
import type { Question, Random, Skill, Tier } from '../question';
import { drawNew, DRILLS_PER_SESSION, SCENARIOS_PER_SESSION } from './lengths';
import { masteryFor, offeredTier } from './mastery';
import { bookletAfter, chooseBookletSession, openBookletQuestions } from './booklets';
import { retryQuestions } from './retries';
import { answeredToday, fits, noSiblingOf, preferring } from './siblings';
import type { Kin } from './siblings';
import { chooseSpotCheck } from './spot-checks';
import type { Progress, SessionPlan } from './types';

export { DRILLS_PER_SESSION, SCENARIOS_PER_SESSION } from './lengths';

/** The owner's own pick: a skill, and optionally a tier (otherwise the tier follows mastery). */
export interface SessionChoice {
  skill: Skill;
  tier?: Tier;
}

/** Weakness counts for more than neglect: a weak skill outranks a strong one left for a day or two. */
const WEAKNESS_WEIGHT = 1.5;
/** A skill left this long counts as fully neglected. */
const NEGLECT_FULL_HOURS = 48;

/**
 * Choose the next session: 5 drills, or 3 scenario questions for a scenario
 * skill. Without an explicit choice the app picks the skill the owner most
 * needs: weak, or not practised recently. Skills never practised count as both,
 * and the first listed goes first, so a new owner starts at the basics. The tier
 * follows mastery unless the choice names one.
 *
 * Due retries of the session's kind (drill or scenario), in any skill, take places
 * in it without making it longer, whether the app or the owner picked it: a missed
 * question comes back in the next session of its kind. The session's own skill
 * always keeps at least the first place. A scenario session never holds two siblings;
 * its own questions are chosen around the retries it brings back.
 */
export function chooseNextSession(progress: Progress, now: Date, random: Random, choice?: SessionChoice): SessionPlan {
  const skill = choice?.skill ?? neediestSkill(progress, now);
  const tier = choice?.tier ?? offeredTier(progress, skill, random);
  const scenario = isScenarioSkill(skill);
  const kind = scenario ? 'scenario' : 'drill';
  const length = scenario ? SCENARIOS_PER_SESSION : DRILLS_PER_SESSION;
  const retries = retryQuestions(progress, kind, now, length - 1);
  const chosen = { skill, tier };
  const own = length - retries.length;
  const questions = scenario ? scenarioQuestions(progress, chosen, random, own, retries, answeredToday(progress, now)) : drillQuestions(chosen, random, own, retries);
  return {
    id: `s-${now.getTime().toString(36)}-${randomSeed(random).toString(36)}`,
    kind,
    skill,
    tier,
    questions: [...questions, ...retries],
    ...(retries.length > 0 && { retries: retries.map((q) => q.id) }),
    ...(choice && { chosen: true as const }),
  };
}

/**
 * Another session straight after one, from its summary: a spot check of the same length
 * after a spot check; the same booklet while it has questions left (else the booklet to
 * continue); the same skill when the owner chose it; otherwise the app's own next pick,
 * which weighs the session just played.
 */
export function anotherSession(progress: Progress, after: SessionPlan, now: Date, random: Random): SessionPlan {
  if (after.spotCheck) return chooseSpotCheck(progress, after.spotCheck, now, random);
  if (after.booklet) return chooseBookletSession(progress, bookletAfter(progress, after.booklet), now, random);
  return chooseNextSession(progress, now, random, after.chosen ? { skill: after.skill } : undefined);
}

/** The skill with the greatest need; the first listed wins a tie. */
function neediestSkill(progress: Progress, now: Date): Skill {
  let best: { skill: Skill; need: number } | null = null;
  for (const { skill } of listSkills()) {
    const need = needFor(progress, skill, now);
    if (!best || need > best.need) best = { skill, need };
  }
  return best!.skill;
}

function needFor(progress: Progress, skill: Skill, now: Date): number {
  const { score, lastPractisedAt } = masteryFor(progress, skill);
  const hoursAway = lastPractisedAt === null ? Infinity : (now.getTime() - Date.parse(lastPractisedAt)) / 3_600_000;
  const neglect = Math.min(1, Math.max(0, hoursAway / NEGLECT_FULL_HOURS));
  return WEAKNESS_WEIGHT * (1 - score) + neglect;
}

/** A skill and tier, settled. */
type Settled = Required<SessionChoice>;

/** `count` drills, none with the same prompt as another or as a retry in the session while the tier has enough. */
function drillQuestions(choice: Settled, random: Random, count: number, retries: Question[]): Question[] {
  const seen = new Set(retries.map((q) => q.prompt));
  return Array.from({ length: count }, () => {
    const question = drawNew(() => createQuestion(choice.skill, choice.tier, random), (q) => seen.has(q.prompt));
    seen.add(question.prompt);
    return question;
  });
}


/** How often a scenario session includes a booklet question, when one is open in its skill and tier. */
const BOOKLET_SHARE = 0.5;

type Source = 'booklet' | 'authored' | 'generated';

/**
 * Where a place goes when its own source has no question left that fits the session:
 * another authored question of the skill and tier, then a generated one (or, for a
 * place meant to be generated where the tier has no templates, an authored one).
 */
const FALLBACK: Record<Source, readonly Source[]> = {
  booklet: ['booklet', 'authored', 'generated'],
  authored: ['authored', 'generated'],
  generated: ['generated', 'authored'],
};

/**
 * Three scenario questions. About half the sessions of a skill and tier with a
 * booklet question not yet answered correctly include one such question. Where the
 * skill has both generated and authored questions, the other places mix them: one
 * or two authored questions at random places, the rest generated, each generated
 * question from a different template while the skill has enough of them. A skill
 * with only one source fills the session from it. Fewer places when retries take some.
 *
 * No question repeats within a session, retries included, and no two are siblings.
 * The booklet place is filled first, then the authored ones, then the generated; a
 * place whose source has nothing left that fits falls back (FALLBACK). A booklet
 * question with a sibling answered today is not offered that day; an authored question
 * with one is passed over while others fit.
 */
function scenarioQuestions(progress: Progress, choice: Settled, random: Random, count: number, retries: Question[], today: readonly Kin[]): Question[] {
  const sources = listSkills().find((s) => s.skill === choice.skill)?.sources ?? [];
  // An open booklet question with a sibling answered today waits for another day, rather than take the booklet place.
  const booklet = openBookletQuestions(progress, choice.skill, choice.tier).filter((q) => fits(q, retries) && noSiblingOf(q, today));
  const bookletCount = booklet.length > 0 && random.next() < BOOKLET_SHARE ? 1 : 0;
  const rest = count - bookletCount;
  const authoredCount = !sources.includes('authored') ? 0 : sources.includes('generated') ? randomInt(random, 1, rest - 1) : rest;
  const slots = shuffle(
    Array.from({ length: count }, (_, i): Source => (i < bookletCount ? 'booklet' : i < bookletCount + authoredCount ? 'authored' : 'generated')),
    random,
  );
  const order = shuffle(listTemplates(choice.skill, choice.tier), random);
  const bank = listAuthoredQuestions().filter((q) => q.skill === choice.skill && q.tier === choice.tier);
  const questions: Array<Question | undefined> = slots.map(() => undefined);
  const inSession = () => [...retries, ...questions.filter((q): q is Question => q !== undefined)];
  let generated = 0;

  const fixedPick = (pool: readonly Question[]): Question | null => {
    const fitting = pool.filter((q) => fits(q, inSession()));
    if (fitting.length === 0) return null;
    const from = preferring(fitting, (q) => noSiblingOf(q, today));
    return from[randomInt(random, 0, from.length - 1)]!;
  };
  const draw = (source: Source): Question | null => {
    if (source === 'booklet') return fixedPick(booklet);
    if (source === 'authored') return fixedPick(bank);
    if (order.length === 0) return null;
    const taken = inSession();
    const template = order[generated++ % order.length]!;
    return drawNew(() => createQuestion(choice.skill, choice.tier, random, { template }), (q) => !fits(q, taken));
  };
  /** Only when nothing fits at all: any booklet or authored question of the skill and tier not already in it, else the old draw. */
  const lastResort = (): Question => {
    const pool = [...booklet, ...bank];
    const fresh = pool.filter((q) => inSession().every((p) => p.id !== q.id));
    const from = fresh.length > 0 ? fresh : pool;
    return from.length > 0 ? from[randomInt(random, 0, from.length - 1)]! : createQuestion(choice.skill, choice.tier, random);
  };

  for (const source of ['booklet', 'authored', 'generated'] as const) {
    slots.forEach((slot, i) => {
      if (slot === source) questions[i] = FALLBACK[source].reduce<Question | null>((found, s) => found ?? draw(s), null) ?? lastResort();
    });
  }
  return questions as Question[];
}
