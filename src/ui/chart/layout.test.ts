import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listTemplates } from '../../engine/question';
import type { ChartBlock, Tier } from '../../engine/question';
import { drawChart, MIN_TEXT, textWidth } from './layout';
import type { Drawing, Mark } from './layout';
import { NO_BOOKLETS } from '../../engine/question/test-support/booklets';

/**
 * Chart layout is checked on the drawing it hands the renderer: where each
 * piece of text lands, at what size, and what the key shows. Widths are the
 * chart's own width inside a question at the phone sizes that matter (about
 * 280px at 320 wide, 353px at the owner's 393).
 */

type Exhibit = { id: string; questions: string[]; blocks: Array<ChartBlock | { type: 'table' }> };
const EXHIBITS = Object.values(
  import.meta.glob<Exhibit[]>('../../../content/exhibits/*.json', { eager: true, import: 'default' }),
).flat();
const exhibitCharts = (kind?: ChartBlock['chart']) =>
  EXHIBITS.flatMap((x) => x.blocks.flatMap((b, i) => (b.type === 'chart' && (!kind || b.chart === kind) ? [{ id: `${x.id}#${i}`, block: b as ChartBlock }] : [])));
/** The chart of the redrawn exhibit a booklet question shows (each shows at most one). */
const exhibit = (questionId: string) => (EXHIBITS.find((x) => x.questions.includes(questionId))!.blocks.find((b) => b.type === 'chart') as ChartBlock);

const WIDTHS = [260, 280, 300, 320, 353, 400];

type Text = Extract<Mark, { kind: 'text' }>;
type Box = { x0: number; y0: number; x1: number; y1: number };

const texts = (d: Drawing) => d.marks.filter((m): m is Text => m.kind === 'text');
/** The ink a text mark covers: its advance from the anchor, cap height above the baseline, a little below. */
function box(t: Text): Box {
  const w = textWidth(t.text, t.size);
  const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2;
  return { x0, y0: t.y - t.size * 0.78, x1: x0 + w, y1: t.y + t.size * 0.2 };
}
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('scatter point names', () => {
  const scatters = exhibitCharts('scatter');

  it.skipIf(NO_BOOKLETS)('exist in the booklet exhibits', () => {
    expect(scatters.length).toBeGreaterThan(0);
  });

  it.each(scatters)('$id: sit clear of the axis labels, the reference lines and each other', ({ id, block }) => {
    for (const width of WIDTHS) {
      const d = drawChart(block, width);
      const named = block.categories.filter((c) => c !== '');
      const isName = (t: Text) => named.some((n) => t.text === n || t.text.startsWith(`${n} (`));
      const names = texts(d).filter(isName);
      const axisLabels = texts(d).filter((t) => !isName(t) && t.tone === 'muted');
      expect(names.length, `${id} at ${width}`).toBe(named.length);
      for (const n of names) {
        const nb = box(n);
        expect(nb.x0 >= 0 && nb.x1 <= width, `${id} at ${width}: "${n.text}" leaves the drawing`).toBe(true);
        for (const a of axisLabels) expect(overlap(nb, box(a)), `${id} at ${width}: "${n.text}" covers axis label "${a.text}"`).toBe(false);
        for (const r of d.marks) {
          if (r.kind !== 'rule' || r.tone !== 'reference') continue;
          const crosses = r.x1 === r.x2 ? nb.x0 < r.x1 && r.x1 < nb.x1 && nb.y0 < Math.max(r.y1, r.y2) && Math.min(r.y1, r.y2) < nb.y1 : nb.y0 < r.y1 && r.y1 < nb.y1 && nb.x0 < Math.max(r.x1, r.x2) && Math.min(r.x1, r.x2) < nb.x1;
          expect(crosses, `${id} at ${width}: a reference line runs through "${n.text}"`).toBe(false);
        }
        for (const o of names) if (o !== n) expect(overlap(nb, box(o)), `${id} at ${width}: "${n.text}" overlaps "${o.text}"`).toBe(false);
      }
    }
  });

  it.skipIf(NO_BOOKLETS)('the scatter of pracB-q22: "Country 10" sits inside the plot, right of the axis label "15"', () => {
    const block = exhibit('pracB-q22');
    for (const width of [280, 353]) {
      const d = drawChart(block, width);
      const tick15 = texts(d).find((t) => t.text === '15')!;
      const c10 = texts(d).find((t) => t.text === 'Country 10')!;
      expect(box(c10).x0, `at ${width}`).toBeGreaterThan(box(tick15).x1);
    }
  });
});

