import { isScenarioSkill } from '../question';
import type { Skill } from '../question';
import type { SessionKind } from './types';

export const DRILLS_PER_SESSION = 5;
export const SCENARIOS_PER_SESSION = 3;

/** Drill skills are served as drill sessions; every multiple-choice skill as scenario sessions. */
export function sessionKindFor(skill: Skill): SessionKind {
  return isScenarioSkill(skill) ? 'scenario' : 'drill';
}

/** Questions in one session of a skill. */
export function sessionLengthFor(skill: Skill): number {
  return sessionKindFor(skill) === 'scenario' ? SCENARIOS_PER_SESSION : DRILLS_PER_SESSION;
}

/**
 * Draws one place in a session, mock or sprint gets while looking for a question
 * not already in it. Past this the last draw is taken even if it repeats, so a pool
 * smaller than the request can never stall the app.
 */
export const MAX_DRAWS = 50;

/** Draw until `taken` says no, at most MAX_DRAWS times; then the last draw, repeat or not. */
export function drawNew<T>(draw: () => T, taken: (item: T) => boolean): T {
  let item = draw();
  for (let tries = 1; tries < MAX_DRAWS && taken(item); tries++) item = draw();
  return item;
}
