// What a careful reader can take from a chart whose values are not printed (`labelled: false`).
// Shared by the candidate blind-solve export (export-candidates.mjs) and the candidate evals
// (gridline parity, the real-or-generated judge's input), so all three read a chart the same way.
//
// The reading rule is the one evals/judges/ambiguity.md states: a value on a gridline, or exactly
// halfway between two, is read exactly; any other value is placed to within about a quarter of a
// gridline step. So a reading is the value rounded to the nearest quarter of a gridline step,
// counted from the axis minimum: exact on a gridline or a midpoint, otherwise off by at most an
// eighth of a step, which is inside what a careful reader achieves.
//
// What is read is what the eye reads, not the stored number: the top of a bar or a point; for a
// stacked bar the edges between segments (a segment is the difference of two readings); for a
// 100% stack the edges as cumulative shares; for a waterfall the levels each bar starts and ends at.

/** Decimal places that show a multiple of `q` without float noise. */
function placesFor(q) {
  for (let d = 0; d <= 8; d++) if (Math.abs(q * 10 ** d - Math.round(q * 10 ** d)) < 1e-9) return d;
  return 8;
}

const tidy = (v, q) => Number(v.toFixed(Math.min(8, placesFor(q) + 1)));

/** A value read off an axis: rounded to the nearest quarter of a gridline step. */
export function readValue(value, axis) {
  const q = axis.step / 4;
  return tidy(axis.min + Math.round((value - axis.min) / q) * q, q);
}

/** Whether a value lies on a gridline of the axis. */
export function onGridline(value, axis) {
  const steps = (value - axis.min) / axis.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Per category of a stack: the cumulative edges a reader reads (positive parts stack up from 0, negative down), excluding the base. */
function stackEdges(values) {
  let up = 0;
  let down = 0;
  return values.map((v) => (v >= 0 ? (up += v) : (down += v)));
}

/** A waterfall's levels: for each bar, the level it ends at (totals stand on zero at their level). */
function waterfallLevels(chart) {
  const values = chart.series[0]?.values ?? [];
  const totals = new Set(chart.totals ?? [0]);
  let level = 0;
  return values.map((v, i) => (level = totals.has(i) ? v : level + v));
}

/** 100% stack shares: values as shares of their category's total (unchanged when they already add to 100). */
function shares(chart, i) {
  const column = chart.series.map((s) => s.values[i] ?? 0);
  const total = sum(column);
  return column.map((v) => (total === 0 ? 0 : (v / total) * 100));
}

/**
 * The positions a reader reads off gridlines, each with its axis: what the gridline parity
 * measure counts. Empty for a labelled chart, a pie, or a chart without an axis.
 */
export function readingPositions(chart) {
  if (chart.labelled || !chart.axis) return [];
  const left = chart.axis;
  const right = chart.axisRight ?? left;
  const positions = [];
  const n = chart.categories.length;
  switch (chart.chart) {
    case 'stacked-bar':
      for (let i = 0; i < n; i++) for (const e of stackEdges(chart.series.map((s) => s.values[i] ?? 0))) positions.push({ value: e, axis: left });
      break;
    case 'stacked-bar-100':
      // The top edge is always 100: it needs no reading.
      for (let i = 0; i < n; i++) for (const e of stackEdges(shares(chart, i)).slice(0, -1)) positions.push({ value: e, axis: left });
      break;
    case 'waterfall':
      for (const level of waterfallLevels(chart)) positions.push({ value: level, axis: left });
      break;
    default:
      for (const s of chart.series) for (const v of s.values) positions.push({ value: v, axis: s.axis === 'right' ? right : left });
      if (chart.chart === 'scatter' && chart.xAxis && chart.x) for (const v of chart.x) positions.push({ value: v, axis: chart.xAxis });
  }
  return positions;
}

/**
 * The chart as a careful reader sees it: the same block with every value replaced by its reading
 * (segments and steps rebuilt from the readings of their edges). A labelled chart, a pie or a chart
 * without an axis comes back unchanged.
 */
export function readChart(chart) {
  if (chart.labelled || !chart.axis) return chart;
  const left = chart.axis;
  const right = chart.axisRight ?? left;
  const n = chart.categories.length;
  const read = (v, axis) => readValue(v, axis);
  const q = left.step / 4;
  let series;
  switch (chart.chart) {
    case 'stacked-bar': {
      const columns = Array.from({ length: n }, (_, i) => {
        const values = chart.series.map((s) => s.values[i] ?? 0);
        let up = 0;
        let down = 0;
        return values.map((v) => {
          if (v >= 0) {
            const before = read(up, left);
            up += v;
            return tidy(read(up, left) - before, q);
          }
          const before = read(down, left);
          down += v;
          return tidy(read(down, left) - before, q);
        });
      });
      series = chart.series.map((s, k) => ({ ...s, values: columns.map((c) => c[k]) }));
      break;
    }
    case 'stacked-bar-100': {
      const columns = Array.from({ length: n }, (_, i) => {
        const edges = stackEdges(shares(chart, i)).map((e, k, all) => (k === all.length - 1 ? 100 : read(e, left)));
        return edges.map((e, k) => tidy(e - (k === 0 ? 0 : edges[k - 1]), q));
      });
      series = chart.series.map((s, k) => ({ ...s, values: columns.map((c) => c[k]) }));
      break;
    }
    case 'waterfall': {
      const totals = new Set(chart.totals ?? [0]);
      const levels = waterfallLevels(chart).map((l) => read(l, left));
      const values = levels.map((l, i) => (totals.has(i) ? l : tidy(l - (i === 0 ? 0 : levels[i - 1]), q)));
      series = [{ ...chart.series[0], values }, ...chart.series.slice(1)];
      break;
    }
    default:
      series = chart.series.map((s) => ({ ...s, values: s.values.map((v) => read(v, s.axis === 'right' ? right : left)) }));
  }
  const x = chart.chart === 'scatter' && chart.xAxis && chart.x ? { x: chart.x.map((v) => read(v, chart.xAxis)) } : {};
  return { ...chart, series, ...x };
}

/** One line telling a solver how the values of an unlabelled chart were read, with its gridlines. */
export function readingsNote(chart) {
  const fmt = (v) => v.toLocaleString('en-GB', { maximumFractionDigits: 6 });
  const axisText = (a) => `gridlines every ${fmt(a.step)} from ${fmt(a.min)} to ${fmt(a.max)}`;
  const axes = [`left axis ${axisText(chart.axis)}`];
  if (chart.axisRight) axes.push(`right axis ${axisText(chart.axisRight)}`);
  if (chart.chart === 'scatter' && chart.xAxis) axes.push(`horizontal axis ${axisText(chart.xAxis)}`);
  return (
    `Values are not printed on this chart. The values given are readings off the gridlines (${axes.join('; ')}), ` +
    'to the nearest quarter of a gridline step: a value on a gridline or exactly halfway between two is exact, ' +
    'any other may be off by up to an eighth of a step.'
  );
}
