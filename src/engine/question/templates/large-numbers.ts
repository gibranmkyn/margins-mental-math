import { formatNumber as f, formatShort as short } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Tier } from '../types';
import { pick } from './arithmetic';
import type { Template } from './template';

/**
 * Handling zeros and magnitudes, always marked exactly.
 * Tier 1: round numbers written in full, multiplied: 300 × 4,000.
 * Tier 2: a shorthand amount times a round number: 2.5m × 400.
 * Tier 3: shorthand amounts divided: 4.8bn ÷ 60k.
 */
export const largeNumbers: Template = {
  skill: 'large-numbers',
  tiers: [1, 2, 3],
  build(tier, random) {
    const { left, right, op, answer } = operands(tier, random);
    const written = (n: Figure, inShort: boolean) => (inShort ? short(value(n)) : f(value(n)));
    const prompt = `${written(left, tier > 1)} ${op} ${written(right, tier === 3 && value(right) >= 1000)}`;
    const leadOp = op === '×' ? left.lead * right.lead : left.lead / right.lead;
    const zeros = op === '×' ? left.zeros + right.zeros : left.zeros - right.zeros;
    const zeroSum = op === '×' ? `${left.zeros} + ${right.zeros}` : `${left.zeros} − ${right.zeros}`;
    return {
      targetTimeMs: TARGET_MS[tier],
      prompt,
      context: [],
      answer: { kind: 'numeric', value: value(answer), marking: { mode: 'exact' }, unit: '' },
      solution: [
        `Split off the zeros: ${describe(left)}; ${describe(right)}`,
        `Leading figures: ${f(left.lead)} ${op} ${f(right.lead)} = ${f(leadOp)}`,
        `Zeros: ${zeroSum} = ${zeros}`,
        `${f(leadOp)} with ${zerosWord(zeros)} = ${f(value(answer))}`,
      ],
      shortcut:
        `Set the zeros aside: ${f(left.lead)} ${op} ${f(right.lead)} = ${f(leadOp)}, ` +
        // Below a thousand there is no shorthand to unpack, so the zeros go back as a power of ten.
        `then put ${zerosWord(zeros)} back: ${
          short(value(answer)) === f(value(answer)) ? `${f(leadOp)} × ${f(10 ** zeros)}` : short(value(answer))
        } = ${f(value(answer))}`,
    };
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 10000, 2: 15000, 3: 20000 };

/** A number as leading figures followed by a count of zeros: 2.5m is 25 with 5 zeros. */
interface Figure {
  lead: number;
  zeros: number;
}

const value = ({ lead, zeros }: Figure) => lead * 10 ** zeros;

const zerosWord = (count: number) => `${count} ${count === 1 ? 'zero' : 'zeros'}`;

function describe(n: Figure): string {
  return `${short(value(n))} is ${f(n.lead)} with ${zerosWord(n.zeros)}`;
}

/** Two-figure leads that read as x.y in shorthand: 1.2m, 2.5k. */
const DECIMAL_LEADS = [12, 15, 18, 24, 25, 32, 35, 45, 48, 64, 75] as const;

/** Answers stay below ten billion so they can still be typed in full; shorthand is the fast way. */
const MAX_ANSWER = 1e10;

function operands(tier: Tier, random: Random): { left: Figure; right: Figure; op: '×' | '÷'; answer: Figure } {
  for (;;) {
    const drawn = draw(tier, random);
    if (value(drawn.answer) < MAX_ANSWER && value(drawn.left) < MAX_ANSWER * 100) return drawn;
  }
}

function draw(tier: Tier, random: Random): { left: Figure; right: Figure; op: '×' | '÷'; answer: Figure } {
  if (tier === 1) {
    const left = { lead: randomInt(random, 2, 9), zeros: randomInt(random, 1, 3) };
    const right = { lead: randomInt(random, 2, 9), zeros: randomInt(random, 2, 3) };
    return { left, right, op: '×', answer: { lead: left.lead * right.lead, zeros: left.zeros + right.zeros } };
  }
  if (tier === 2) {
    // One decimal place in shorthand: 2.5k is 25 with 2 zeros, 2.5m is 25 with 5.
    const left = { lead: pick(random, DECIMAL_LEADS), zeros: pick(random, [2, 5]) };
    const right = { lead: randomInt(random, 2, 9), zeros: randomInt(random, 1, 3) };
    return { left, right, op: '×', answer: { lead: left.lead * right.lead, zeros: left.zeros + right.zeros } };
  }
  let quotient = randomInt(random, 2, 19);
  while (quotient === 10) quotient = randomInt(random, 2, 19);
  const right = { lead: randomInt(random, 2, 9), zeros: randomInt(random, 1, 6) };
  const answer = { lead: quotient, zeros: randomInt(random, 1, 4) };
  const left = { lead: quotient * right.lead, zeros: answer.zeros + right.zeros };
  return { left, right, op: '÷', answer };
}