describe('printed values on stacked bars', () => {
  const stacks = [
    ...exhibitCharts('stacked-bar'),
    ...exhibitCharts('stacked-bar-100'),
  ].filter(({ block }) => block.labelled);

  /** Where zero sits: the base rule of the value axis. */
  const zeroOf = (d: Drawing, horizontal: boolean) => {
    const base = d.marks.find((m): m is Extract<Mark, { kind: 'rule' }> => m.kind === 'rule' && m.tone === 'base' && (horizontal ? m.x1 === m.x2 : m.y1 === m.y2));
    return base ? (horizontal ? base.x1 : base.y1) : undefined;
  };

  it.each(stacks)('$id: are 12px, print nothing for an empty part, and sit on their own side of zero', ({ id, block }) => {
    const values = block.series.flatMap((s) => s.values);
    const printed = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: block.decimals, maximumFractionDigits: block.decimals }).format(Math.abs(v));
    for (const width of WIDTHS) {
      const d = drawChart(block, width);
      const zero = zeroOf(d, !!block.horizontal);
      const labels = texts(d).filter((t) => t.weight === 'bold' && values.some((v) => t.text.replace(/^[−-]/, '') === printed(v)));
      for (const t of labels) expect(t.size, `${id} at ${width}: "${t.text}"`).toBe(12);
      // An empty part has no label.
      if (values.includes(0) && !values.some((v) => v !== 0 && printed(v) === printed(0))) {
        expect(labels.some((t) => t.text === printed(0)), `${id} at ${width}: a part of nothing is labelled`).toBe(false);
      }
      if (zero === undefined) continue;
      for (const t of labels) {
        const b = box(t);
        const negative = /^[−-]/.test(t.text);
        if (block.horizontal) {
          if (negative) expect(b.x1, `${id} at ${width}: "${t.text}" crosses zero`).toBeLessThanOrEqual(zero);
          else expect(b.x0 >= zero || b.x1 <= zero, `${id} at ${width}: "${t.text}" straddles zero`).toBe(true);
        } else {
          if (negative) expect(b.y0, `${id} at ${width}: "${t.text}" crosses zero`).toBeGreaterThanOrEqual(zero);
          else expect(b.y1 <= zero || b.y0 >= zero, `${id} at ${width}: "${t.text}" straddles zero`).toBe(true);
        }
      }
    }
  });

  it.skipIf(NO_BOOKLETS)('the stacked bars of pst2-q11 print no "0" for their one empty part', () => {
    const block = exhibit('pst2-q11');
    expect(block.series.flatMap((s) => s.values).filter((v) => v === 0)).toHaveLength(1);
    const d = drawChart(block, 353);
    expect(texts(d).some((t) => t.text === '0' && t.weight === 'bold')).toBe(false);
  });

  it.skipIf(NO_BOOKLETS)('write a negative figure with a true minus sign, as prompts do', () => {
    const block = exhibit('pracA-q06');
    const negative = block.series.flatMap((s) => s.values).find((v) => v < 0)!;
    expect(negative).toBeDefined();
    const d = drawChart(block, 353);
    expect(texts(d).some((t) => t.text.includes('-'))).toBe(false);
    expect(texts(d).some((t) => t.text === `−${Math.abs(negative).toFixed(block.decimals)}`)).toBe(true);
  });
});

