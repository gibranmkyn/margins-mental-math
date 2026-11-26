/**
 * The XP economy: one rate for every kind of practice. A correct answer pays for the
 * time it is expected to take, so a minute of honest practice earns about the same
 * whether it goes on drills, scenario or chart questions, a booklet or a mock.
 */

/** Half an XP per second of a question's target time (30 XP per target minute), before bonuses. */
export const XP_PER_TARGET_SECOND = 0.5;
/** Beating the target time adds half the base (sessions only). */
export const SPEED_BONUS_RATE = 0.5;
/** Each consecutive correct answer in a session adds 10% of the base, up to 5 extra (sessions only). */
export const COMBO_STEP = 0.1;
export const COMBO_MAX_STEPS = 5;
/**
 * A mock pays each correct answer for its share of the mock's time (no speed bonus, no
 * combo), a quarter more when the mock is passed and a quarter less when it is failed,
 * which keeps a passed mock level with sessions and a failed one well below.
 */
export const MOCK_PASSED_RATE = 1.25;
export const MOCK_FAILED_RATE = 0.75;
/** A sprint pays one XP per correct answer: a small reward for a speed test. */
export const SPRINT_XP_PER_CORRECT = 1;

export interface AnswerXp {
  xp: number;
  base: number;
  speedBonus: number;
  comboBonus: number;
}

const NONE: AnswerXp = { xp: 0, base: 0, speedBonus: 0, comboBonus: 0 };

/** Base XP for a question of a target time: at least one. */
function baseFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * XP_PER_TARGET_SECOND));
}

/** XP for an answer in a session: `combo` is the length of the correct run, counting this answer. */
export function sessionAnswerXp(targetTimeMs: number, correct: boolean, metTarget: boolean, combo: number): AnswerXp {
  if (!correct) return NONE;
  const base = baseFor(targetTimeMs / 1000);
  const speedBonus = metTarget ? Math.round(base * SPEED_BONUS_RATE) : 0;
  const comboBonus = Math.round(base * COMBO_STEP * Math.min(Math.max(combo - 1, 0), COMBO_MAX_STEPS));
  return { xp: base + speedBonus + comboBonus, base, speedBonus, comboBonus };
}

/** XP for an answer in a mock: its share of the mock's time, paid at the passed or failed rate. */
export function mockAnswerXp(timeLimitMs: number, questions: number, passed: boolean, correct: boolean): AnswerXp {
  if (!correct || questions <= 0) return NONE;
  const share = timeLimitMs / questions / 1000;
  const base = Math.max(1, Math.round(share * XP_PER_TARGET_SECOND * (passed ? MOCK_PASSED_RATE : MOCK_FAILED_RATE)));
  return { xp: base, base, speedBonus: 0, comboBonus: 0 };
}

/** XP for a sprint's score. */
export function sprintXp(score: number): number {
  return Math.max(0, Math.floor(score)) * SPRINT_XP_PER_CORRECT;
}
