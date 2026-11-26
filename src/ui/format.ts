import type { DrillSkill, Marking, Skill } from '../engine/question';

import { formatNumber as formatNumberRaw } from '../engine/question';

export { formatNumber } from '../engine/question';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An ISO timestamp as "25 Nov, 08:05" in the owner's time. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The month of a local day ("2026-11-01"), as "Nov 26". */
export function formatMonth(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(2, 4)}`;
}

/** A local day ("2026-11-25") or an ISO timestamp, as "25 Nov" on the owner's calendar. */
export function formatDay(date: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) : new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** A figure as the owner reads it: grouped, with a true minus sign (−), the same one prompts use. */
export function formatFigure(value: number): string {
  return formatNumberRaw(value).replace('-', '−');
}

/** 28.4s, or 1:05 past a minute. */
export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const SKILL_NAMES: Record<Skill, string> = {
  addition: 'Addition',
  subtraction: 'Subtraction',
  multiplication: 'Multiplication',
  division: 'Division',
  percentages: 'Percentages',
  'large-numbers': 'Large numbers',
  'compound-growth': 'Compound growth',
  'fraction-conversions': 'Fractions and percents',
  'percentage-change': 'Percentage change',
  'weighted-average': 'Weighted average',
  'break-even-payback': 'Break-even & payback',
  'percentages-in-context': 'Percentages in context',
  'growth-trends': 'Growth & trends',
  'unit-economics': 'Unit economics',
  'ratios-comparisons': 'Ratios & comparisons',
  'averages-mixes': 'Averages & mixes',
  'building-formulas': 'Building formulas',
  'testing-statements': 'Testing statements',
  'expected-value': 'Expected value',
  'bar-charts': 'Bar charts',
  'stacked-bar-charts': 'Stacked bars',
  'line-charts': 'Line charts',
  'pie-charts': 'Pie charts',
  'cumulative-charts': 'Cumulative charts',
  'waterfall-charts': 'Waterfalls',
};

/** The operator each drill skill is about, for compact pickers. */
export const SKILL_SIGNS: Record<DrillSkill, string> = {
  addition: '+',
  subtraction: '−',
  multiplication: '×',
  division: '÷',
  percentages: '%',
  'large-numbers': 'bn',
  'compound-growth': 'xⁿ',
  'fraction-conversions': '⅜',
  'percentage-change': 'Δ%',
  'weighted-average': 'avg',
};

/**
 * What the owner is told before answering: "exact answer" or "estimate within 3%".
 * When the answer is itself a percentage the band is 3% of that figure, not 3 points, so the label says so.
 */
export function markingLabel(marking: Marking, unit = ''): string {
  if (marking.mode === 'exact') return 'exact answer';
  return unit === '%' ? `estimate within ${marking.percent}% of the answer` : `estimate within ${marking.percent}%`;
}

/** The line under the exact value after a tolerance-marked answer. */
export function toleranceNote(percent: number, unit = ''): string {
  return unit === '%'
    ? `Exact value shown. Anything within ${percent}% of that figure counted (not ${percent} points either side).`
    : `Exact value shown. Anything within ${percent}% counted.`;
}

/** Shorter form for the session picker: "exact" or "within 3%". */
export function markingShort(marking: Marking): string {
  return marking.mode === 'exact' ? 'exact' : `within ${marking.percent}%`;
}
