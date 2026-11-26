import { formatNumber as f } from '../format';
import { randomInt } from '../random';
import type { Random } from '../random';
import type { Marking, Tier } from '../types';
import { gcd, MINUS, pick, toCents, twoFigures } from './arithmetic';
import type { QuestionBody, Template } from './template';

const TOLERANCE: Marking = { mode: 'tolerance', percent: 3 };
const ALLOWED_ERROR = TOLERANCE.mode === 'tolerance' ? TOLERANCE.percent / 100 : 0;
const SHORTCUT_ERROR = ALLOWED_ERROR * 0.9;

/**
 * Percentage change and its reverse (the value before a known change).
 * Tier 1: change between round numbers by a friendly percentage. Exact.
 * Tier 2: change by an unround whole percentage, or the value before a
 * friendly change. Exact.
 * Tier 3: change between unround numbers, or the value before an unround
 * change: an estimation drill marked within 3%, stated to two decimal places.
 */
export const percentageChange: Template = {
  skill: 'percentage-change',
  tiers: [1, 2, 3],
  build(tier, random) {
    if (tier === 1) return exactChange(tier, random, pick(random, FRIENDLY_CHANGES), 20, 900);
    if (tier === 2) {
      return random.next() < 0.5 ? exactChange(tier, random, unroundPercent(random, 60), 100, 2_000) : exactBefore(random);
    }
    return random.next() < 0.5 ? estimatedChange(random) : estimatedBefore(random);
  },
};

const TARGET_MS: Record<Tier, number> = { 1: 12000, 2: 20000, 3: 25000 };

const FRIENDLY_CHANGES = [10, 20, 25, 50, 100, -10, -20, -25, -50, 5, -5] as const;
const FRIENDLY_BEFORE = [10, 20, 25, 40, 50, 5, 15, 30, 60, 75, -10, -20, -25, -40, -50, -5, -15, -30] as const;

const signed = (p: number) => (p >= 0 ? `+${f(p)}` : `${MINUS}${f(-p)}`);

/** A whole percentage, up or down, that is not a multiple of five. */
function unroundPercent(random: Random, max: number, min = 2): number {
  for (;;) {
    const p = randomInt(random, min, max);
    if (p % 5 !== 0) return random.next() < 0.6 ? p : -p;
  }
}

/** The smallest start value that a p% change keeps whole. */
const wholeStep = (p: number) => 100 / gcd(Math.abs(p), 100);

function multipleIn(random: Random, step: number, min: number, max: number): number {
  return step * randomInt(random, Math.ceil(min / step), Math.floor(max / step));
}

/** A fraction written in lowest terms, sign kept on the top: −20/80 -> −1/4. */
function lowest(top: number, bottom: number): string {
  const d = gcd(top, bottom);
  return bottom === d ? f(top / d) : `${f(top / d)}/${f(bottom / d)}`;
}

function exactChange(tier: Tier, random: Random, p: number, min: number, max: number): QuestionBody {
  const from = multipleIn(random, wholeStep(p), min, max);
  const to = (from * (100 + p)) / 100;
  const diff = to - from;
  const simplified = lowest(diff, from);
  const asFraction = simplified === `${f(diff)}/${f(from)}` ? '' : ` = ${simplified}`;
  return {
    targetTimeMs: TARGET_MS[tier],
    prompt: `${f(from)} → ${f(to)}, % change`,
    context: [],
    answer: { kind: 'numeric', value: p, marking: { mode: 'exact' }, unit: '%' },
    solution: [`Change: ${f(to)} − ${f(from)} = ${f(diff)}`, `${f(diff)} ÷ ${f(from)} = ${f(diff / from)}`, `${f(diff / from)} × 100 = ${f(p)}%`],
    shortcut: `Change over start as a fraction: ${f(diff)}/${f(from)}${asFraction} = ${f(p)}%`,
  };
}

