import type { DrillSkill, Question, QuestionSource, Skill, Tier } from '../question';

/** Current version of the stored progress document. Bump it and add a migration when the shape changes. */
export const PROGRESS_VERSION = 12;

/** 5 typed drills, or 3 multiple-choice scenario questions. */
export type SessionKind = 'drill' | 'scenario';

/** One answer, kept as history for mastery, retries and trends. */
export interface AnswerRecord {
  sessionId: string;
  questionId: string;
  skill: Skill;
  tier: Tier;
  source: QuestionSource;
  correct: boolean;
  timeMs: number;
  /** Answered inside the question's target time; mastery counts it. */
  metTarget: boolean;
  /** The question's target time, which its XP is paid for. Absent in records made before v10. */
  targetMs?: number;
  /** XP this answer earned; zero when wrong. */
  xp: number;
  /** ISO timestamp. */
  answeredAt: string;
  /**
   * Local calendar day it was answered on (YYYY-MM-DD), kept as recorded so a later
   * change of time zone cannot move it. Absent only in hand-made or repaired records.
   */
  day?: string;
}

/** A finished session. Unfinished sessions leave only their answers behind. */
export interface SessionRecord {
  id: string;
  kind: SessionKind;
  skill: Skill;
  /** ISO timestamp. */
  finishedAt: string;
  /** Local calendar day it was finished on (YYYY-MM-DD), as recorded: the streak counts it there. */
  day?: string;
  questionCount: number;
  correctCount: number;
  timeMs: number;
  xp: number;
  /** Set when the session was a spot check. Its skill is then only the first question's. */
  spotCheck?: true;
}

/** A finished sprint. Kept apart from sessions: it does not count for the streak, and its answers are not recorded one by one; it earns a little XP. */
export interface SprintRecord {
  skill: DrillSkill;
  /** Correct answers in the 60 seconds. */
  score: number;
  /** Answers given, right or wrong. */
  attempted: number;
  /** XP it earned: one per correct answer. */
  xp: number;
  /** ISO timestamp. */
  finishedAt: string;
  /** Local calendar day it was finished on (YYYY-MM-DD), as recorded: today's XP counts it there. */
  day?: string;
}

/** A badge earned, with when. Each badge appears here at most once. */
export interface BadgeUnlock {
  id: string;
  /** ISO timestamp. */
  unlockedAt: string;
}

/** Everything the owner has earned, stored as one versioned document. */
export interface Progress {
  version: typeof PROGRESS_VERSION;
  /** Lifetime XP; levels derive from it. */
  xp: number;
  /** XP the owner aims to earn each day. Independent of the streak. */
  dailyGoal: number;
  answers: AnswerRecord[];
  sessions: SessionRecord[];
  /** Every sprint finished; personal bests derive from it. */
  sprints: SprintRecord[];
  /** Badges earned, in the order they unlocked. */
  badges: BadgeUnlock[];
  /** Missed questions waiting to come back. */
  retries: Retry[];
  /** Every mock submitted, oldest first; mock trends derive from it. Older than KEEP_DAYS, a mock keeps no per-question review. */
  mocks: MockRecord[];
  /** Answers, sessions and sprints older than KEEP_DAYS, rolled up (see history.ts). */
  earlier: Earlier;
}

/** A skill's mastery so far, as a running weighted sum: enough to carry on from without the answers behind it. */
export interface MasteryState {
  /** Weighted credit of the answers so far. */
  credit: number;
  /** Their total weight, the fading prior included. */
  weight: number;
  answered: number;
  /** ISO timestamp of the latest answer; null if never practised. */
  lastAt: string | null;
}

/**
 * History older than KEEP_DAYS, rolled up into exactly what the app derives from it:
 * every total, trend, mastery, badge, booklet and personal best is the same as from
 * the full history.
 */
