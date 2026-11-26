import { formatFixed } from '../../format';
import type { Random } from '../../random';
import { randomInt } from '../../random';
import type { ChartBlock } from '../../types';
import { clean } from './axis';

/** Consecutive year labels ending somewhere recent: ['2019', '2020', ...]. */
export function years(random: Random, count: number): string[] {
  const last = randomInt(random, 2021, 2025);
  return Array.from({ length: count }, (_, i) => String(last - count + 1 + i));
}

/** A value rounded to a multiple of step, without floating-point dust. */
export function snap(value: number, step: number): number {
  return clean(Math.round(value / step) * step);
}

/** A value as printed on a chart or in its notes: grouped, at the chart's decimals. */
export function printed(value: number, decimals: number): string {
  return formatFixed(value, decimals);
}

/** An option with a prefix and suffix, at the decimals the option grid asks for: $12.5m, 48%. */
export function unitOption(prefix: string, suffix: string) {
  return (value: number, decimals: number) => `${prefix}${formatFixed(value, decimals)}${suffix}`;
}

/** Every value a chart draws. */
export function chartedValues(...charts: ChartBlock[]): number[] {
  return charts.flatMap((c) => c.series.flatMap((s) => s.values));
}

/**
 * True when an answer is too close to a value the chart already shows, so the
 * question would reward matching a number rather than calculating.
 */
export function looksCharted(truth: number, ...charts: ChartBlock[]): boolean {
  return chartedValues(...charts).some((v) => Math.abs(v - truth) <= Math.abs(truth) * 0.015);
}

/**
 * Builds until the draw is acceptable. Each attempt continues the same random
 * stream, so a seed still reproduces the question.
 */
export function until<T>(build: () => T | null): T {
  for (let attempt = 0; attempt < 500; attempt++) {
    const built = build();
    if (built !== null) return built;
  }
  throw new Error('No acceptable draw in 500 attempts');
}
