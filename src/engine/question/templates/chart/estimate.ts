import type { Random } from '../../random';
import type { ChartBlock } from '../../types';
import type { GridOptions, OptionStyle } from '../scenario/options';
import { optionGrid } from '../scenario/options';

/**
 * The reading error options must absorb on an estimated chart: just over a
 * fifth of the gap between gridlines either way, a little wider than a
 * careful reader needs so a misreading never lands between two options.
 */
export const READING_ERROR = 0.22;

/**
 * The lowest and highest answers a reader could reach from a chart read
 * within the reading error. Bars, lines and cumulative bars are read at each
 * value; stacked bars at each segment boundary; waterfall bars at the running
 * total each one ends on. Each reading is pushed the way that moves the
 * answer furthest, which bounds answers built from sums and ratios.
 */
export function readingBand(chart: ChartBlock, answer: (chart: ChartBlock) => number): [number, number] {
  const error = (chart.axis?.step ?? 0) * READING_ERROR;
  const stacked = chart.chart === 'stacked-bar' || chart.chart === 'stacked-bar-100';
  const readings = chart.series.flatMap((s, si) => s.values.map((_, k) => [si, k] as const));

  const shifted = (shift: (si: number, k: number) => number): ChartBlock => ({
    ...chart,
    series: chart.series.map((s, si) => ({
      ...s,
      values: s.values.map((v, k) => {
        if (stacked) return v + shift(si, k) - (si > 0 ? shift(si - 1, k) : 0);
        // A waterfall step spans the running totals either side of it; a total is read at its end.
        if (chart.chart === 'waterfall') return v + shift(si, k) - (chart.totals?.includes(k) ? 0 : shift(si, k - 1));
        return v + shift(si, k);
      }),
    })),
  });

  const truth = answer(chart);
  const push = new Map(
    readings.map(([si, k]) => {
      const moved = answer(shifted((a, b) => (a === si && b === k ? error : 0)));
      return [`${si}:${k}`, Math.sign(moved - truth) || 1];
    }),
  );
  const worst = (direction: number) => answer(shifted((si, k) => direction * push.get(`${si}:${k}`)! * error));
  const ends = [truth, worst(1), worst(-1)];
  return [Math.min(...ends), Math.max(...ends)];
}

export type EstimateOptions = GridOptions;

/**
 * How far a misreading may move the answer, as a share of it, for options to
 * stay plausible neighbours: four options spaced to absorb a wider error would
 * sit half the answer apart, and the correct one could not sit lowest.
 */
export const WIDEST_READING = 0.08;

/** True when a chart can be read closely enough for the question it asks. */
export function readable(truth: number, band: [number, number]): boolean {
  return Math.max(band[1] - truth, truth - band[0]) <= WIDEST_READING * truth;
}

/**
 * Four ascending options for an answer read off a chart: spaced just far
 * enough apart that any answer in the reading band is still closest to the
 * correct option, and rounded no finer than that spacing makes meaningful.
 */
export function estimateOptions(truth: number, band: [number, number], random: Random, style: OptionStyle): EstimateOptions {
  return optionGrid(truth, band, random, style, true);
}