export interface Earlier {
  /** The last local day rolled up (YYYY-MM-DD); null before the first roll-up. */
  through: string | null;
  answered: number;
  correct: number;
  /** XP the rolled-up answers and sprints earned. */
  xp: number;
  /** Each skill's mastery state at the end of the rolled-up answers. */
  mastery: Partial<Record<Skill, MasteryState>>;
  /** Drill answers by local day and skill: [day, skill, count, total time in ms]. */
  drillDays: Array<[string, DrillSkill, number, number]>;
  /** Booklet and authored questions answered correctly at least once. */
  correctFixed: string[];
  /** Booklet questions answered among the rolled-up answers: the latest one of each booklet, oldest first. */
  bookletTrail: string[];
  /**
   * Authored questions answered among the rolled-up answers: each once, at its latest
   * answer, oldest first, with whether that answer was correct. Spot checks read it.
   */
  authoredTrail: Array<[string, boolean]>;
  /** Local days with a finished session. */
  sessionDays: string[];
  sessions: number;
  /** Sessions of at least three questions with every question right. */
  perfectSessions: number;
  /** Best sprint score per drill skill. */
  sprintBests: Partial<Record<DrillSkill, number>>;
  sprints: number;
}

/**
 * A missed question scheduled to come back: in the next session of its kind, and
 * once answered correctly, one final time about three days later.
 */
export interface Retry {
  /** The missed question's id. */
  id: string;
  skill: Skill;
  tier: Tier;
  source: QuestionSource;
  /**
   * The question it comes back as: the same id for a booklet or authored question,
   * a fresh question from the same template for a generated one.
   */
  questionId: string;
  /** `next`: waiting for the next session of its kind. `final`: answered correctly once, back one last time. */
  stage: 'next' | 'final';
  /** ISO timestamp it is due from. */
  dueAt: string;
  /** Times it has come back and been answered; picks each fresh generated question. */
  returns: number;
}

/** A session ready to play: which skill, which questions. */
export interface SessionPlan {
  id: string;
  kind: SessionKind;
  skill: Skill;
  tier: Tier;
  questions: Question[];
  /** Set when the session works through one booklet: that booklet's id. */
  booklet?: string;
  /** Ids of the questions that are retries, when the session brings any back. */
  retries?: string[];
  /** Set when the owner chose the skill, rather than the app picking it. */
  chosen?: true;
  /** Set when the session is a spot check: its length. Its skill and tier are then only the first question's. */
  spotCheck?: SpotCheckLength;
}

/** A spot check is one question or three. */
export type SpotCheckLength = 1 | 3;

/** A short mock (10 questions in 20 minutes) or a full one (26 in 55). */
export type MockLength = 'short' | 'full';

/** One question of a submitted mock, as the review and retries need it. */
export interface MockQuestionResult {
  /** The question's identity: the same booklet or authored question, or for a generated one its template and seed. */
  questionId: string;
  skill: Skill;
  tier: Tier;
  source: QuestionSource;
  /** The option the owner chose; null when left unanswered. */
  chosen: number | null;
  correctIndex: number;
  /** False for a wrong answer and for an unanswered question alike: both are misses. */
  correct: boolean;
}

/**
 * A submitted mock. Its answered questions are also recorded one by one as
 * answers; unanswered ones only here. Missed and unanswered questions are the
 * mock's misses, which retries bring back.
 */
export interface MockRecord {
  id: string;
  length: MockLength;
  /** ISO timestamp. */
  finishedAt: string;
  /** Local calendar day it was finished on (YYYY-MM-DD), as recorded: the streak counts it there. Absent in mocks recorded before it was kept; read from `finishedAt` then. */
  day?: string;
  questionCount: number;
  correctCount: number;
  answeredCount: number;
  /** Correct answers as a whole percentage of all questions, rounded down so a fail never shows 70%. */
  percent: number;
  /** At or above the 70% pass mark. */
  passed: boolean;
  /** Time used, never more than the time allowed. */
  timeMs: number;
  /** XP the mock's correct answers earned. */
  xp: number;
  /** Every question in mock order. */
  questions: MockQuestionResult[];
}
