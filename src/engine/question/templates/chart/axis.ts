import type { ChartBlock } from '../../types';

/** Gridline steps that read easily: 1, 2, 2.5 and 5 times a power of ten. */
const NICE = [1, 2, 2.5, 5];

/**
 * A value axis with round gridlines covering [low, high]: from zero for bars
 * (low 0), or from a round value below the data for lines. Between 3 and 6 gaps.
 */
export function niceAxis(low: number, high: number, maxGaps = 6): NonNullable<ChartBlock['axis']> {
  const span = high - low;
  for (let power = Math.floor(Math.log10(span / maxGaps)) - 1; ; power++) {
    for (const nice of NICE) {
      const step = clean(nice * 10 ** power);
      const min = clean(Math.floor(low / step + 1e-9) * step);
      const max = clean(Math.ceil(high / step - 1e-9) * step);
      const gaps = Math.round((max - min) / step);
      if (gaps <= maxGaps && gaps >= 3) return { min, max, step };
      if (gaps < 3) return { min, max: clean(min + 3 * step), step };
    }
  }
}

/** Strips floating-point dust: 0.30000000000000004 -> 0.3. */
export function clean(value: number): number {
  return Number(value.toPrecision(12));
}