/** The value before a friendly change: undo the change by flipping its fraction. */
function exactBefore(random: Random): QuestionBody {
  const p = pick(random, FRIENDLY_BEFORE);
  const step = wholeStep(p);
  const before = multipleIn(random, step, 100, 4_000);
  const after = (before * (100 + p)) / 100;
  const factor = (100 + p) / 100;
  const d = gcd(100 + p, 100);
  const [top, bottom] = [(100 + p) / d, 100 / d];
  return {
    targetTimeMs: TARGET_MS[2],
    prompt: `${p > 0 ? 'Rose' : 'Fell'} ${f(Math.abs(p))}% to ${f(after)}. Before?`,
    context: [],
    answer: { kind: 'numeric', value: before, marking: { mode: 'exact' }, unit: '' },
    solution: [`After = before × ${f(factor)}`, `Before = ${f(after)} ÷ ${f(factor)} = ${f(before)}`],
    shortcut: `${signed(p)}% multiplies by ${top}/${bottom}, so undo it: ${f(after)} ÷ ${top} × ${bottom} = ${f(before)}`,
  };
}

function estimatedChange(random: Random): QuestionBody {
  for (;;) {
    const from = randomInt(random, 120, 9_800);
    const to = Math.round(from * (1 + unroundPercent(random, 45, 6) / 100 + (random.next() - 0.5) / 100));
    const diff = to - from;
    if (diff === 0) continue;
    const truth = (diff / from) * 100;
    const [roughDiff, roughFrom] = [twoFigures(diff), twoFigures(from)];
    // An estimate to a whole percent, or to one decimal place below 10%.
    const places = Math.abs(roughDiff / roughFrom) < 0.1 ? 10 : 1;
    const estimate = Math.round((roughDiff / roughFrom) * 100 * places) / places;
    if (Math.abs(estimate - truth) > SHORTCUT_ERROR * Math.abs(truth)) continue;
    const stated = toCents(truth);
    const ratio = Math.round((diff / from) * 10_000) / 10_000;
    return {
      targetTimeMs: TARGET_MS[3],
      prompt: `${f(from)} → ${f(to)}, % change`,
      context: [],
      answer: { kind: 'numeric', value: stated, marking: TOLERANCE, unit: '%' },
      solution: [`Change: ${f(to)} − ${f(from)} = ${f(diff)}`, `${f(diff)} ÷ ${f(from)} ≈ ${f(ratio)}`, `${f(ratio)} × 100 ≈ ${f(stated)}%`],
      shortcut: `Round both to two figures: ${f(roughDiff)} ÷ ${f(roughFrom)} ≈ ${f(estimate)}%`,
    };
  }
}

/**
 * The value before an unround change. Dividing by 1 + r is close to
 * multiplying by 1 − r + r², which is easy to do in the head.
 */
function estimatedBefore(random: Random): QuestionBody {
  for (;;) {
    const p = unroundPercent(random, 18);
    const after = randomInt(random, 150, 9_900);
    const r = p / 100;
    const truth = after / (1 + r);
    // Undo p% by taking off p% of the figure, then giving back p% of what came off: whole numbers throughout.
    const off = Math.round(Math.abs(r) * after);
    const back = Math.round(r * r * after);
    const estimate = after - Math.sign(r) * off + back;
    if (Math.abs(estimate - truth) > SHORTCUT_ERROR * truth) continue;
    const stated = toCents(truth);
    return {
      targetTimeMs: TARGET_MS[3],
      prompt: `${p > 0 ? 'Rose' : 'Fell'} ${f(Math.abs(p))}% to ${f(after)}. Before?`,
      context: [],
      answer: { kind: 'numeric', value: stated, marking: TOLERANCE, unit: '' },
      solution: [`After = before × ${f(1 + r)}`, `Before = ${f(after)} ÷ ${f(1 + r)} ≈ ${f(stated)}`],
      shortcut:
        p > 0
          ? `Undo a ${f(p)}% rise by taking ${f(p)}% off, then adding back ${f(p)}% of what came off: ${f(after)} − ${f(off)} + ${f(back)} ≈ ${f(estimate)}`
          : `Undo a ${f(-p)}% fall by adding ${f(-p)}%, then ${f(-p)}% of what was added: ${f(after)} + ${f(off)} + ${f(back)} ≈ ${f(estimate)}`,
    };
  }
}
