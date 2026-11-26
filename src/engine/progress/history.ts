import { isScenarioSkill, listBookletQuestions } from '../question';

const BOOKLET_OF = new Map(listBookletQuestions().map((q) => [q.id, q.booklet!.booklet]));
import type { DrillSkill, Skill } from '../question';
import { dayNumberOf, localDay, recordDay } from './days';
import { foldMastery, startMastery } from './mastery';
import type { AnswerRecord, Earlier, MasteryState, Progress } from './types';

/**
 * Answers, sessions and sprints are kept in full for this many local days; anything older
 * is rolled up into `progress.earlier`, which holds exactly what mastery, trends, totals,
 * badges, booklets and personal bests read from it. A mock older than this keeps its
 * result and drops its per-question review. Keeps the stored document small for good.
 */
export const KEEP_DAYS = 30;

export function emptyEarlier(): Earlier {
  return {
    through: null,
    answered: 0,
    correct: 0,
    xp: 0,
    mastery: {},
    drillDays: [],
    correctFixed: [],
    bookletTrail: [],
    authoredTrail: [],
    sessionDays: [],
    sessions: 0,
    perfectSessions: 0,
    sprintBests: {},
    sprints: 0,
  };
}

/** The first local day kept in full at `now`: KEEP_DAYS days before today. */
function firstKeptDay(now: Date): string {
  return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS));
}

/** The leading records older than `first`: history is kept in time order, so what is rolled is always a prefix. */
function olderPrefix<T>(records: readonly T[], dayOf: (r: T) => string, first: string): number {
  let n = 0;
  while (n < records.length && dayOf(records[n]!) < first) n++;
  return n;
}

/**
 * Roll everything older than KEEP_DAYS into `earlier`. Every number the app derives
 * from progress is the same before and after; only the stored document shrinks.
 * Returns the progress it was given when there is nothing to roll up.
 */
export function compactProgress(progress: Progress, now: Date): Progress {
  const first = firstKeptDay(now);
  const nAnswers = olderPrefix(progress.answers, (a) => recordDay(a, a.answeredAt), first);
  const nSessions = olderPrefix(progress.sessions, (s) => recordDay(s, s.finishedAt), first);
  const nSprints = olderPrefix(progress.sprints, (s) => recordDay(s, s.finishedAt), first);
  const oldMocks = progress.mocks.filter((m) => m.questions.length > 0 && localDay(new Date(m.finishedAt)) < first).length;
  if (nAnswers + nSessions + nSprints + oldMocks === 0) return progress;

  const was = progress.earlier;
  const rolled = progress.answers.slice(0, nAnswers);
  const mastery: Partial<Record<Skill, MasteryState>> = { ...was.mastery };
  const bySkill = new Map<Skill, AnswerRecord[]>();
  for (const a of rolled) bySkill.set(a.skill, [...(bySkill.get(a.skill) ?? []), a]);
  for (const [skill, answers] of bySkill) mastery[skill] = foldMastery(skill, mastery[skill] ?? startMastery(skill), answers);

  const days = new Map(was.drillDays.map(([day, skill, count, totalMs]) => [`${day}|${skill}`, [day, skill, count, totalMs] as Earlier['drillDays'][number]]));
  for (const a of rolled) {
    if (isScenarioSkill(a.skill)) continue;
    const day = recordDay(a, a.answeredAt);
    const key = `${day}|${a.skill}`;
    const [, , count, totalMs] = days.get(key) ?? [day, a.skill as DrillSkill, 0, 0];
    days.set(key, [day, a.skill as DrillSkill, count + 1, totalMs + a.timeMs]);
  }

  const fixed = new Set(was.correctFixed);
  for (const a of rolled) if (a.correct && a.source !== 'generated') fixed.add(a.questionId);
  // The latest question of each booklet answered, oldest first: enough to tell which booklet was worked on last.
  const trail = new Map<string, string>();
  for (const id of [...was.bookletTrail, ...rolled.map((a) => a.questionId)]) {
    const booklet = BOOKLET_OF.get(id);
    if (booklet === undefined) continue;
    trail.delete(booklet);
    trail.set(booklet, id);
  }
  // Each authored question answered, at its latest answer, oldest first: what spot checks call seen, and how it went.
  const authored = new Map(was.authoredTrail);
  for (const a of rolled) {
    if (a.source !== 'authored') continue;
    authored.delete(a.questionId);
    authored.set(a.questionId, a.correct);
  }

  const sessions = progress.sessions.slice(0, nSessions);
  const sessionDays = [...new Set([...was.sessionDays, ...sessions.map((s) => recordDay(s, s.finishedAt))])].sort();
  const sprints = progress.sprints.slice(0, nSprints);
  const sprintBests = { ...was.sprintBests };
  for (const s of sprints) sprintBests[s.skill] = Math.max(sprintBests[s.skill] ?? 0, s.score);

  const earlier: Earlier = {
    through: localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS - 1)),
    answered: was.answered + rolled.length,
    correct: was.correct + rolled.filter((a) => a.correct).length,
    xp: was.xp + rolled.reduce((s, a) => s + a.xp, 0) + sprints.reduce((s, x) => s + (x.xp ?? 0), 0),
    mastery,
    drillDays: [...days.values()].sort(([a, sa], [b, sb]) => (a < b ? -1 : a > b ? 1 : sa < sb ? -1 : sa > sb ? 1 : 0)),
    correctFixed: [...fixed].sort(),
    bookletTrail: [...trail.values()],
    authoredTrail: [...authored],
    sessionDays,
    sessions: was.sessions + sessions.length,
    perfectSessions: was.perfectSessions + sessions.filter(isPerfect).length,
    sprintBests,
    sprints: was.sprints + sprints.length,
  };
  return {
    ...progress,
    earlier,
    answers: progress.answers.slice(nAnswers),
    sessions: progress.sessions.slice(nSessions),
    sprints: progress.sprints.slice(nSprints),
    mocks: progress.mocks.map((m) => (m.questions.length > 0 && localDay(new Date(m.finishedAt)) < first ? { ...m, questions: [] } : m)),
  };
}

