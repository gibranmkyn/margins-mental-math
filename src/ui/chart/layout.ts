import type { ChartBlock } from '../../engine/question';

/**
 * Chart layout: turns a chart description and the width available into marks
 * in CSS pixels (the drawing is shown at 1:1, so text is the size it says).
 * No DOM here; Chart.tsx draws the marks.
 */

/** How a series is filled or stroked. Never colour alone: tone steps, hatching, dashes and marker shapes differ too. */
/** `accent-hatch` is the asked-about waterfall bar when it is a decrease: the accent, still hatched. */
export type Paint = 'accent' | 'accent-hatch' | 'light' | 'mid' | 'dark' | 'hatch';
export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';
export type Dash = 'solid' | 'dash' | 'dot' | 'dashdot';

export type Mark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; paint: Paint }
  | {
      kind: 'rule';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      /** `connector` joins a cumulative or waterfall bar to the next one at the level they share. */
      tone: 'grid' | 'grid-strong' | 'base' | 'knock' | 'leader' | 'reference' | 'connector';
    }
  | { kind: 'line'; points: [number, number][]; paint: Paint; dash: Dash; bold: boolean }
  | { kind: 'marker'; x: number; y: number; shape: MarkerShape; paint: Paint }
  | { kind: 'slice'; d: string; paint: Paint }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      anchor: 'start' | 'middle' | 'end';
      size: number;
      tone: 'text' | 'muted' | 'on-light' | 'on-dark' | 'on-accent' | 'halo';
      weight: 'normal' | 'bold';
    };

export interface LegendItem {
  name: string;
  paint: Paint;
  /** Lines show their dash and marker; bars and segments their fill. */
  dash?: Dash;
  shape?: MarkerShape;
}

export interface Drawing {
  width: number;
  height: number;
  marks: Mark[];
  legend: LegendItem[];
}

/** JetBrains Mono advances 0.6em per character; every chart label is set in it. */
const ADVANCE = 0.6;
const TICK = 12;
const VALUE = 12;

export function textWidth(text: string, size: number): number {
  return text.length * size * ADVANCE;
}

/** Paints in series order: the asked-about series takes the accent; the rest step through tones, never light beside the accent. */
export function seriesPaints(block: ChartBlock): Paint[] {
  const count = block.chart === 'pie' ? block.categories.length : block.series.length;
  const highlight = block.highlight;
  const rest: Paint[] = highlight === undefined ? ['light', 'mid', 'dark', 'hatch'] : ['mid', 'dark', 'hatch', 'mid', 'dark'];
  if (block.chart === 'pie') {
    // Slices alternate two greys so neighbours always differ; the accent marks the asked-about slice.
    // With an odd number of slices the last would match the first across the top, so it takes the light tone.
    const wraps = count % 2 === 1 && count > 2 && highlight !== 0 && highlight !== count - 1;
    return Array.from({ length: count }, (_, i) =>
      i === highlight ? 'accent' : wraps && i === count - 1 ? 'light' : (['mid', 'dark'] as const)[i % 2]!,
    );
  }
  // Thin lines need more contrast than filled areas, so lines skip the dark tone.
  const others: Paint[] = isLineChart(block) ? (highlight === undefined ? ['light', 'mid', 'hatch'] : ['mid', 'light', 'hatch']) : rest;
  let next = 0;
  return Array.from({ length: count }, (_, i) => (i === highlight ? 'accent' : others[next++ % others.length]!));
}

function isLineChart(block: ChartBlock): boolean {
  return block.chart === 'line' || block.chart === 'indexed-line';
}

const DASHES: Dash[] = ['solid', 'dash', 'dot', 'dashdot'];
const SHAPES: MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];

/** Tick or value text: grouped, at the chart's decimals, with its prefix and suffix. */
export function formatValue(block: ChartBlock, value: number): string {
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: block.decimals,
    maximumFractionDigits: block.decimals,
  }).format(value);
  return `${block.prefix ?? ''}${text}${block.suffix ?? ''}`.replace('-', '−');
}

function formatTick(block: ChartBlock, value: number): string {
  // A 100% stacked bar's axis is always shares, whatever its values measure.
  if (block.chart === 'stacked-bar-100') return tickText(block.axis?.step ?? 1, value, '', '%');
  return tickText(block.axis?.step ?? 1, value, block.prefix, block.suffix);
}

/**
 * The length a segment is drawn at. A 100% stacked bar draws each segment as its
 * share of the bar's total, so its values may be shares or amounts (printed as given).
 */
function drawnValue(block: ChartBlock, si: number, k: number): number {
  const v = block.series[si]!.values[k]!;
  if (block.chart !== 'stacked-bar-100') return v;
  const total = block.series.reduce((sum, s) => sum + s.values[k]!, 0);
  return total === 0 ? 0 : (v / total) * 100;
}

/** An axis label at as many decimals as its step needs. */
function tickText(step: number, value: number, prefix = '', suffix = ''): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9), Number.isInteger(step * 2) && !Number.isInteger(step) ? 1 : 0);
  const text = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
  return `${prefix}${text}${suffix}`.replace('-', '−');
}

