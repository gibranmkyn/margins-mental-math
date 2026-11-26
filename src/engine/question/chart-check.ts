import type { ChartAxis, ChartBlock } from './types';

/**
 * Whether a chart description is sound enough to draw and read: a value for every
 * category, values on the axes, shares adding up, and the optional fields only on
 * the chart kinds that use them. The booklet content tests hold every redrawn
 * exhibit to it; the candidate evals hold every chart a candidate draws to it.
 * Returns the problems found, empty when the chart is sound.
 */

const BAR_KINDS = ['bar', 'stacked-bar', 'stacked-bar-100', 'cumulative'];
const LINE_KINDS = ['line', 'indexed-line'];
const near = (a: number, b: number, within = 1e-6) => Math.abs(a - b) <= within;

/** The values a chart draws against its value axis (stack ends, running totals, points). */
export function plotted(c: ChartBlock): number[] {
  const n = c.categories.length;
  const left = c.series.filter((s) => s.axis !== 'right');
  if (c.chart === 'stacked-bar' || c.chart === 'stacked-bar-100') {
    return Array.from({ length: n }, (_, k) => {
      const vs = left.map((s) => s.values[k]!);
      return [vs.filter((v) => v > 0).reduce((a, b) => a + b, 0), vs.filter((v) => v < 0).reduce((a, b) => a + b, 0)];
    }).flat();
  }
  if (c.chart === 'waterfall') {
    const totals = new Set(c.totals ?? [0]);
    let running = 0;
    return c.series[0]!.values.flatMap((v, k) => {
      const from = totals.has(k) ? 0 : running;
      running = totals.has(k) ? v : running + v;
      return [from, running];
    });
  }
  return left.flatMap((s) => s.values);
}

export function chartProblems(c: ChartBlock, what: string): string[] {
  const problems: string[] = [];
  const need = (condition: boolean, message: string) => {
    if (!condition) problems.push(`${what}: ${message}`);
  };

  /** Whether values sit on an axis's scale: within its range, and the range a whole number of steps. */
  const onAxis = (axis: ChartAxis | undefined, values: number[], which: string) => {
    if (!axis) return need(false, `${which} missing`);
    const { min, max, step } = axis;
    need(step > 0, `${which} step ${step}`);
    if (!(step > 0)) return;
    need(near((max - min) / step, Math.round((max - min) / step), 1e-6), `${which} range is not a whole number of steps`);
    for (const v of values) {
      need(v >= min - 1e-9, `${v} below the ${which}`);
      need(v <= max + 1e-9, `${v} above the ${which}`);
    }
  };

  const n = c.categories?.length ?? 0;
  need((c.title ?? '').trim().length > 0, 'no title');
  need((c.unit ?? '').trim().length > 0, 'no unit');
  need(n > 0, 'no categories');
  need((c.series?.length ?? 0) > 0, 'no series');
  // Four series at most (DESIGN.md, Charts).
  need((c.series?.length ?? 0) <= 4, `${c.series?.length} series, at most 4`);
  if (problems.length > 0) return problems;
  need(typeof c.labelled === 'boolean', 'labelled must be true or false');
  need(Number.isInteger(c.decimals) && c.decimals >= 0, `decimals ${c.decimals}`);
  for (const s of c.series) {
    need(s.values.length === n, `${s.name}: ${s.values.length} values for ${n} categories`);
    for (const v of s.values) need(typeof v === 'number' && Number.isFinite(v), `${s.name}: ${v} is not a number`);
    if (s.axis === 'right') need(LINE_KINDS.includes(c.chart), 'a right-hand series belongs on a line chart');
  }
  if (problems.length > 0) return problems;
  if (c.highlight !== undefined)
    need(c.highlight < (c.chart === 'pie' || c.chart === 'waterfall' || c.chart === 'scatter' ? n : c.series.length), `highlight ${c.highlight} out of range`);
  if (c.barNotes) need(c.barNotes.length === n, 'one bar note per category');
  for (const row of c.barNoteRows ?? []) need(row.notes.length === n, `${row.name}: one note per category`);
  if (c.barNotes || c.barNoteRows || c.horizontal) need(BAR_KINDS.includes(c.chart), 'bar notes and horizontal bars belong on bar charts');
  if (c.groups) {
    need(BAR_KINDS.includes(c.chart), 'groups belong on bar charts');
    need(c.groups.reduce((sum, g) => sum + g.count, 0) === n, 'group counts must add up to the categories');
  }
  if (c.chart === 'pie') {
    need(c.series.length === 1, 'a pie has one series');
    for (const v of c.series[0]!.values) need(v > 0, `pie slice ${v} must be positive`);
    if (c.suffix === '%') need(near(c.series[0]!.values.reduce((a, b) => a + b, 0), 100, 0.5), 'pie shares must add to 100');
    return problems;
  }
  onAxis(c.axis, plotted(c), 'axis');
  if (c.chart === 'stacked-bar-100') {
    // Shares add to 100; amounts (drawn as shares of their bar) need only be positive.
    for (let k = 0; k < n; k++) {
      const total = c.series.reduce((sum, s) => sum + s.values[k]!, 0);
      if (c.suffix === '%') need(near(total, 100, 0.5), `${c.categories[k]} adds to ${total}, not 100`);
      need(total > 0, `${c.categories[k]} has no total`);
      for (const s of c.series) need(s.values[k]! >= 0, `${c.categories[k]}: a 100% stack has no negative parts`);
    }
  }
  if (c.chart === 'cumulative') {
    const vs = c.series[0]!.values;
    for (let k = 1; k < n; k++) need(vs[k]! >= vs[k - 1]!, 'a running total never falls');
  }
  if (c.chart === 'waterfall') need(c.series.length === 1, 'a waterfall has one series');
  const right = c.series.filter((s) => s.axis === 'right');
  if (right.length > 0) onAxis(c.axisRight, right.flatMap((s) => s.values), 'right axis');
  else need(c.axisRight === undefined, 'a right axis with no series on it');
  if (c.chart === 'scatter') {
    need(c.series.length === 1, 'a scatter has one series');
    need(c.x?.length === n, 'a scatter needs one x per point');
    need((c.xUnit ?? '').trim().length > 0, 'a scatter needs an xUnit');
    onAxis(c.xAxis, c.x ?? [], 'x axis');
    for (const r of c.references ?? []) onAxis(r.axis === 'x' ? c.xAxis : c.axis, [r.value], 'reference line');
  } else {
    for (const field of ['x', 'xAxis', 'xUnit', 'join', 'references'] as const) need(c[field] === undefined, `${field} is for scatters`);
  }
  return problems;
}