/** A clean sheet needs a sitting of some length: one right answer in a 1-question spot check does not earn it. */
const CLEAN_SHEET_MIN_QUESTIONS = 3;

/** Every question right, in a session of at least three. Roll-up totals already stored keep what they counted. */
export const isPerfect = (s: { questionCount: number; correctCount: number }) =>
  s.questionCount >= CLEAN_SHEET_MIN_QUESTIONS && s.correctCount === s.questionCount;

/** Answers ever given, and how many were right, rolled-up history included. */
export function answeredCounts(progress: Progress): { answered: number; correct: number } {
  return {
    answered: progress.earlier.answered + progress.answers.length,
    correct: progress.earlier.correct + progress.answers.filter((a) => a.correct).length,
  };
}

/** Sessions ever finished, and how many of at least three questions had every question right. */
export function sessionCounts(progress: Progress): { finished: number; perfect: number } {
  return {
    finished: progress.earlier.sessions + progress.sessions.length,
    perfect: progress.earlier.perfectSessions + progress.sessions.filter(isPerfect).length,
  };
}

/**
 * Day numbers that count for the streak: a day with a finished session or a finished mock
 * (a sprint does not), ascending, each once. Mocks are never rolled up, so their days are
 * always read from `progress.mocks`; only session days are kept in `earlier`.
 */
export function streakDayNumbers(progress: Progress): number[] {
  const days = new Set([
    ...progress.earlier.sessionDays,
    ...progress.sessions.map((s) => recordDay(s, s.finishedAt)),
    ...progress.mocks.map((m) => recordDay(m, m.finishedAt)),
  ]);
  return [...days].map(dayNumberOf).sort((a, b) => a - b);
}

/** Ids of the questions answered correctly at least once (every booklet and authored one; generated ones only while kept in full). */
export function correctQuestionIds(progress: Progress): Set<string> {
  const ids = new Set(progress.earlier.correctFixed);
  for (const a of progress.answers) if (a.correct) ids.add(a.questionId);
  return ids;
}

/**
 * Each authored question ever answered (in a session, a spot check or a mock), at its
 * latest answer, oldest first, with whether that answer was correct. Rolled-up and recent
 * history together, so it reads the same before and after compaction.
 */
export function latestAuthoredAnswers(progress: Progress): Map<string, boolean> {
  const latest = new Map(progress.earlier.authoredTrail);
  for (const a of progress.answers) {
    if (a.source !== 'authored') continue;
    latest.delete(a.questionId);
    latest.set(a.questionId, a.correct);
  }
  return latest;
}

/** Ids of booklet questions answered, latest first (older ones only as the latest of their booklet). */
export function bookletQuestionsLatestFirst(progress: Progress): string[] {
  const recent = progress.answers.filter((a) => BOOKLET_OF.has(a.questionId)).map((a) => a.questionId);
  return [...progress.earlier.bookletTrail, ...recent].reverse();
}

/** A drill skill's best sprint score so far (0 when none). */
export function bestSprintScore(progress: Progress, skill?: DrillSkill): number {
  const earlier = skill === undefined ? Object.values(progress.earlier.sprintBests) : [progress.earlier.sprintBests[skill] ?? 0];
  const recent = progress.sprints.filter((s) => skill === undefined || s.skill === skill).map((s) => s.score);
  return Math.max(0, ...earlier, ...recent);
}

/** Drill time by local day and skill: count and total time, rolled-up history and recent answers together. */
export function drillDayTotals(progress: Progress, keep: (skill: Skill) => boolean): Map<string, { count: number; totalMs: number }> {
  const days = new Map<string, { count: number; totalMs: number }>();
  const add = (day: string, count: number, totalMs: number) => {
    const was = days.get(day) ?? { count: 0, totalMs: 0 };
    days.set(day, { count: was.count + count, totalMs: was.totalMs + totalMs });
  };
  for (const [day, skill, count, totalMs] of progress.earlier.drillDays) if (keep(skill)) add(day, count, totalMs);
  for (const a of progress.answers) if (!isScenarioSkill(a.skill) && keep(a.skill)) add(recordDay(a, a.answeredAt), 1, a.timeMs);
  return days;
}

/** Every skill with at least one answer. */
export function answeredSkills(progress: Progress): Set<Skill> {
  return new Set([...(Object.keys(progress.earlier.mastery) as Skill[]), ...progress.answers.map((a) => a.skill)]);
}