function ticksOf(axis: { min: number; max: number; step: number }): number[] {
  const ticks: number[] = [];
  for (let v = axis.min; v <= axis.max + axis.step / 1e6; v += axis.step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** How much wider than its frame a chart may be drawn so that every label keeps MIN_TEXT; it then scrolls sideways inside its figure. */
const MAX_WIDEN = 2.4;

/**
 * Draws a chart for a frame `width` wide. If a label would not fit at MIN_TEXT the chart is drawn wider
 * (the drawing's width then exceeds the frame, and the Chart part scrolls it sideways) rather than with smaller text.
 */
export function drawChart(block: ChartBlock, width: number): Drawing {
  const frame = Math.max(240, Math.floor(width));
  for (let w = frame; ; w = Math.ceil(w * 1.1)) {
    cramped = false;
    const drawing = drawAt(block, w);
    if (!cramped || w >= frame * MAX_WIDEN) return drawing;
  }
}

function drawAt(block: ChartBlock, width: number): Drawing {
  const w = Math.max(240, Math.floor(width));
  if (block.chart === 'pie') return drawPie(block, w);
  if (block.chart === 'waterfall') return drawWaterfall(block, w);
  if (block.chart === 'scatter') return drawScatter(block, w);
  if (block.horizontal) return drawHorizontalBars(block, w);
  return drawAxes(block, w);
}

/** Bars painted by group: each run of categories in its own tone, so the groups read apart without colour alone. */
function groupPaints(block: ChartBlock): Paint[] | undefined {
  if (!block.groups) return undefined;
  const tones: Paint[] = ['light', 'mid', 'dark', 'hatch'];
  return block.groups.flatMap((g, i) => Array.from({ length: g.count }, () => tones[i % tones.length]!));
}

// ---------- Bars, stacks and lines: a value axis up the left, categories along the bottom ----------

/** Category labels split onto two lines at a space when one line is too wide for its slot. */
function categoryLines(label: string, slot: number, size: number): string[] {
  if (textWidth(label, size) <= slot - 4 || !label.includes(' ')) return [label];
  const words = label.split(' ');
  let best: [string, string] = [label, ''];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const widest = Math.max(a.length, b.length);
    if (widest < bestWidth) {
      bestWidth = widest;
      best = [a, b];
    }
  }
  return best;
}

/** A long name wrapped to fit a width: split in two where that fits, otherwise a line per run of words that fits. */
function wrapLines(label: string, room: number, size: number): string[] {
  if (textWidth(label, size) <= room) return [label];
  const two = categoryLines(label, 0, size);
  if (Math.max(...two.map((l) => textWidth(l, size))) <= room) return two;
  const lines: string[] = [];
  for (const word of label.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && textWidth(`${last} ${word}`, size) <= room) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

function drawAxes(block: ChartBlock, width: number): Drawing {
  const axis = block.axis ?? { min: 0, max: 1, step: 1 };
  const isLine = isLineChart(block);
  const stacked = block.chart === 'stacked-bar' || block.chart === 'stacked-bar-100';
  const paints = seriesPaints(block);
  const n = block.categories.length;
  const marks: Mark[] = [];

  const ticks = ticksOf(axis);
  const tickWidth = Math.max(...ticks.map((t) => textWidth(formatTick(block, t), TICK)));
  const left = Math.ceil(tickWidth) + 8;

  // A second value axis on the right, for line series marked `axis: 'right'`.
  const axisRight = isLine ? block.axisRight : undefined;
  const ticksRight = axisRight ? ticksOf(axisRight) : [];
  const rightTick = (t: number) => tickText(axisRight!.step, t, axisRight!.prefix, axisRight!.suffix);
  const rightRoom = axisRight ? Math.ceil(Math.max(...ticksRight.map((t) => textWidth(rightTick(t), TICK)))) + 8 : 0;

  // Lines are named at their right-hand ends when that leaves each point room for its value; otherwise a key names them.
  const nameSize = 12;
  const endRoom = Math.ceil(Math.max(...block.series.map((s) => textWidth(s.name, nameSize)))) + 14;
  const widestValue = block.labelled ? Math.max(...block.series.flatMap((s) => s.values.map((v) => textWidth(formatValue(block, v), VALUE)))) : 0;
  const endLabels = isLine && !axisRight && block.series.length > 1 && (width - left - endRoom) / n >= Math.max(30, widestValue + 6);
  const right = axisRight ? rightRoom : endLabels ? endRoom : isLine ? 14 : 2;
  const plotW = width - left - right;
  const slot = plotW / n;

  const catSize = TICK;
  // One word wider than two slots cannot be saved by stepping labels down a row: the chart needs more width.
  if (block.categories.some((c) => c.split(' ').some((word) => textWidth(word, TICK) > 2 * slot - 6))) cramped = true;
  const catLines = block.categories.map((c) => categoryLines(c, slot, catSize));
  // Labels too wide for their slots step every second one down a row, so none drop out; only a long run of
  // numbered labels (ranks) thins out to every second, third... category instead.
  const widestLine = Math.max(0, ...catLines.flatMap((l) => l.map((line) => textWidth(line, catSize))));
  const crowded = widestLine > slot - 2;
  const thin = crowded && n > 12 && block.categories.every((c) => /^[\d\s.,'–-]*$/.test(c));
  const catEvery = thin ? Math.ceil((widestLine + 4) / slot) : 1;
  const stagger = crowded && !thin ? 1 : 0;
  const catRows = Math.max(...catLines.map((l) => l.length)) + stagger;

  const notes = block.barNotes ?? [];
  const noteRows = block.barNoteRows ?? [];
  // Each named row above the plot: its name on one line, its figures over the bars on the next.
  const rowsH = noteRows.length * 2 * (VALUE + 5);
  // Side-by-side bars too narrow for their printed values lift every second series' values a line higher.
  const m = stacked ? 1 : block.series.length;
  const barSlot = (Math.min(slot * (m > 1 ? 0.84 : 0.64), m > 1 ? 30 * m : 64) + 2) / m;
  const liftValues = !isLine && block.labelled && m > 1 && block.series.some((s) => s.values.some((v) => textWidth(formatValue(block, v), VALUE) > barSlot - 2));
  const valueRoom = block.labelled && !stacked ? (VALUE + 4) * (liftValues ? 2 : 1) : 0;
  const top = 10 + rowsH + (notes.length > 0 ? 18 : 0) + valueRoom;
  const plotH = Math.round(Math.min(210, Math.max(160, width * 0.52)));
  // Values printed under the lowest line need room above the category labels.
  const under = isLine && block.labelled ? VALUE + 8 : 0;
  const groupRows = block.groups ? 2 * TICK : 0;
  const bottom = 8 + under + catRows * (catSize + 3) + groupRows;
  const height = top + plotH + bottom;
  const y = (v: number) => top + plotH - ((v - axis.min) / (axis.max - axis.min)) * plotH;
  const yRight = axisRight ? (v: number) => top + plotH - ((v - axisRight.min) / (axisRight.max - axisRight.min)) * plotH : y;
  const xMid = (k: number) => left + slot * (k + 0.5);

  // Named rows of figures above the plot.
  noteRows.forEach((row, r) => {
    const nameY = 10 + r * 2 * (VALUE + 5) + VALUE;
    marks.push({ kind: 'text', x: 0, y: nameY, text: row.name, anchor: 'start', size: VALUE, tone: 'muted', weight: 'normal' });
    row.notes.forEach((note, k) => {
      marks.push({ kind: 'text', x: xMid(k), y: nameY + VALUE + 5, text: note, anchor: 'middle', size: fitSize(note, slot - 2, VALUE), tone: 'text', weight: 'bold' });
    });
  });

  // The right-hand axis: its labels and a short tick at each, aligned with the plot's right edge.
  const rightEvery = Math.max(1, Math.ceil((TICK + 3) / (plotH / Math.max(1, ticksRight.length - 1))));
  for (const [i, t] of ticksRight.entries()) {
    if (i % rightEvery !== 0) continue;
    const ty = yRight(t);
    marks.push({ kind: 'rule', x1: width - right, y1: ty, x2: width - right + 4, y2: ty, tone: 'base' });
    marks.push({ kind: 'text', x: width - right + 7, y: ty + 4, text: rightTick(t), anchor: 'start', size: TICK, tone: 'muted', weight: 'normal' });
  }
  // Gridlines and their labels: every gridline, labelled every second or third where labels would touch.
  // Estimated charts get stronger gridlines.
  const labelEvery = Math.max(1, Math.ceil((TICK + 3) / (plotH / Math.max(1, ticks.length - 1))));
  ticks.forEach((t, i) => {
    // Zero is the base line, wherever it falls on the axis.
    const tone = t === 0 ? 'base' : block.chart === 'indexed-line' && t === 100 ? 'reference' : block.labelled ? 'grid' : 'grid-strong';
    marks.push({ kind: 'rule', x1: left, y1: y(t), x2: width - right, y2: y(t), tone });
    if (i % labelEvery === 0) marks.push({ kind: 'text', x: left - 8, y: y(t) + 4, text: formatTick(block, t), anchor: 'end', size: TICK, tone: 'muted', weight: 'normal' });
  });
  if (block.chart === 'indexed-line' && !ticks.includes(100) && axis.min < 100 && axis.max > 100) {
    marks.push({ kind: 'rule', x1: left, y1: y(100), x2: width - right, y2: y(100), tone: 'reference' });
  }

  // Category labels.
  catLines.forEach((lines, k) => {
    if (k % catEvery !== 0) return;
    lines.forEach((line, row) => {
      marks.push({
        kind: 'text',
        x: xMid(k),
        y: top + plotH + under + 6 + catSize + (row + (k % 2) * stagger) * (catSize + 3),
        text: line,
        anchor: 'middle',
        size: catSize,
        tone: 'muted',
        weight: 'normal',
      });
    });
  });

  const legend: LegendItem[] = [];

  if (isLine) {
    const keyed = drawLines(block, { marks, paints, xMid, y, yRight, plotTop: top, plotBottom: top + plotH, endX: width - right, nameSize, endLabels });
    legend.push(...keyed);
  } else {
    const barW = drawBars(block, { marks, paints: groupPaints(block) ?? paints, byCategory: !!block.groups, xMid, y, slot, stacked, liftValues });
    if (block.groups) {
      // Each group named under its run of bars, with a rule spanning the run.
      let start = 0;
      const gy = top + plotH + 8 + catRows * (catSize + 3);
      block.groups.forEach((g, i) => {
        const x1 = xMid(start) - slot / 2 + 2;
        const x2 = xMid(start + g.count - 1) + slot / 2 - 2;
        marks.push({ kind: 'rule', x1, y1: gy, x2, y2: gy, tone: 'base' });
        marks.push({ kind: 'text', x: (x1 + x2) / 2, y: gy + TICK + 3, text: g.name, anchor: 'middle', size: fitSize(g.name, x2 - x1, TICK), tone: 'text', weight: 'bold' });
        legend.push({ name: g.name, paint: (['light', 'mid', 'dark', 'hatch'] as const)[i % 4]! });
        start += g.count;
      });
    }
    if (block.chart === 'cumulative') {
      // Each bar's top carries on to the next bar, so the step between them (one group's own share) shows as a rise.
      const values = block.series[0]!.values;
      values.slice(0, -1).forEach((v, k) => {
        marks.push({ kind: 'rule', x1: xMid(k) + barW / 2, y1: y(v), x2: xMid(k + 1) - barW / 2, y2: y(v), tone: 'connector' });
      });
    }
    if (block.series.length > 1) {
      const order = block.series.map((s, i) => ({ name: s.name, paint: paints[i]! }));
      // A stack's key reads top to bottom like the stack itself: parts above zero from the top, then those stacked below it.
      const below = (i: number) => block.series[i]!.values.every((v) => v <= 0);
      const up = order.filter((_, i) => !below(i)).reverse();
      const down = order.filter((_, i) => below(i));
      legend.push(...(stacked ? [...up, ...down] : order));
    }
    // Notes above the bars, e.g. totals or market size; above the printed values where bars carry them.
    notes.forEach((note, k) => {
      const tops = stacked ? block.series.reduce((sum, _, si) => sum + Math.max(0, drawnValue(block, si, k)), 0) : Math.max(...block.series.map((s) => s.values[k]!));
      marks.push({
        kind: 'text',
        x: xMid(k),
        y: Math.min(y(tops), y(axis.max)) - 6 - valueRoom,
        text: note,
        anchor: 'middle',
        size: fitSize(note, slot - 2, 12),
        tone: 'text',
        weight: 'bold',
      });
    });
  }

  return { width, height, marks, legend };
}

/** The smallest size any chart text is drawn at. A label that cannot fit at this size makes the chart wider, never the text smaller. */
export const MIN_TEXT = 12;

/** Set while drawing when a label does not fit at MIN_TEXT; drawChart then draws again, wider. */
let cramped = false;

/** The largest size, down to MIN_TEXT, at which a label fits a width. Below that the drawing is marked cramped. */
function fitSize(text: string, room: number, size: number): number {
  let s = size;
  while (s > MIN_TEXT && textWidth(text, s) > room) s -= 0.5;
  if (textWidth(text, s) > room + 0.5) cramped = true;
  return s;
}

interface BarContext {
  marks: Mark[];
  /** One paint per series, or per category when `byCategory` (grouped bars). */
  paints: Paint[];
  byCategory: boolean;
  /** Every second series prints its values a line higher, so neighbours' values never run together. */
  liftValues?: boolean;
  xMid: (k: number) => number;
  y: (v: number) => number;
  slot: number;
  stacked: boolean;
}

/** Draws bars or stacks; returns the width of one bar. */
function drawBars(block: ChartBlock, c: BarContext): number {
  const { marks, xMid, y, slot, stacked } = c;
  const paintOf = (si: number, k: number) => (c.byCategory ? c.paints[k]! : c.paints[si]!);
  const m = stacked ? 1 : block.series.length;
  const groupW = Math.min(slot * (m > 1 ? 0.84 : 0.64), m > 1 ? 30 * m : 64);
  const gap = m > 1 ? 2 : 0;
  const barW = (groupW - gap * (m - 1)) / m;
  const base = y(block.axis?.min ?? 0);

  block.categories.forEach((_, k) => {
    const x0 = xMid(k) - groupW / 2;
    if (stacked) {
      // Positive segments stack up from zero, negative ones down from it.
      let up = 0;
      let down = 0;
      block.series.forEach((s, si) => {
        const v = drawnValue(block, si, k);
        const from = v < 0 ? down : up;
        const to = from + v;
        if (v < 0) down = to;
        else up = to;
        const y1 = y(Math.max(from, to));
        const y0 = y(Math.min(from, to));
        const h = Math.max(0, y0 - y1);
        // A hairline of page between neighbouring segments keeps them apart.
        const cut = from !== 0 ? 1.5 : 0;
        const paint = paintOf(si, k);
        marks.push({ kind: 'rect', x: x0, y: v < 0 ? y1 + cut : y1, w: barW, h: Math.max(0, h - cut), paint });
        // A part of nothing has no label; the rest print inside at full size, or beside the bar when too small.
        if (block.labelled && s.values[k] !== 0) {
          const text = formatValue(block, s.values[k]!);
          const size = VALUE;
          if (h >= size + 3 && textWidth(text, size) <= barW - 2) {
            marks.push({ kind: 'text', x: x0 + barW / 2, y: (y0 + y1) / 2 + size * 0.36, text, anchor: 'middle', size, tone: onPaint(paint), weight: 'bold' });
          } else {
            // Just right of the bar, level with its part but kept on that part's side of the zero line.
            const zero = y(0);
            const middle = (y0 + y1) / 2 + size * 0.36;
            const baseline = v < 0 ? Math.max(middle, zero + 2 + size * 0.8) : Math.min(middle, zero - 2 - size * 0.2);
            marks.push({ kind: 'text', x: x0 + barW + 3, y: baseline, text, anchor: 'start', size, tone: 'text', weight: 'bold' });
          }
        }
      });
    } else {
      block.series.forEach((s, si) => {
        const v = s.values[k]!;
        const x = x0 + si * (barW + gap);
        marks.push({ kind: 'rect', x, y: Math.min(y(v), base), w: barW, h: Math.abs(base - y(v)), paint: paintOf(si, k) });
        if (block.labelled) {
          const text = formatValue(block, v);
          const room = m > 1 ? barW + gap + 4 : slot - 4;
          const lift = c.liftValues && si % 2 === 1 ? VALUE + 4 : 0;
          const size = fitSize(text, c.liftValues ? 2 * barW + gap : room, VALUE);
          marks.push({ kind: 'text', x: x + barW / 2, y: y(v) - 5 - lift, text, anchor: 'middle', size, tone: 'text', weight: 'bold' });
        }
      });
    }
  });

  // On estimated bars, gridlines cut through the bars so a top can be judged against the nearest line.
  if (!block.labelled && block.axis) {
    for (let v = block.axis.min + block.axis.step; v < block.axis.max + 1e-9; v += block.axis.step) {
      block.categories.forEach((_, k) => {
        const x0 = xMid(k) - groupW / 2;
        block.series.forEach((s, si) => {
          const height = stacked ? block.series.reduce((sum, _, xi) => sum + drawnValue(block, xi, k), 0) : s.values[k]!;
          if (stacked && si > 0) return;
          if (v >= height - 1e-9) return;
          const x = stacked ? x0 : x0 + si * (barW + gap);
          marks.push({ kind: 'rule', x1: x, y1: y(v), x2: x + barW, y2: y(v), tone: 'knock' });
        });
      });
    }
  }
  return barW;
}

function onPaint(paint: Paint): Extract<Mark, { kind: 'text' }>['tone'] {
  return paint === 'accent' ? 'on-accent' : paint === 'dark' ? 'on-dark' : paint === 'hatch' ? 'halo' : 'on-light';
}

interface LineContext {
  marks: Mark[];
  paints: Paint[];
  xMid: (k: number) => number;
  y: (v: number) => number;
  /** The scale of series measured on the right-hand axis. */
  yRight: (v: number) => number;
  plotTop: number;
  plotBottom: number;
  endX: number;
  nameSize: number;
  endLabels: boolean;
}

/** Draws the lines, their markers and labels; returns the key entries when the lines are not named at their ends. */
function drawLines(block: ChartBlock, c: LineContext): LegendItem[] {
  const { marks, paints, xMid } = c;
  const yOf = (si: number) => (block.series[si]!.axis === 'right' ? c.yRight : c.y);
  // The asked-about line is solid with round markers; the others take the next dash and shape in turn.
  const highlight = block.highlight;
  const styleIndex = (si: number) => (highlight === undefined ? si : si === highlight ? 0 : si < highlight ? si + 1 : si);
  const lines = block.series.map((s, si) => ({
    s,
    si,
    paint: paints[si]!,
    dash: DASHES[styleIndex(si) % DASHES.length]!,
    shape: SHAPES[styleIndex(si) % SHAPES.length]!,
  }));
  // The asked-about line is drawn last, on top.
  const order = [...lines].sort((a, b) => Number(a.paint === 'accent') - Number(b.paint === 'accent'));
  for (const l of order) {
    const points = l.s.values.map((v, k) => [xMid(k), yOf(l.si)(v)] as [number, number]);
    marks.push({ kind: 'line', points, paint: l.paint, dash: l.dash, bold: l.paint === 'accent' });
  }
  for (const l of order) {
    l.s.values.forEach((v, k) => marks.push({ kind: 'marker', x: xMid(k), y: yOf(l.si)(v), shape: l.shape, paint: l.paint }));
  }

  if (block.labelled) {
    // Each value sits above its point if its line is the higher one there, otherwise below.
    block.categories.forEach((_, k) => {
      const at = lines.map((l) => ({ l, v: l.s.values[k]!, py: yOf(l.si)(l.s.values[k]!) })).sort((a, b) => a.py - b.py);
      at.forEach(({ l, v, py }, rank) => {
        const above = rank === 0;
        const text = formatValue(block, v);
        marks.push({
          kind: 'text',
          x: xMid(k),
          y: above ? py - 9 : py + 9 + VALUE * 0.8,
          text,
          anchor: 'middle',
          size: VALUE,
          tone: 'halo',
          weight: l.paint === 'accent' ? 'bold' : 'normal',
        });
      });
    });
  }

  if (block.series.length > 1 && !c.endLabels) {
    return lines.map((l) => ({ name: l.s.name, paint: l.paint, dash: l.dash, shape: l.shape }));
  }
  if (block.series.length > 1) {
    // Names at the right-hand end of each line, nudged apart so they never overlap.
    const ends = lines
      .map((l) => ({ l, want: yOf(l.si)(l.s.values.at(-1)!) }))
      .sort((a, b) => a.want - b.want);
    const gap = c.nameSize + 3;
    const placed = spread(
      ends.map((e) => e.want),
      gap,
      c.plotTop + c.nameSize / 2,
      c.plotBottom,
    );
    ends.forEach((e, i) => {
      marks.push({
        kind: 'text',
        x: c.endX + 8,
        y: placed[i]! + c.nameSize * 0.36,
        text: e.l.s.name,
        anchor: 'start',
        size: c.nameSize,
        tone: e.l.paint === 'accent' ? 'text' : 'muted',
        weight: e.l.paint === 'accent' ? 'bold' : 'normal',
      });
    });
  }
  return [];
}

/**
 * Positions sorted ascending, pushed apart to at least gap, kept within
 * [low, high]: first push down, then pull back up from the bottom.
 */
function spread(wants: number[], gap: number, low: number, high: number): number[] {
  const out = [...wants];
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i]!, low, i > 0 ? out[i - 1]! + gap : -Infinity);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i]!, high, i < out.length - 1 ? out[i + 1]! - gap : Infinity);
  return out;
}

