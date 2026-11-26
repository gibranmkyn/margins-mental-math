import { emptyEarlier } from './history';
import { DEFAULT_DAILY_GOAL } from './streak';
import { PROGRESS_VERSION } from './types';
import type { Progress } from './types';

export { anotherSession, chooseNextSession, DRILLS_PER_SESSION, SCENARIOS_PER_SESSION } from './session';
export type { SessionChoice } from './session';
export { PROGRESS_VERSION } from './types';
export { localDay } from './days';
export type * from './types';

export function initialProgress(): Progress {
  return { version: PROGRESS_VERSION, xp: 0, dailyGoal: DEFAULT_DAILY_GOAL, answers: [], sessions: [], sprints: [], badges: [], retries: [], mocks: [], earlier: emptyEarlier() };
}

export { applyEvent } from './events';
export type { Happening, ProgressEvent, Transition } from './events';
export { totals } from './totals';
export type { Totals } from './totals';
export { levelFor } from './levels';
export { rescoreXp } from './rescore';
export { compactProgress, emptyEarlier, isPerfect, KEEP_DAYS } from './history';
export { SPRINT_XP_PER_CORRECT } from './xp';
export { masteryFor, offeredTier } from './mastery';
export type { SkillMastery, StarCount } from './mastery';
export type { LevelStatus } from './levels';
export { DEFAULT_DAILY_GOAL, streakStatus } from './streak';
export type { StreakStatus } from './streak';
export { nextSprintQuestion, personalBest, SPRINT_MS, SPRINT_START, SPRINT_TIER, skipSprint, typeIntoSprint } from './sprints';
export type { SprintAnswered, SprintStep, SprintTally } from './sprints';
export { bookletAfter, bookletStatus, chooseBookletSession, continueBooklet, libraryTotals } from './booklets';
export type { BookletStatus, LibraryTotals } from './booklets';
export { chooseMock, MOCK_LENGTHS, MOCK_PASS_PERCENT, mockMix, mockTimedOut } from './mocks';
export type { MockMix, MockPlan } from './mocks';
export { BADGES, badgeById } from './badges';
export { retriesAfterAnswer, retryStatus } from './retries';
export type { RetryStatus } from './retries';
export type { BadgeDefinition } from './badges';
export { drillTimeTrend, mockTrend, trendSkills } from './trends';
export type { DayPoint, DrillTimeTrend, MockPoint, MockTrend, TrendRange } from './trends';
export { resumeRun, SESSION_RESUME_MS } from './runs';
export { anotherSpotCheck, chooseSpotCheck, SPOT_CHECK_LENGTHS, spotCheckSeen } from './spot-checks';
export type { SpotCheckSeen } from './spot-checks';
export type { MockInProgress, Resume, RunInProgress, SessionInProgress } from './runs';
