import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, listTemplates } from './index';
import type { ChartBlock, ChartKind, ChartSkill, Question, Tier } from './index';

/**
 * Chart questions are checked the way the owner meets them: the answer is
 * recomputed from the values the chart draws (and any figures printed beside
 * it), never from anything the engine computed. Where a chart must be read off
 * its gridlines, every reading within a reasonable error must still land on
 * the correct option.
 */

const CHART_SKILLS: Record<ChartSkill, ChartKind[]> = {
  'bar-charts': ['bar'],
  'stacked-bar-charts': ['stacked-bar', 'stacked-bar-100'],
  'line-charts': ['line', 'indexed-line'],
  'pie-charts': ['pie'],
  'cumulative-charts': ['cumulative'],
  'waterfall-charts': ['waterfall'],
};
const SKILLS = Object.keys(CHART_SKILLS) as ChartSkill[];
const TIERS: Tier[] = [1, 2, 3];
const SEEDS_PER_TIER = 400;
/** Chart forms that draw a single series. */
const SINGLE_SERIES: ChartKind[] = ['pie', 'cumulative', 'waterfall'];

/** A reasonable reading error: a fifth of the gap between gridlines, either way. */
const READING_ERROR = 0.2;

// A minus sign is "−", never a hyphen: "-3" or "5 - 2" is malformed, as is a negative zero.
const MALFORMED = /NaN|undefined|null|Infinity|\d[eE][+-]?\d|(?<![\d.,])0\d|\d,(?=\d)(?!\d{3}(?!\d))|\.\d*\.|[-−]0(?![.\d])|(?<![\w-])-\d|\d\s+-\s+[\d$(]/;

// ---------- Reading the question ----------

/** The number in a piece of owner-facing text: "$1,250.50" -> 1250.5, "12%" -> 12. */
function num(text: string): number {
  const match = /-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/.exec(text);
  if (!match) throw new Error(`No number in "${text}"`);
  return Number(match[0].replaceAll(',', ''));
}

function charts(q: Question): ChartBlock[] {
  return q.context.filter((b): b is ChartBlock => b.type === 'chart');
}

function chart(q: Question, index = 0): ChartBlock {
  const found = charts(q)[index];
  if (!found) throw new Error(`No chart ${index} in ${q.id}`);
  return found;
}

/** The charted value of a series (by name, or the only one) in a category. */
function value(c: ChartBlock, category: string, series?: string): number {
  const col = c.categories.indexOf(category);
  if (col < 0) throw new Error(`No category ${category} in ${c.categories.join(', ')}`);
  const s = series === undefined ? c.series[0] : c.series.find((x) => x.name === series);
  if (!s) throw new Error(`No series ${series} in ${c.series.map((x) => x.name).join(', ')}`);
  return s.values[col]!;
}

/** The categories named in the prompt, in the order the prompt names them. */
function namedCategories(q: Question, c: ChartBlock): string[] {
  return c.categories
    .map((name) => ({ name, at: q.prompt.indexOf(name) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.name);
}

/** The series named in the prompt, in the order the prompt names them. */
function namedSeries(q: Question, c: ChartBlock): string[] {
  return c.series
    .map((s) => ({ name: s.name, at: q.prompt.indexOf(s.name) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.name);
}

function listItems(q: Question): string[] {
  return q.context.flatMap((b) => (b.type === 'list' ? b.items : []));
}

function paragraphs(q: Question): string {
  return q.context.flatMap((b) => (b.type === 'paragraph' ? [b.text] : [])).join(' ');
}

/** The number right after a phrase in the paragraphs, prompt or chart notes. */
function after(q: Question, phrase: RegExp): number {
  const notes = charts(q).map((c) => c.note ?? '');
  const text = [paragraphs(q), q.prompt, ...notes].join(' ');
  const match = new RegExp(`${phrase.source}\\s*\\$?(-?[\\d,]+(?:\\.\\d+)?)`).exec(text);
  if (!match) throw new Error(`Nothing after ${phrase} in ${q.id}`);
  return num(match[1]!);
}

function visibleText(q: Question): string[] {
  const context = q.context.flatMap((b) => {
    switch (b.type) {
      case 'paragraph':
        return [b.text];
      case 'list':
        return b.items;
      case 'table':
        return [...(b.title ? [b.title] : []), ...b.headers, ...b.rows.flat()];
      case 'chart':
        return [b.title, b.unit, ...b.categories, ...b.series.map((s) => s.name), ...(b.barNotes ?? []), ...(b.note ? [b.note] : [])];
    }
  });
  const options = q.answer.kind === 'choice' ? q.answer.options : [];
  return [q.prompt, ...context, ...options, ...q.solution, q.shortcut];
}

// ---------- Independent solvers, one per template ----------

const solvers: Record<string, (q: Question) => number> = {
  'bar-growth': (q) => {
    const c = chart(q);
    const years = namedCategories(q, c);
    if (/two years after/.test(q.prompt)) {
      // Carry on the period's average yearly increase for two more years.
      const first = c.series[0]!.values[0]!;
      const last = c.series[0]!.values.at(-1)!;
      return last + (2 * (last - first)) / (c.categories.length - 1);
    }
    const [from, to] = years as [string, string];
    // The rise itself, or the rise as a percentage of the first year.
    if (/how much did .* rise/.test(q.prompt)) return value(c, to) - value(c, from);
    return (value(c, to) / value(c, from) - 1) * 100;
  },
  'bar-share': (q) => {
    const c = chart(q);
    const named = namedCategories(q, c);
    if (/share of total/.test(q.prompt)) {
      const total = c.series[0]!.values.reduce((a, b) => a + b, 0);
      return ((value(c, named[0]!) + value(c, named[1]!)) / total) * 100;
    }
    if (/how many times/.test(q.prompt)) return value(c, named[0]!) / value(c, named[1]!);
    // One place's share of all five bars of the year named.
    const year = namedSeries(q, c)[0]!;
    const total = c.series.find((s) => s.name === year)!.values.reduce((a, b) => a + b, 0);
    expect(q.prompt, q.id).toMatch(/share of the five/);
    return (value(c, named[0]!, year) / total) * 100;
  },
  'stacked-mix': (q) => {
    const c = chart(q);
    const part = namedSeries(q, c)[0]!;
    const years = namedCategories(q, c);
    const total = (year: string) => c.series.reduce((sum, s) => sum + value(c, year, s.name), 0);
    const share = (year: string) => (value(c, year, part) / total(year)) * 100;
    if (/percentage points/.test(q.prompt)) return share(years[1]!) - share(years[0]!);
    if (/What share/.test(q.prompt)) return share(years[0]!);
    return (value(c, years[1]!, part) / value(c, years[0]!, part) - 1) * 100;
  },
  'stacked-share': (q) => {
    // Shares from the segments; the market size printed above each bar.
    const c = chart(q);
    const brand = namedSeries(q, c)[0]!;
    const years = namedCategories(q, c);
    const sales = (year: string) => (value(c, year, brand) * num(c.barNotes![c.categories.indexOf(year)]!)) / 100;
    if (years.length === 1) return sales(years[0]!);
    return (sales(years[1]!) / sales(years[0]!) - 1) * 100;
  },
  'line-trend': (q) => {
    const c = chart(q);
    const names = namedSeries(q, c);
    const years = namedCategories(q, c);
    const line = c.series.find((s) => s.name === names[0])!.values;
    if (/average .* across/.test(q.prompt)) return line.reduce((a, b) => a + b, 0) / line.length;
    if (/grow from/.test(q.prompt)) return (value(c, years[1]!, names[0]) / value(c, years[0]!, names[0]) - 1) * 100;
    if (/how much did .* rise/.test(q.prompt)) return value(c, years[1]!, names[0]) - value(c, years[0]!, names[0]);
    return (value(c, years[0]!, names[0]) / value(c, years[0]!, names[1]) - 1) * 100;
  },
  'indexed-growth': (q) => {
    // Each firm's first-year value from the list, multiplied by its final index.
    const c = chart(q);
    const names = namedSeries(q, c);
    const base = (name: string) => num(listItems(q).find((item) => item.startsWith(`${name},`))!.split(':').at(-1)!);
    const final = (name: string) => (base(name) * c.series.find((s) => s.name === name)!.values.at(-1)!) / 100;
    expect(namedCategories(q, c), q.id).toEqual([c.categories.at(-1)]);
    return /exceed/.test(q.prompt) ? final(names[0]!) - final(names[1]!) : final(names[0]!);
  },
  'pie-amount': (q) => {
    // Shares from the slices; the total from the text.
    const c = chart(q);
    const slices = namedCategories(q, c);
    const total = num(paragraphs(q));
    const cut = /cut by (\d+)%/.exec(q.prompt);
    if (cut) return (value(c, slices[0]!) * Number(cut[1])) / 100;
    return (slices.reduce((sum, name) => sum + value(c, name), 0) * total) / 100;
  },
  'pie-shift': (q) => {
    const growth = /grows by (\d+)%/.exec(q.prompt);
    if (growth) {
      const c = chart(q);
      const share = value(c, namedCategories(q, c)[0]!);
      const grown = share * (1 + Number(growth[1]) / 100);
      return (grown / (100 - share + grown)) * 100;
    }
    if (charts(q).length === 2) {
      // Each pie's title ends with its year; that year's total is printed under it.
      const amount = (c: ChartBlock) => (value(c, namedCategories(q, c)[0]!) * after(q, new RegExp(`in ${c.title.slice(-4)}:`))) / 100;
      return (amount(chart(q, 1)) / amount(chart(q, 0)) - 1) * 100;
    }
    const c = chart(q);
    const [known, ...asked] = namedCategories(q, c) as [string, ...string[]];
    const given = after(q, new RegExp(`${known} brought in`));
    return (given / value(c, known)) * asked.reduce((sum, name) => sum + value(c, name), 0);
  },
  'cumulative-share': (q) => cumulativeSolvers['cumulative-share']!(q, stepReading),
  'cumulative-groups': (q) => cumulativeSolvers['cumulative-groups']!(q, stepReading),
  'profit-bridge': (q) => {
    // The first and last bars are the two years' profit; the bars between are signed steps.
    const c = chart(q);
    const values = c.series[0]!.values;
    const start = values[0]!;
    const end = values.at(-1)!;
    const steps = values.filter((_, k) => !c.totals!.includes(k));
    const gains = steps.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const losses = steps.filter((v) => v < 0).reduce((a, b) => a + b, 0);
    if (/Excluding/.test(q.prompt)) {
      const named = stepsNamed(q, c);
      expect(named, q.id).toHaveLength(1);
      return ((end - value(c, named[0]!)) / start - 1) * 100;
    }
    if (/offset/.test(q.prompt)) return (-losses / gains) * 100;
    // Flat costs: where the walk stands after the gains.
    if (/costs stayed flat/.test(q.prompt)) return start + gains;
    throw new Error(`Unknown bridge question: ${q.prompt}`);
  },
  'margin-walk': (q) => {
    // Revenue walks down to operating profit; cost bars are negative steps, profit bars are totals.
    const c = chart(q);
    const revenue = value(c, 'Revenue');
    const profit = value(c, 'Operating profit');
    const rose = /rose by (\d+)%/.exec(q.prompt);
    if (rose) return ((-value(c, 'Cost of goods') * Number(rose[1])) / 100 / profit) * 100;
    if (/operating margin/.test(q.prompt)) return (profit / revenue) * 100;
    if (/gross margin/.test(q.prompt)) return (value(c, 'Gross profit') / revenue) * 100;
    // Costs named in the prompt, as a share of revenue.
    const named = stepsNamed(q, c);
    expect(named.length, q.id).toBeGreaterThan(0);
    return (-named.reduce((sum, name) => sum + value(c, name), 0) / revenue) * 100;
  },
};

/** The waterfall steps (bars that are not totals) the prompt names, matched without regard to case. */
function stepsNamed(q: Question, c: ChartBlock): string[] {
  const prompt = q.prompt.toLowerCase();
  return c.categories.filter((name, k) => !c.totals!.includes(k) && prompt.includes(name.toLowerCase()));
}

/**
 * How a reader turns cumulative bars into the share held by the members from
 * bar `first` to bar `last` (indices into the bars).
 */
type ShareReading = (bars: number[], first: number, last: number) => number;

/** Right: the step from the bar before the first member up to the last member's bar. */
const stepReading: ShareReading = (bars, first, last) => bars[last]! - (first > 0 ? bars[first - 1]! : 0);

/** The classic trap: the last member's bar taken as the members' own share. */
const barReading: ShareReading = (bars, _first, last) => bars[last]!;

/** Solvers for cumulative charts, written against a way of reading the bars. */
const cumulativeSolvers: Record<string, (q: Question, read: ShareReading) => number> = {
  'cumulative-share': (q, read) => {
    // Bars are running shares of the total printed under the chart, largest member first.
    const c = chart(q);
    const ranks = /(\d+)(?:st|nd|rd|th)(?: to (\d+)(?:st|nd|rd|th))? largest/.exec(q.prompt)!;
    const first = c.categories.indexOf(`Top ${ranks[1]}`);
    const last = c.categories.indexOf(`Top ${ranks[2] ?? ranks[1]}`);
    const own = read(c.series[0]!.values, first, last) / 100;
    // Options are in the total's own unit ($bn with a $bn total).
    const amount = own * after(q, /Total[^:]*:/);
    const grew = /grew by (\d+)%/.exec(q.prompt);
    return grew ? (amount * Number(grew[1])) / 100 : amount;
  },
  'cumulative-groups': (q, read) => {
    // Bars are running shares of the total, group A first; members per group are listed.
    const c = chart(q);
    const total = amountAfter(q, /Total[^:]*:/);
    const members = (group: string) => num(listItems(q).find((item) => item.startsWith(`Group ${group}:`))!.split(':')[1]!);
    const own = (group: string) => {
      const at = c.categories.findIndex((name) => name.endsWith(group));
      return read(c.series[0]!.values, at, at) / 100;
    };
    const perMember = (group: string) => (own(group) * total) / members(group);
    const run = /groups ([A-F]) to ([A-F])/.exec(q.prompt);
    if (run) {
      // A run of groups together: their joint share over their joint membership.
      const at = (group: string) => c.categories.findIndex((name) => name.endsWith(group));
      const [from, to] = [at(run[1]!), at(run[2]!)];
      const joined = c.categories.slice(from, to + 1).map((name) => name.at(-1)!);
      return ((read(c.series[0]!.values, from, to) / 100) * total) / joined.reduce((sum, g) => sum + members(g), 0);
    }
    const groups = [...q.prompt.matchAll(/group ([A-F])\b/g)].map((m) => m[1]!);
    return groups.length === 2 ? perMember(groups[0]!) / perMember(groups[1]!) : perMember(groups[0]!);
  },
};

/** An amount after a phrase, in units: "$134bn" -> 134e9, "$9.3m" -> 9.3e6. */
function amountAfter(q: Question, phrase: RegExp): number {
  const notes = charts(q).map((c) => c.note ?? '');
  const text = [paragraphs(q), q.prompt, ...notes].join(' ');
  const match = new RegExp(`${phrase.source}\\s*\\$?([\\d,]+(?:\\.\\d+)?)(bn|m|k)?`).exec(text);
  if (!match) throw new Error(`No amount after ${phrase} in ${q.id}`);
  const scale = { bn: 1e9, m: 1e6, k: 1e3 }[match[2] as 'bn' | 'm' | 'k'] ?? 1;
  return num(match[1]!) * scale;
}

// ---------- Reading error ----------

/**
 * Copies of the question with every estimated value moved within the reading
 * error: the readings that push the answer furthest each way, plus random ones.
 * Stacked bars are read at segment boundaries, so the boundaries move.
 */
function misreadings(q: Question, solve: (q: Question) => number): Question[] {
  const estimated = charts(q).flatMap((c, ci) => (c.labelled || !c.axis ? [] : [ci]));
  if (estimated.length === 0) return [];

  type Reading = { chart: number; series: number; category: number };
  const readings: Reading[] = estimated.flatMap((ci) =>
    chart(q, ci).series.flatMap((s, si) => s.values.map((_, k) => ({ chart: ci, series: si, category: k }))),
  );
  const shifted = (shifts: Map<Reading, number>): Question => {
    const context = q.context.map((block, ci) => {
      if (block.type !== 'chart' || !estimated.includes(ci)) return block;
      const stacked = block.chart === 'stacked-bar' || block.chart === 'stacked-bar-100';
      const shiftAt = (sIndex: number, k: number) =>
        [...shifts].find(([r]) => r.chart === ci && r.category === k && r.series === sIndex)?.[1] ?? 0;
      const series = block.series.map((s, si) => ({
        ...s,
        values: s.values.map((v, k) => {
          // A stacked segment is the gap between its top boundary and the one below it.
          if (stacked) return v + shiftAt(si, k) - (si > 0 ? shiftAt(si - 1, k) : 0);
          // A waterfall step is the gap between the running total after it and the one before; a total is read at its end.
          if (block.chart === 'waterfall') return v + shiftAt(si, k) - (block.totals!.includes(k) ? 0 : shiftAt(si, k - 1));
          return v + shiftAt(si, k);
        }),
      }));
      return { ...block, series };
    });
    return { ...q, context };
  };
  const error = (r: Reading) => chart(q, r.chart).axis!.step * READING_ERROR;
  const truth = solve(q);
  // Which way each reading pushes the answer.
  const push = readings.map((r) => Math.sign(solve(shifted(new Map([[r, error(r)]]))) - truth));
  const worst = (direction: number) => shifted(new Map(readings.map((r, i) => [r, direction * (push[i] || 1) * error(r)])));
  const random = createRandom(readings.length * 7919 + q.prompt.length);
  const randomReadings = Array.from({ length: 6 }, () =>
    shifted(new Map(readings.map((r) => [r, (random.next() * 2 - 1) * error(r)]))),
  );
  return [worst(1), worst(-1), ...randomReadings];
}

// ---------- Helpers ----------

function optionValues(q: Question): number[] {
  if (q.answer.kind !== 'choice') throw new Error('not multiple choice');
  return q.answer.options.map(num);
}

function correctIndex(q: Question): number {
  if (q.answer.kind !== 'choice') throw new Error('not multiple choice');
  return q.answer.correctIndex;
}

function closest(values: number[], truth: number): number {
  const distances = values.map((v) => Math.abs(v - truth));
  return distances.indexOf(Math.min(...distances));
}

function generate(skill: ChartSkill, template: string, tier: Tier, count: number): Question[] {
  return Array.from({ length: count }, (_, i) => createQuestion(skill, tier, createRandom(i + 1), { template }));
}

/** The printed form of a value at the chart's decimals parses back to the value. */
function printable(v: number, decimals: number): boolean {
  return Math.abs(Number(v.toFixed(decimals)) - v) < 1e-9;
}

// ---------- The properties every chart template keeps ----------

describe.each(SKILLS)('%s chart questions', (skill) => {
  const templates = listTemplates(skill);

  it('come from at least two templates, each with an independent solver in this test', () => {
    expect(templates.length).toBeGreaterThanOrEqual(2);
    for (const template of templates) expect(Object.keys(solvers)).toContain(template);
  });

  it('are listed as a chart skill at three tiers', () => {
    expect(listSkills()).toContainEqual({ skill, kind: 'chart', tiers: [1, 2, 3], sources: ['generated'] });
  });

  it(`draw every chart form of the skill: ${CHART_SKILLS[skill].join(', ')}`, () => {
    const drawn = new Set(templates.flatMap((t) => TIERS.flatMap((tier) => generate(skill, t, tier, 20).flatMap((q) => charts(q).map((c) => c.chart)))));
    expect([...drawn].sort()).toEqual([...CHART_SKILLS[skill]].sort());
  });

  describe.each(templates)('template %s', (template) => {
    const questions = TIERS.flatMap((tier) => generate(skill, template, tier, SEEDS_PER_TIER));

    it('show a drawn chart of the skill alongside the words that set up the business situation', () => {
      for (const q of questions) {
        expect(charts(q).length, q.id).toBeGreaterThan(0);
        for (const c of charts(q)) expect(CHART_SKILLS[skill], q.id).toContain(c.chart);
        expect(q.context.some((b) => b.type === 'paragraph'), q.id).toBe(true);
      }
    });

    it('describe well-formed charts: one value per category, values inside the axis, shares adding up', () => {
      for (const q of questions) {
        for (const c of charts(q)) {
          expect(c.series.length, q.id).toBeGreaterThan(0);
          expect(c.series.length, q.id).toBeLessThanOrEqual(SINGLE_SERIES.includes(c.chart) ? 1 : 4);
          for (const s of c.series) {
            expect(s.values, q.id).toHaveLength(c.categories.length);
            // Waterfall steps go down as well as up; every other charted value is positive.
            const positive = c.chart === 'waterfall' ? s.values.filter((_, k) => c.totals!.includes(k)) : s.values;
            for (const v of positive) expect(Number.isFinite(v) && v > 0, `${q.id}: ${v}`).toBe(true);
            for (const v of s.values) expect(Number.isFinite(v) && v !== 0, `${q.id}: ${v}`).toBe(true);
            if (c.labelled) for (const v of s.values) expect(printable(v, c.decimals), `${q.id}: ${v} at ${c.decimals} dp`).toBe(true);
          }
          const sums = c.categories.map((_, k) => c.series.reduce((sum, s) => sum + s.values[k]!, 0));
          if (c.chart === 'stacked-bar-100') for (const sum of sums) expect(sum, q.id).toBeCloseTo(100, 6);
          if (c.chart === 'pie') expect(sums.reduce((a, b) => a + b, 0), q.id).toBeCloseTo(100, 6);
          if (c.chart === 'indexed-line') for (const s of c.series) expect(s.values[0], q.id).toBe(100);
          if (c.chart === 'cumulative') {
            // Running totals never fall; a running share ends at the whole.
            const values = c.series[0]!.values;
            for (let k = 1; k < values.length; k++) expect(values[k]!, q.id).toBeGreaterThan(values[k - 1]!);
            if (c.suffix === '%') expect(values.at(-1), q.id).toBe(100);
          }
          if (c.chart === 'waterfall') {
            // Starts on a total; each later total is the running total; the bars never dip below zero.
            const values = c.series[0]!.values;
            const totals = c.totals!;
            expect(totals[0], q.id).toBe(0);
            let running = 0;
            values.forEach((v, k) => {
              if (totals.includes(k)) {
                if (k > 0) expect(v, q.id).toBeCloseTo(running, 6);
                running = v;
              } else running += v;
              expect(running, q.id).toBeGreaterThan(0);
              expect(running <= c.axis!.max + 1e-9, `${q.id}: ${running} > ${c.axis!.max}`).toBe(true);
            });
            expect(totals.at(-1), q.id).toBe(values.length - 1);
          }
          if (c.chart === 'pie') {
            expect(c.axis, q.id).toBeUndefined();
            expect(c.labelled, q.id).toBe(true);
            continue;
          }
          const axis = c.axis!;
          expect(axis.step, q.id).toBeGreaterThan(0);
          const gaps = (axis.max - axis.min) / axis.step;
          expect(Math.abs(gaps - Math.round(gaps)), q.id).toBeLessThan(1e-9);
          expect(gaps, q.id).toBeGreaterThanOrEqual(3);
          expect(gaps, q.id).toBeLessThanOrEqual(10);
          if (c.chart === 'waterfall') {
            expect(axis.min, q.id).toBe(0);
            continue;
          }
          const stacked = c.chart === 'stacked-bar' || c.chart === 'stacked-bar-100';
          const tops = stacked ? sums : c.series.flatMap((s) => s.values);
          for (const v of tops) expect(v <= axis.max + 1e-9, `${q.id}: ${v} > ${axis.max}`).toBe(true);
          const lows = c.series.flatMap((s) => s.values);
          for (const v of lows) expect(v >= axis.min - 1e-9, `${q.id}: ${v} < ${axis.min}`).toBe(true);
          if (c.chart !== 'line' && c.chart !== 'indexed-line') expect(axis.min, q.id).toBe(0);
        }
      }
    });

    it('mark as correct the one option strictly closest to the answer recomputed from the charted values', () => {
      for (const q of questions) {
        const truth = solvers[template]!(q);
        expect(Number.isFinite(truth) && truth > 0, `${q.id}: ${truth}`).toBe(true);
        const values = optionValues(q);
        expect(values, q.id).toHaveLength(4);
        expect(new Set(values).size, q.id).toBe(4);
        expect([...values].sort((a, b) => a - b), q.id).toEqual(values);
        const distances = values.map((v) => Math.abs(v - truth));
        const best = closest(values, truth);
        expect(best, `${q.id}: truth ${truth}, options ${values}`).toBe(correctIndex(q));
        const runnerUp = Math.min(...distances.filter((_, i) => i !== best));
        expect(runnerUp - distances[best]!, `${q.id}: truth ${truth}, options ${values}`).toBeGreaterThan(Math.abs(truth) * 0.005);
      }
    });

    it('keep the correct option closest under any reasonable misreading of an estimated chart', () => {
      for (const q of questions) {
        const values = optionValues(q);
        for (const misread of misreadings(q, solvers[template]!)) {
          const truth = solvers[template]!(misread);
          expect(closest(values, truth), `${q.id}: misread answer ${truth}, options ${values}`).toBe(correctIndex(q));
        }
      }
    });

    it('ask for a calculation rather than a bare reading', () => {
      for (const q of questions) {
        const truth = solvers[template]!(q);
        const shown = charts(q).flatMap((c) => c.series.flatMap((s) => s.values));
        for (const v of shown) expect(Math.abs(v - truth), `${q.id}: answer ${truth} is a charted value`).toBeGreaterThan(truth * 0.01);
        expect(q.solution.length, q.id).toBeGreaterThan(1);
      }
    });

    it('give distractors the same trailing digit as the correct option where the answer can be worked out exactly', () => {
      // An answer read off gridlines has no exact last digit to work out, so no last-digit trick can find it.
      for (const q of questions) {
        if (q.answer.kind !== 'choice' || misreadings(q, solvers[template]!).length > 0) continue;
        const lastDigit = (text: string) => text.replace(/\D/g, '').at(-1);
        const correct = lastDigit(q.answer.options[q.answer.correctIndex]!);
        for (const option of q.answer.options) expect(lastDigit(option), `${q.id}: ${q.answer.options}`).toBe(correct);
      }
    });

    it('end the worked solution at the correct option and give a shortcut', () => {
      for (const q of questions) {
        if (q.answer.kind !== 'choice') continue;
        expect(q.shortcut.length, q.id).toBeGreaterThan(0);
        expect(q.solution.join(' '), q.id).toContain(q.answer.options[q.answer.correctIndex]!);
      }
    });

    it('never show malformed numbers', () => {
      for (const q of questions) for (const text of visibleText(q)) expect(text, q.id).not.toMatch(MALFORMED);
    });

    it('are reproduced exactly by the same seed, and vary across seeds', () => {
      for (const tier of TIERS) {
        expect(generate(skill, template, tier, 30)).toEqual(generate(skill, template, tier, 30));
        const distinct = new Set(generate(skill, template, tier, 100).map((q) => JSON.stringify(q.context)));
        expect(distinct.size, `tier ${tier}`).toBeGreaterThan(80);
      }
    });

    it('carry their skill, tier, source and a target time', () => {
      for (const q of questions.slice(0, 50)) {
        expect(q).toMatchObject({ skill, source: 'generated' });
        expect(q.targetTimeMs).toBeGreaterThan(30_000);
      }
    });
  });
});

describe('chart questions across skills', () => {
  const all = SKILLS.flatMap((skill) =>
    listTemplates(skill).flatMap((t) => TIERS.flatMap((tier) => generate(skill, t, tier, 30).map((q) => ({ skill, q })))),
  );

  it('label their values on some charts and leave others to be estimated from gridlines', () => {
    for (const skill of ['bar-charts', 'stacked-bar-charts', 'line-charts', 'cumulative-charts', 'waterfall-charts'] as ChartSkill[]) {
      const drawn = all.filter((x) => x.skill === skill).flatMap((x) => charts(x.q));
      expect(drawn.some((c) => c.labelled), skill).toBe(true);
      expect(drawn.some((c) => !c.labelled), skill).toBe(true);
    }
  });

  it('are multiple choice at every tier when no template is named', () => {
    for (const skill of SKILLS) for (const tier of TIERS) expect(createQuestion(skill, tier, createRandom(tier)).answer.kind).toBe('choice');
  });
});

describe('cumulative chart questions', () => {
  describe.each(listTemplates('cumulative-charts'))('template %s', (template) => {
    const questions = TIERS.flatMap((tier) => generate('cumulative-charts', template, tier, SEEDS_PER_TIER));

    it('offer the answer of a reader who takes a cumulative bar for the asked share, as a wrong option, wherever an option can sit on its side', () => {
      // The correct option's letter is drawn evenly first, so when it is the outermost on the trap's side the trap cannot be offered.
      let offered = 0;
      for (const q of questions) {
        const values = optionValues(q);
        const truth = cumulativeSolvers[template]!(q, stepReading);
        const trap = cumulativeSolvers[template]!(q, barReading);
        const room = trap > truth ? correctIndex(q) < 3 : correctIndex(q) > 0 && trap >= truth * 0.15;
        if (!room) continue;
        offered++;
        const nearest = closest(values, trap);
        expect(nearest, `${q.id}: trap ${trap}, options ${values}`).not.toBe(correctIndex(q));
        expect(Math.abs(values[nearest]! - trap), `${q.id}: trap ${trap}, options ${values}`).toBeLessThan(Math.abs(values[nearest]! - truth));
      }
      expect(offered / questions.length).toBeGreaterThan(0.7);
    });
  });
});

describe('pie-shift worked solutions', () => {
  const questions = TIERS.flatMap((tier) => generate('pie-charts', 'pie-shift', tier, SEEDS_PER_TIER));

  it('add and subtract per 100 of the total exactly, with no rounded sum', () => {
    for (const q of questions) {
      const line = q.solution.find((s) => s.startsWith('New total:'));
      if (!line) continue;
      const [, a, b, c, d] = /New total: ([\d.,]+) − ([\d.,]+) \+ ([\d.,]+) = ([\d.,]+)$/.exec(line)!.map((t) => num(t ?? ''));
      expect(a! - b! + c!, `${q.id}: ${line}`).toBeCloseTo(d!, 9);
    }
  });

  it('never print two multiplication signs in a row', () => {
    for (const q of questions) for (const text of visibleText(q)) expect(text, q.id).not.toMatch(/×\s*×/);
  });
});