// ---------- Waterfall: bars across, one row per category, so long names stay readable on a phone ----------

/**
 * A horizontal waterfall. Names run down the left; the value axis runs along
 * the bottom. Totals stand on zero; steps float from the running total, up
 * (rightwards) or down (leftwards), and a connector carries each bar's end to
 * the next row. Increases and decreases differ by fill and hatching as well as
 * by the sign on their value.
 */
function drawWaterfall(block: ChartBlock, width: number): Drawing {
  const axis = block.axis ?? { min: 0, max: 1, step: 1 };
  const values = block.series[0]!.values;
  const totals = new Set(block.totals ?? [0]);
  const marks: Mark[] = [];

  // Where each bar starts and ends along the value axis.
  let running = 0;
  const bars = values.map((v, k) => {
    const from = totals.has(k) ? 0 : running;
    running = totals.has(k) ? v : running + v;
    return { k, v, from, to: running, total: totals.has(k) };
  });
  // The asked-about bar takes the accent; a decrease keeps its hatching, so it still reads as one.
  const decrease = (b: (typeof bars)[number]) => !b.total && b.v < 0;
  const paints: Paint[] = bars.map((b) =>
    b.k === block.highlight ? (decrease(b) ? 'accent-hatch' : 'accent') : b.total ? 'light' : decrease(b) ? 'hatch' : 'mid',
  );

  // Names wrap at a space when they would take more than a third of the width.
  const nameSize = TICK;
  const nameRoom = width * 0.34;
  const names = block.categories.map((name) => wrapLines(name, nameRoom, nameSize));
  const left = Math.ceil(Math.max(...names.flatMap((lines) => lines.map((l) => textWidth(l, nameSize))))) + 10;

  const ticks: number[] = [];
  for (let v = axis.min; v <= axis.max + axis.step / 1e6; v += axis.step) ticks.push(Number(v.toPrecision(12)));
  const tickWidth = Math.max(...ticks.map((t) => textWidth(formatTick(block, t), TICK)));
  const label = (b: (typeof bars)[number]) =>
    b.total ? formatValue(block, b.v) : `${b.v > 0 ? '+' : '−'}${formatValue(block, Math.abs(b.v))}`;
  const labelWidth = block.labelled ? Math.max(...bars.map((b) => textWidth(label(b), VALUE))) + 6 : 0;
  // Room on the right for the last tick label, and for a value printed beyond the longest bar.
  const right = Math.ceil(Math.max(tickWidth / 2 + 2, labelWidth));
  const plotW = width - left - right;
  const at = (v: number) => left + ((v - axis.min) / (axis.max - axis.min)) * plotW;

  const rowH = Math.max(28, ...names.map((lines) => lines.length * (nameSize + 3) + 10));
  const barH = 18;
  const top = 4;
  const plotH = rowH * bars.length;
  const height = top + plotH + 8 + TICK + 4;
  const rowMid = (k: number) => top + rowH * (k + 0.5);

  // Gridlines up the plot, labelled along the bottom: every line where the labels fit, else every second or third.
  // Estimated charts get stronger gridlines.
  const gap = plotW / Math.max(1, ticks.length - 1);
  const every = Math.max(1, Math.ceil((tickWidth + 8) / gap));
  ticks.forEach((t, i) => {
    const tone = t === 0 ? 'base' : block.labelled ? 'grid' : 'grid-strong';
    marks.push({ kind: 'rule', x1: at(t), y1: top, x2: at(t), y2: top + plotH, tone });
    if (i % every !== 0) return;
    marks.push({ kind: 'text', x: at(t), y: top + plotH + 8 + TICK - 2, text: formatTick(block, t), anchor: 'middle', size: TICK, tone: 'muted', weight: 'normal' });
  });

  bars.forEach((b, k) => {
    const lo = Math.min(b.from, b.to);
    const hi = Math.max(b.from, b.to);
    const yTop = rowMid(k) - barH / 2;
    marks.push({ kind: 'rect', x: at(lo), y: yTop, w: Math.max(1, at(hi) - at(lo)), h: barH, paint: paints[k]! });
    // On estimated bars, gridlines cut through so each end can be judged against the nearest line.
    if (!block.labelled) {
      for (const t of ticks) if (t > lo + 1e-9 && t < hi - 1e-9) marks.push({ kind: 'rule', x1: at(t), y1: yTop, x2: at(t), y2: yTop + barH, tone: 'knock' });
    }
    // The connector drops from where this bar ends to the next bar.
    if (k < bars.length - 1) {
      marks.push({ kind: 'rule', x1: at(b.to), y1: yTop + barH, x2: at(b.to), y2: rowMid(k + 1) - barH / 2, tone: 'connector' });
    }
    if (block.labelled) {
      marks.push({
        kind: 'text',
        x: at(hi) + 5,
        y: rowMid(k) + VALUE * 0.36,
        text: label(b),
        anchor: 'start',
        size: VALUE,
        tone: 'text',
        weight: b.total || k === block.highlight ? 'bold' : 'normal',
      });
    }
    const lines = names[k]!;
    lines.forEach((line, row) => {
      marks.push({
        kind: 'text',
        x: 0,
        y: rowMid(k) - ((lines.length - 1) * (nameSize + 3)) / 2 + row * (nameSize + 3) + nameSize * 0.36,
        text: line,
        anchor: 'start',
        size: nameSize,
        tone: b.total ? 'text' : 'muted',
        weight: b.total ? 'bold' : 'normal',
      });
    });
  });

  // A key for the two kinds of step, so an unlabelled waterfall still reads up from down, and for the asked-about bar.
  const legend: LegendItem[] = [];
  if (bars.some((b) => !b.total && b.v > 0)) legend.push({ name: 'Increase', paint: 'mid' });
  if (bars.some(decrease)) legend.push({ name: 'Decrease', paint: 'hatch' });
  const asked = bars.find((b) => b.k === block.highlight);
  if (asked) legend.push({ name: block.categories[asked.k]!, paint: paints[asked.k]! });
  return { width, height, marks, legend };
}