describe('chart text size', () => {
  it.each(exhibitCharts())('$id: no text under 12px at phone widths; the chart widens instead', ({ id, block }) => {
    for (const width of WIDTHS) {
      const d = drawChart(block, width);
      for (const t of texts(d)) expect(t.size, `${id} at ${width}: "${t.text}"`).toBeGreaterThanOrEqual(MIN_TEXT);
      expect(d.width, `${id} at ${width}`).toBeLessThanOrEqual(Math.ceil(width * 2.4 * 1.1));
    }
  });

  it('generated chart questions keep 12px text too, and most still fit the owner\'s phone without scrolling', () => {
    let drawn = 0;
    let widened = 0;
    for (const skill of ['bar-charts', 'stacked-bar-charts', 'line-charts', 'pie-charts', 'cumulative-charts', 'waterfall-charts'] as const) {
      for (const tier of [1, 2, 3] as Tier[]) {
        for (let seed = 1; seed <= 25; seed++) {
          const q = createQuestion(skill, tier, createRandom(seed));
          for (const b of q.context) {
            if (b.type !== 'chart') continue;
            for (const width of [280, 353]) {
              const d = drawChart(b, width);
              for (const t of texts(d)) expect(t.size, `${skill} t${tier} seed ${seed} at ${width}: "${t.text}"`).toBeGreaterThanOrEqual(MIN_TEXT);
              if (width === 353) {
                drawn++;
                if (d.width > width) widened++;
              }
            }
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(100);
    expect(widened / drawn, 'share of generated charts that need sideways scrolling at 393').toBeLessThan(0.1);
  });
});

describe('waterfall key', () => {
  const bridge = (highlight: number): ChartBlock => ({
    type: 'chart',
    chart: 'waterfall',
    title: 'Operating profit',
    unit: '$m',
    categories: ['2023', 'Fares', 'Fuel', 'Crew pay', '2024'],
    series: [{ name: 'Operating profit', values: [268, 80, -24, -40, 284] }],
    totals: [0, 4],
    axis: { min: 0, max: 400, step: 100 },
    labelled: true,
    decimals: 0,
    highlight,
  });
  const rects = (d: Drawing) => d.marks.filter((m): m is Extract<Mark, { kind: 'rect' }> => m.kind === 'rect');

  it('keeps the decrease hatching on an asked-about decrease, in the accent', () => {
    const d = drawChart(bridge(2), 353);
    const fuel = rects(d)[2]!;
    const plainDecrease = rects(d)[3]!;
    expect(fuel.paint).not.toBe(plainDecrease.paint);
    expect(fuel.paint).not.toBe('accent');
    expect(fuel.paint).toBe('accent-hatch');
  });

  it('names the asked-about bar in the key, drawn exactly as the bar', () => {
    for (const k of [1, 2, 4]) {
      const d = drawChart(bridge(k), 353);
      const bar = rects(d)[k]!;
      expect(d.legend, `highlight ${k}`).toContainEqual({ name: bridge(k).categories[k], paint: bar.paint });
      expect(d.legend.map((l) => l.name), `highlight ${k}`).toEqual(expect.arrayContaining(['Increase', 'Decrease']));
    }
  });

  it('an asked-about increase stays solid accent', () => {
    expect(rects(drawChart(bridge(1), 353))[1]!.paint).toBe('accent');
  });

  it('holds for every generated waterfall question that asks about one bar', () => {
    let asked = 0;
    for (const template of listTemplates('waterfall-charts')) {
      for (const tier of [1, 2, 3] as Tier[]) {
        for (let seed = 1; seed <= 60; seed++) {
          const q = createQuestion('waterfall-charts', tier, createRandom(seed), { template });
          for (const block of q.context) {
            if (block.type !== 'chart' || block.highlight === undefined) continue;
            asked++;
            const d = drawChart(block, 353);
            const k = block.highlight;
            const bar = rects(d)[k]!;
            const isDecrease = !(block.totals ?? [0]).includes(k) && block.series[0]!.values[k]! < 0;
            expect(bar.paint, q.id).toBe(isDecrease ? 'accent-hatch' : 'accent');
            expect(d.legend, q.id).toContainEqual({ name: block.categories[k], paint: bar.paint });
          }
        }
      }
    }
    expect(asked).toBeGreaterThan(50);
  });
});