// ---------- Pie: slices clockwise from twelve o'clock, labelled outside with leaders ----------

function drawPie(block: ChartBlock, width: number): Drawing {
  const values = block.series[0]!.values;
  const total = values.reduce((a, b) => a + b, 0);
  const paints = seriesPaints(block);
  const marks: Mark[] = [];

  const size = MIN_TEXT;
  // Names wrap at a space when long; the pie shrinks to leave each side room for its widest label.
  const rows = values.map((v, i) => {
    const name = block.categories[i]!;
    const lines = wrapLines(name, width * 0.22, size);
    return { i, v, lines, text: formatValue(block, v) };
  });
  const widest = Math.max(...rows.flatMap((row) => [...row.lines.map((l) => textWidth(l, size)), textWidth(row.text, VALUE + 1)]));
  const r = Math.round(Math.max(40, Math.min(92, width * 0.24, width / 2 - widest - 16)));
  // A label block: the name (one or two lines), then the share in bold.
  const valueSize = VALUE + 1;
  const blockH = (lines: number) => lines * (size + 3) + valueSize + 2;

  let angle = 0;
  const slices = rows.map((row) => {
    const sweep = (row.v / total) * Math.PI * 2;
    const mid = angle + sweep / 2;
    const out = { ...row, start: angle, end: angle + sweep, mid };
    angle += sweep;
    return out;
  });

  // Place labels on each side, then nudge apart.
  const sides = { right: slices.filter((s) => Math.sin(s.mid) >= 0), left: slices.filter((s) => Math.sin(s.mid) < 0) };
  const tallest = Math.max(...rows.map((row) => blockH(row.lines.length)));
  const sideNeed = Math.max(sides.right.length, sides.left.length) * (tallest + 4);
  const pad = 14;
  const height = Math.round(Math.max(2 * r + 2 * pad + 8, sideNeed + 8));
  const cx = width / 2;
  const cy = height / 2;

  for (const s of slices) {
    marks.push({ kind: 'slice', d: slicePath(cx, cy, r, s.start, s.end), paint: paints[s.i]! });
  }

  for (const [side, list] of Object.entries(sides) as ['right' | 'left', typeof slices][]) {
    const sorted = [...list].sort((a, b) => -Math.cos(a.mid) - -Math.cos(b.mid));
    const wants = sorted.map((s) => cy - Math.cos(s.mid) * (r + 10));
    const placed = spread(wants, tallest + 4, tallest / 2 + 2, height - tallest / 2 - 2);
    sorted.forEach((s, i) => {
      const dir = side === 'right' ? 1 : -1;
      const ex = cx + Math.sin(s.mid) * r;
      const ey = cy - Math.cos(s.mid) * r;
      const ox = cx + Math.sin(s.mid) * (r + 6);
      const oy = cy - Math.cos(s.mid) * (r + 6);
      const ly = placed[i]!;
      const lx = cx + dir * (r + 11);
      marks.push({ kind: 'rule', x1: ex, y1: ey, x2: ox, y2: oy, tone: 'leader' });
      marks.push({ kind: 'rule', x1: ox, y1: oy, x2: lx, y2: ly, tone: 'leader' });
      const anchor = side === 'right' ? 'start' : 'end';
      const tx = lx + dir * 3;
      const top = ly - blockH(s.lines.length) / 2;
      s.lines.forEach((line, row) => {
        marks.push({ kind: 'text', x: tx, y: top + size + row * (size + 3), text: line, anchor, size, tone: 'muted', weight: 'normal' });
      });
      marks.push({
        kind: 'text',
        x: tx,
        y: top + s.lines.length * (size + 3) + valueSize - 1,
        text: s.text,
        anchor,
        size: valueSize,
        tone: 'text',
        weight: 'bold',
      });
    });
  }

  return { width, height, marks, legend: [] };
}

function slicePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(cx + Math.sin(a) * r).toFixed(2)} ${(cy - Math.cos(a) * r).toFixed(2)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-9) return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)} Z`;
}

// ---------- Horizontal bars: one row per category, names down the left, values along the bottom ----------

/**
 * Bars running across, for long category names or many categories on a phone.
 * Side-by-side series sit as thin bars within the row; stacked series run left
 * to right from zero (negative segments leftwards). Values print at the end of
 * each bar, or inside a segment when it is wide enough; bar notes print after
 * the stack.
 */
function drawHorizontalBars(block: ChartBlock, width: number): Drawing {
  const axis = block.axis ?? { min: 0, max: 1, step: 1 };
  const stacked = block.chart === 'stacked-bar' || block.chart === 'stacked-bar-100';
  const paints = groupPaints(block) ?? seriesPaints(block);
  const paintOf = (si: number, k: number) => (block.groups ? paints[k]! : paints[si]!);
  const marks: Mark[] = [];
  const m = stacked ? 1 : block.series.length;

  const nameSize = TICK;
  const nameRoom = width * 0.34;
  const names = block.categories.map((name) => wrapLines(name, nameRoom, nameSize));
  const left = Math.ceil(Math.max(...names.flatMap((lines) => lines.map((l) => textWidth(l, nameSize))))) + 10;

  const ticks = ticksOf(axis);
  const tickWidth = Math.max(...ticks.map((t) => textWidth(formatTick(block, t), TICK)));
  const notes = block.barNotes ?? [];
  const endTexts = [
    ...(block.labelled && !stacked ? block.series.flatMap((s) => s.values.map((v) => formatValue(block, v))) : []),
    ...notes,
  ];
  const endWidth = endTexts.length > 0 ? Math.max(...endTexts.map((t) => textWidth(t, VALUE))) * (notes.length > 0 && block.labelled && !stacked ? 2 : 1) + 8 : 0;
  const right = Math.ceil(Math.max(tickWidth / 2 + 2, endWidth));
  const plotW = width - left - right;
  const at = (v: number) => left + ((v - axis.min) / (axis.max - axis.min)) * plotW;

  const barH = m > 1 ? 13 : 18;
  const gap = m > 1 ? 2 : 0;
  const groupH = m * barH + (m - 1) * gap;
  // Stacked rows with printed values leave a line under each bar for values too long for their segment.
  const under = stacked && block.labelled ? 16 : 0;
  const rowH = Math.max((m > 1 ? groupH + 12 : 28) + under, ...names.map((lines) => lines.length * (nameSize + 3) + 10 + under));
  const top = 4;
  const plotH = rowH * block.categories.length;
  const height = top + plotH + 8 + TICK + 4;
  const rowMid = (k: number) => top + rowH * (k + 0.5) - under / 2;

  const every = Math.max(1, Math.ceil((tickWidth + 8) / (plotW / Math.max(1, ticks.length - 1))));
  ticks.forEach((t, i) => {
    const tone = t === 0 ? 'base' : block.labelled ? 'grid' : 'grid-strong';
    marks.push({ kind: 'rule', x1: at(t), y1: top, x2: at(t), y2: top + plotH, tone });
    if (i % every !== 0) return;
    marks.push({ kind: 'text', x: at(t), y: top + plotH + 8 + TICK - 2, text: formatTick(block, t), anchor: 'middle', size: TICK, tone: 'muted', weight: 'normal' });
  });

  /** One bar from a to b along the value axis, with gridlines cut through it when read by estimate. */
  const bar = (a: number, b: number, yTop: number, h: number, paint: Paint, cut = 0) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // `cut` leaves a hairline of page on the side nearer zero, between neighbouring segments.
    const inset = b >= a ? cut : 0;
    marks.push({ kind: 'rect', x: at(lo) + inset, y: yTop, w: Math.max(1, at(hi) - at(lo) - cut), h, paint });
    if (!block.labelled) for (const t of ticks) if (t > lo + 1e-9 && t < hi - 1e-9) marks.push({ kind: 'rule', x1: at(t), y1: yTop, x2: at(t), y2: yTop + h, tone: 'knock' });
  };

  block.categories.forEach((_, k) => {
    const y0 = rowMid(k) - groupH / 2;
    let end = Math.max(0, axis.min);
    if (stacked) {
      let up = 0;
      let down = 0;
      block.series.forEach((s, si) => {
        const v = drawnValue(block, si, k);
        const from = v < 0 ? down : up;
        const to = from + v;
        if (v < 0) down = to;
        else up = to;
        const cut = from !== 0 ? 1.5 : 0;
        const paint = paintOf(si, k);
        const x0 = at(Math.min(from, to));
        bar(from, to, y0, barH, paint, cut);
        // A segment of nothing has no label; the rest print inside at full size, or just under the bar when too narrow.
        if (block.labelled && v !== 0) {
          const text = formatValue(block, s.values[k]!);
          const w = Math.abs(at(to) - at(from));
          const size = VALUE;
          const tw = textWidth(text, size);
          if (tw <= w - 4) {
            marks.push({ kind: 'text', x: x0 + w / 2, y: rowMid(k) + size * 0.36, text, anchor: 'middle', size, tone: onPaint(paint), weight: 'bold' });
          } else {
            // Under the segment, kept on its own side of the zero line so the line never runs through the figure.
            const zero = at(0);
            let mid = x0 + w / 2;
            if (v < 0) mid = Math.min(mid, zero - 2 - tw / 2);
            else mid = Math.max(mid, zero + 2 + tw / 2);
            mid = Math.min(Math.max(mid, tw / 2), width - tw / 2);
            marks.push({ kind: 'text', x: mid, y: y0 + barH + 12, text, anchor: 'middle', size, tone: 'text', weight: 'bold' });
          }
        }
      });
      end = up;
    } else {
      block.series.forEach((s, si) => {
        const v = s.values[k]!;
        const yTop = y0 + si * (barH + gap);
        bar(0, v, yTop, barH, paintOf(si, k));
        if (block.labelled) {
          marks.push({ kind: 'text', x: at(Math.max(0, v)) + 5, y: yTop + barH / 2 + VALUE * 0.36, text: formatValue(block, v), anchor: 'start', size: VALUE, tone: 'text', weight: paintOf(si, k) === 'accent' ? 'bold' : 'normal' });
        }
        end = Math.max(end, v);
      });
    }
    if (notes[k]) {
      // After the printed values, where the bars carry them.
      const valueW = block.labelled && !stacked ? Math.max(...block.series.map((s) => textWidth(formatValue(block, s.values[k]!), VALUE))) + 8 : 0;
      marks.push({ kind: 'text', x: at(end) + 5 + valueW, y: rowMid(k) + VALUE * 0.36, text: notes[k]!, anchor: 'start', size: VALUE, tone: 'text', weight: 'bold' });
    }
    const lines = names[k]!;
    lines.forEach((line, row) => {
      marks.push({
        kind: 'text',
        x: 0,
        y: rowMid(k) - ((lines.length - 1) * (nameSize + 3)) / 2 + row * (nameSize + 3) + nameSize * 0.36,
        text: line,
        anchor: 'start',
        size: nameSize,
        tone: 'muted',
        weight: 'normal',
      });
    });
  });

  const legend: LegendItem[] = [];
  if (block.series.length > 1) {
    const order = block.series.map((s, i) => ({ name: s.name, paint: paints[i]! }));
    legend.push(...order);
  }
  return { width, height, marks, legend };
}

// ---------- Scatter: named points on two value axes ----------

/**
 * Points placed by two values, each named beside its marker (above, below,
 * right or left: wherever the name collides with nothing). Points may be
 * joined in order by straight lines or by steps; points named '' only shape
 * the line. Dashed reference lines cross the plot where the exhibit drew them.
 */
function drawScatter(block: ChartBlock, width: number): Drawing {
  const axis = block.axis ?? { min: 0, max: 1, step: 1 };
  const xAxis = block.xAxis ?? { min: 0, max: 1, step: 1 };
  const xs = block.x ?? [];
  const ys = block.series[0]!.values;
  const marks: Mark[] = [];

  const ticks = ticksOf(axis);
  const tickWidth = Math.max(...ticks.map((t) => textWidth(formatTick(block, t), TICK)));
  const xTicks = ticksOf(xAxis);
  const xTick = (t: number) => tickText(xAxis.step, t, xAxis.prefix, xAxis.suffix);
  const xTickWidth = Math.max(...xTicks.map((t) => textWidth(xTick(t), TICK)));

  const left = Math.ceil(tickWidth) + 8;
  const right = Math.ceil(xTickWidth / 2) + 4;
  const top = 10;
  const plotW = width - left - right;
  const plotH = Math.round(Math.min(260, Math.max(180, width * 0.6)));
  const xUnitLines = block.xUnit ? categoryLines(block.xUnit, Math.max(1, plotW * 2), TICK) : [];
  const xUnitRows = block.xUnit && textWidth(block.xUnit, TICK) > plotW ? categoryLines(block.xUnit, 0, TICK) : xUnitLines;
  const height = top + plotH + 8 + TICK + 6 + xUnitRows.length * (TICK + 3) + 4;
  const px = (v: number) => left + ((v - xAxis.min) / (xAxis.max - xAxis.min)) * plotW;
  const py = (v: number) => top + plotH - ((v - axis.min) / (axis.max - axis.min)) * plotH;

  const labelEvery = Math.max(1, Math.ceil((TICK + 3) / (plotH / Math.max(1, ticks.length - 1))));
  ticks.forEach((t, i) => {
    const tone = t === axis.min ? 'base' : block.labelled ? 'grid' : 'grid-strong';
    marks.push({ kind: 'rule', x1: left, y1: py(t), x2: width - right, y2: py(t), tone });
    if (i % labelEvery === 0) marks.push({ kind: 'text', x: left - 8, y: py(t) + 4, text: formatTick(block, t), anchor: 'end', size: TICK, tone: 'muted', weight: 'normal' });
  });
  const every = Math.max(1, Math.ceil((xTickWidth + 8) / (plotW / Math.max(1, xTicks.length - 1))));
  xTicks.forEach((t, i) => {
    marks.push({ kind: 'rule', x1: px(t), y1: top + plotH, x2: px(t), y2: top + plotH + 4, tone: 'base' });
    if (t === xAxis.min) marks.push({ kind: 'rule', x1: px(t), y1: top, x2: px(t), y2: top + plotH, tone: 'base' });
    if (i % every !== 0) return;
    marks.push({ kind: 'text', x: px(t), y: top + plotH + 8 + TICK - 2, text: xTick(t), anchor: 'middle', size: TICK, tone: 'muted', weight: 'normal' });
  });
  xUnitRows.forEach((line, row) => {
    marks.push({ kind: 'text', x: left + plotW / 2, y: top + plotH + 8 + TICK + 6 + (row + 1) * (TICK + 3) - 3, text: line, anchor: 'middle', size: TICK, tone: 'muted', weight: 'normal' });
  });

  for (const r of block.references ?? []) {
    if (r.axis === 'x') marks.push({ kind: 'rule', x1: px(r.value), y1: top, x2: px(r.value), y2: top + plotH, tone: 'reference' });
    else marks.push({ kind: 'rule', x1: left, y1: py(r.value), x2: width - right, y2: py(r.value), tone: 'reference' });
  }

  const linePaint: Paint = block.highlight === undefined ? 'light' : 'mid';
  if (block.join) {
    const points: [number, number][] = [];
    xs.forEach((x, k) => {
      if (block.join === 'step') {
        const next = k + 1 < xs.length ? xs[k + 1]! : xAxis.max;
        points.push([px(x), py(ys[k]!)], [px(next), py(ys[k]!)]);
      } else {
        points.push([px(x), py(ys[k]!)]);
      }
    });
    marks.push({ kind: 'line', points, paint: linePaint, dash: 'solid', bold: true });
  }

  // Markers, then names placed clear of each other, the markers, the reference lines and the axis labels:
  // a name stays inside the plot (right of the value axis labels, above the year labels).
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxes: Box[] = [];
  const named = block.categories.map((name, k) => ({ name, k, x: px(xs[k]!), y: py(ys[k]!) })).filter((p) => p.name !== '');
  for (const p of named) {
    const paint: Paint = p.k === block.highlight ? 'accent' : 'mid';
    marks.push({ kind: 'marker', x: p.x, y: p.y, shape: 'square', paint });
    boxes.push({ x0: p.x - 5, y0: p.y - 5, x1: p.x + 5, y1: p.y + 5 });
  }
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const references = (block.references ?? []).map((r) => (r.axis === 'x' ? { x: px(r.value) } : { y: py(r.value) }));
  // A reference line may not run through a name, descenders included.
  const crossesReference = (a: Box) => references.some((r) => ('x' in r ? a.x0 < r.x! && r.x! < a.x1 : a.y0 < r.y! && r.y! < a.y1));
  const markers = [...boxes];

  type Spot = { x: number; y: number };
  const labels = named.map((p) => {
    const text = block.labelled ? `${p.name} (${xTick(xs[p.k]!)}, ${formatValue(block, ys[p.k]!)})` : p.name;
    const w = textWidth(text, VALUE);
    const h = VALUE;
    const clampX = (x: number) => Math.min(Math.max(x, left + 2), width - w);
    // Above, below, right, left, then the four corners; centred names slide along their row to stay inside.
    const spots: Spot[] = [
      { x: clampX(p.x - w / 2), y: p.y - 8 - h },
      { x: clampX(p.x - w / 2), y: p.y + 8 },
      { x: p.x + 8, y: p.y - h / 2 },
      { x: p.x - 8 - w, y: p.y - h / 2 },
      { x: p.x + 6, y: p.y - 6 - h },
      { x: p.x - 6 - w, y: p.y - 6 - h },
      { x: p.x + 6, y: p.y + 6 },
      { x: p.x - 6 - w, y: p.y + 6 },
    ];
    // Each spot crossed by an upright reference line also comes slid clear of it, either way, while it stays beside its point.
    for (const o of [...spots]) {
      for (const r of references) {
        if (!('x' in r) || !(o.x < r.x! && r.x! < o.x + w)) continue;
        for (const x of [r.x! + 1, r.x! - 1 - w]) if (x <= p.x + 8 && x + w >= p.x - 8) spots.push({ x, y: o.y });
      }
    }
    // Inside the plot: right of the value axis labels, above the bottom axis. The ink runs a pixel past the line height for descenders.
    const fit = spots.filter((o) => o.x >= left + 2 && o.x + w <= width && o.y >= 0 && o.y + h <= top + plotH);
    const boxOf = (o: Spot): Box => ({ x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h + 1 });
    return { p, text, h, boxes: (fit.length > 0 ? fit : spots.slice(0, 1)).map(boxOf) };
  });

  /** Places names in order, each in its first spot clear of everything placed so far; counts the names that found none. */
  const place = (order: typeof labels) => {
    const taken = [...markers];
    let misses = 0;
    const struggling: (typeof labels)[number][] = [];
    const chosen = new Map<(typeof labels)[number], Box>();
    for (const l of order) {
      const clear = (b: Box) => !taken.some((t) => hit(b, t));
      const pick = l.boxes.find((b) => clear(b) && !crossesReference(b)) ?? l.boxes.find(clear) ?? l.boxes.find((b) => !crossesReference(b)) ?? l.boxes[0]!;
      if (!clear(pick) || crossesReference(pick)) {
        misses++;
        struggling.push(l);
      }
      taken.push(pick);
      chosen.set(l, pick);
    }
    return { misses, struggling, chosen };
  };
  // Top to bottom first; a name left without a clean spot goes first next time, a few times over, keeping the best try.
  let order = [...labels].sort((a, b) => a.p.y - b.p.y);
  let best = place(order);
  let last = best;
  for (let attempt = 0; attempt < labels.length && best.misses > 0; attempt++) {
    const first = last.struggling[0]!;
    order = [first, ...order.filter((l) => l !== first)];
    last = place(order);
    if (last.misses < best.misses) best = last;
  }
  for (const l of labels) {
    const b = best.chosen.get(l)!;
    marks.push({ kind: 'text', x: b.x0, y: b.y0 + l.h * 0.82, text: l.text, anchor: 'start', size: VALUE, tone: 'halo', weight: l.p.k === block.highlight ? 'bold' : 'normal' });
  }

  return { width, height, marks, legend: [] };
}
