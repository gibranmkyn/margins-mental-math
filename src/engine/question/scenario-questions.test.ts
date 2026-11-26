import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, listSkills, listTemplates, markAnswer } from './index';
import type { Question, ScenarioSkill, Tier } from './index';
import { differ, evaluate, letters } from './test-support/formula';
import { after, cell, listItems, num, options, paragraphs, signedPercent, tables, visibleText } from './test-support/read';
import type { Solved } from './test-support/read';
import { coverageSolvers } from './test-support/solvers';
import { NO_BOOKLETS } from './test-support/booklets';

/**
 * Scenario questions are checked the way the owner meets them: every number is
 * read back out of the text on screen and the answer is recomputed from those
 * numbers alone, never from anything the engine computed.
 */

/** Every scenario skill the spec names (user story 20), in its order. */
const SCENARIO_SKILLS: ScenarioSkill[] = [
  'break-even-payback',
  'percentages-in-context',
  'growth-trends',
  'unit-economics',
  'ratios-comparisons',
  'averages-mixes',
  'building-formulas',
  'testing-statements',
  'expected-value',
];
const TIERS: Tier[] = [1, 2, 3];
const SEEDS_PER_TIER = 700;

// A minus sign is "−", never a hyphen: "-3" or "5 - 2" is malformed, as is a negative zero.
const MALFORMED = /NaN|undefined|null|Infinity|\d[eE][+-]?\d|(?<![\d.,])0\d|\d,(?=\d)(?!\d{3}(?!\d))|\.\d*\.|[-−]0(?![.\d])|(?<![\w-])-\d|\d\s+-\s+[\d$(]/;

// ---------- Independent solvers, one per template ----------

const firstSolvers: Record<string, (q: Question) => Solved> = {
  'break-even-volume': (q) => {
    // The price is a table row (tier 1) or the list's first item (tiers 2 and 3).
    const listed = listItems(q).find((item) => item.startsWith('Price:'));
    const price = listed ? num(/\$([\d,.]+)/.exec(listed)![1]!) : num(cell(q, /^Price per unit/));
    const variable = listOrCell(q, /^Variable cost/, price);
    const fixed = listOrCell(q, /fixed cost/i, price);
    return fixed / (price - variable);
  },
  'payback-savings': (q) => {
    // Rows: quantity per year, running cost per unit of quantity, then upkeep
    // as either a cost per year or visits per year × cost per visit.
    const rows = tables(q)[0]!.rows;
    const visits = rows.find((r) => /visits per year/.test(r[0]!));
    const perVisit = rows.find((r) => /^Cost per .* visit/.test(r[0]!));
    const upkeep = rows.find((r) => / per year$/.test(r[0]!) && r !== rows[0] && r !== visits);
    const annual = (col: number) =>
      num(rows[0]![col]!) * num(rows[1]![col]!) +
      (visits && perVisit ? num(visits[col]!) * num(perVisit[col]!) : num(upkeep![col]!));
    return after(q, /extra purchase price of/) / (annual(1) - annual(2));
  },
  'payback-ceiling': (q) => {
    // List: customers, fee per month, variable cost per month, two overheads, maybe a one-off campaign.
    const items = listItems(q);
    const value = (item: string) => num(item.split(':').at(-1)!);
    const [customers, fee, variable, overheadA, overheadB] = items.slice(0, 5).map(value) as [number, number, number, number, number];
    expect(items[2]).toMatch(/^Variable cost/);
    const campaign = items.find((i) => /^One-off/.test(i));
    const limit = /within ([\d.]+) (years|months)/.exec(q.prompt)!;
    const months = Number(limit[1]) * (limit[2] === 'years' ? 12 : 1);
    const monthlyProfit = customers * (fee - variable) - overheadA - overheadB;
    // Options are in $ thousands.
    return (monthlyProfit * months - (campaign ? value(campaign) : 0)) / 1_000;
  },
  'share-of-share': (q) => {
    // Respondents from the intro; the sideways table gives a share and a follow-on share per reason.
    const respondents = num(paragraphs(q));
    const table = tables(q)[0]!;
    const named = [...q.prompt.matchAll(/“([^”]+)”/g)].map((m) => m[1]!);
    const columns = named.length > 0 ? named.map((name) => table.headers.indexOf(name)) : table.headers.slice(1).map((_, i) => i + 1);
    return columns.reduce((sum, col) => {
      expect(col, q.prompt).toBeGreaterThan(0);
      return sum + (respondents * num(table.rows[0]![col]!) * num(table.rows[1]![col]!)) / 10_000;
    }, 0);
  },
  'price-volume': (q) => {
    // Several products are a table; one product is a list of "Header: value" items.
    const items = listItems(q);
    const table = tables(q)[0] ?? { headers: items.map((i) => i.slice(0, i.indexOf(':'))), rows: [items.map((i) => i.slice(i.indexOf(':') + 2))] };
    const column = (name: string) => table.headers.indexOf(name);
    const read = (row: string[], name: string) => (column(name) < 0 ? null : row[column(name)]!);
    const total = table.rows.reduce((sum, row) => {
      const volume = num(read(row, 'Units sold last year')!) * (1 + signedPercent(read(row, 'Volume change')!));
      const revenue = volume * num(read(row, 'Price last year')!) * (1 + signedPercent(read(row, 'Price change')!));
      const cost = read(row, 'Unit cost last year');
      const costs = cost === null ? 0 : volume * num(cost) * (1 + signedPercent(read(row, 'Unit cost change')!));
      return sum + revenue - costs;
    }, 0);
    // Options are in $m or $k, as the option text says.
    const options = q.answer.kind === 'choice' ? q.answer.options : [];
    return total / (options[0]!.endsWith('m') ? 1_000_000 : 1_000);
  },
};

/**
 * A cost given either as one table row, or as several list items that must be
 * added: "Fixed costs: rent $40,000 a year" etc. Lists win when present.
 */
function listOrCell(q: Question, label: RegExp, price: number): number {
  const items = listItems(q).filter((item) => label.test(item));
  if (items.length === 0) return num(cell(q, label));
  return items.reduce((sum, item) => {
    const value = num(item.split(':').at(-1)!);
    return sum + (/% of price/.test(item) ? (price * value) / 100 : value);
  }, 0);
}

// ---------- The properties every scenario template must keep ----------

const solvers: Record<string, (q: Question) => Solved> = { ...firstSolvers, ...coverageSolvers };

function optionValues(question: Question): number[] {
  if (question.answer.kind !== 'choice') throw new Error('not multiple choice');
  return question.answer.options.map(num);
}

function correctIndex(question: Question): number {
  if (question.answer.kind !== 'choice') throw new Error('not multiple choice');
  return question.answer.correctIndex;
}

function generate(skill: ScenarioSkill, template: string, tier: Tier, count: number, offset = 0): Question[] {
  return Array.from({ length: count }, (_, i) => createQuestion(skill, tier, createRandom(offset + i + 1), { template }));
}

describe.each(SCENARIO_SKILLS)('%s scenario questions', (skill) => {
  const templates = listTemplates(skill);

  it('come from at least three templates that each have an independent solver in this test', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3);
    for (const template of templates) expect(Object.keys(solvers)).toContain(template);
  });

  describe.each(templates)('template %s', (template) => {
    const questions = TIERS.flatMap((tier) => generate(skill, template, tier, SEEDS_PER_TIER));
    let memo: { q: Question; solved: Solved }[] | undefined;
    /** Every question with its independent solution, solved once on first use. */
    const solveAll = () => (memo ??= questions.map((q) => ({ q, solved: solvers[template]!(q) })));
    /** Numeric templates are judged by closeness; the rest (rankings, formulas, statements) option by option. */
    const isNumeric = () => solveAll().every(({ solved }) => typeof solved === 'number');

    it('are multiple choice with four distinct options', () => {
      for (const q of questions) {
        expect(q.answer.kind, q.id).toBe('choice');
        if (q.answer.kind !== 'choice') continue;
        expect(q.answer.options, q.id).toHaveLength(4);
        expect(new Set(q.answer.options).size, q.id).toBe(4);
      }
    });

    it('give numeric options as distinct values in ascending order', () => {
      if (!isNumeric()) return;
      for (const q of questions) {
        const values = optionValues(q);
        expect(new Set(values).size, q.id).toBe(4);
        expect([...values].sort((a, b) => a - b), q.id).toEqual(values);
      }
    });

    it('mark as correct the one option that the numbers shown, recomputed independently, make right or strictly closest', () => {
      for (const { q, solved: result } of solveAll()) {
        if (typeof result === 'number') {
          const truth = result;
          expect(Number.isFinite(truth) && truth > 0, `${q.id}: ${truth}`).toBe(true);
          const distances = optionValues(q).map((v) => Math.abs(v - truth));
          const best = Math.min(...distances);
          const bestIndex = distances.indexOf(best);
          expect(bestIndex, `${q.id}: truth ${truth}, options ${optionValues(q)}`).toBe(correctIndex(q));
          const runnerUp = Math.min(...distances.filter((_, i) => i !== bestIndex));
          // Strictly closest, by a clear margin rather than a rounding hair.
          expect(runnerUp - best, `${q.id}: truth ${truth}, options ${optionValues(q)}`).toBeGreaterThan(Math.abs(truth) * 0.005);
        } else {
          const right = result.judged.flatMap((ok, i) => (ok ? [i] : []));
          expect(right, `${q.id}: ${JSON.stringify(q.answer)}`).toEqual([correctIndex(q)]);
        }
      }
    });

    it('give numeric distractors the same trailing digit as the correct option', () => {
      if (!isNumeric()) return;
      for (const q of questions) {
        if (q.answer.kind !== 'choice') continue;
        const lastDigit = (text: string) => text.replace(/\D/g, '').at(-1);
        const correct = lastDigit(q.answer.options[q.answer.correctIndex]!);
        for (const option of q.answer.options) expect(lastDigit(option), `${q.id}: ${q.answer.options}`).toBe(correct);
      }
    });

    it('show business context with data, and end the worked solution at the correct option', () => {
      for (const q of questions) {
        if (q.answer.kind !== 'choice') continue;
        expect(q.context.length, q.id).toBeGreaterThan(0);
        expect(q.solution.length, q.id).toBeGreaterThan(1);
        expect(q.shortcut.length, q.id).toBeGreaterThan(0);
        expect(q.solution.join(' '), q.id).toContain(q.answer.options[q.answer.correctIndex]!);
      }
    });

    it('never show malformed numbers', () => {
      for (const q of questions) {
        for (const text of visibleText(q)) expect(text, q.id).not.toMatch(MALFORMED);
      }
    });

    it('vary where the correct option sits', () => {
      const positions = new Set(questions.map(correctIndex));
      expect(positions.size).toBeGreaterThanOrEqual(3);
    });

    it('are reproduced exactly by the same seed, and vary across seeds', () => {
      for (const tier of TIERS) {
        expect(generate(skill, template, tier, 50)).toEqual(generate(skill, template, tier, 50));
        const prompts = new Set(generate(skill, template, tier, 100).map((q) => JSON.stringify(q.context)));
        expect(prompts.size, `tier ${tier}`).toBeGreaterThan(80);
      }
    });

    it('carry their skill, tier, source and a target time', () => {
      for (const tier of TIERS) {
        for (const q of generate(skill, template, tier, 20)) {
          expect(q).toMatchObject({ skill, tier, source: 'generated' });
          expect(q.targetTimeMs).toBeGreaterThan(30_000);
        }
      }
    });
  });

  it('pick among their templates when none is named', () => {
    const ids = new Set(Array.from({ length: 300 }, (_, i) => createQuestion(skill, 1, createRandom(i)).id.replace(/-t[123]-\d+$/, '')));
    expect(ids.size).toBe(templates.length);
  });
});

describe('multiple-choice marking', () => {
  it('marks only the correct option as right and reports which option that was', () => {
    for (const skill of SCENARIO_SKILLS) {
      for (let seed = 1; seed <= 100; seed++) {
        const q = createQuestion(skill, 1, createRandom(seed));
        const right = correctIndex(q);
        for (let index = 0; index < 4; index++) {
          expect(markAnswer(q, { kind: 'choice', index })).toEqual({ correct: index === right, expected: right });
        }
      }
    }
  });
});

describe('statement-testing templates', () => {
  it('have exactly one true statement, judged independently from the data shown', () => {
    for (const template of listTemplates('testing-statements')) {
      for (const tier of TIERS) {
        for (const q of generate('testing-statements', template, tier, 300, 5_000)) {
          const verdict = solvers[template]!(q);
          if (typeof verdict === 'number') throw new Error('statements are judged one by one');
          expect(verdict.judged.filter(Boolean), q.id).toHaveLength(1);
        }
      }
    }
  });
});

describe('formula templates', () => {
  it('have exactly one correct formula and no distractor algebraically equivalent to it', () => {
    for (const template of listTemplates('building-formulas')) {
      for (const tier of TIERS) {
        for (const q of generate('building-formulas', template, tier, 300, 5_000)) {
          const verdict = solvers[template]!(q);
          if (typeof verdict === 'number') throw new Error('formulas are judged one by one');
          expect(verdict.judged.filter(Boolean), q.id).toHaveLength(1);
          const all = options(q);
          const correct = all[correctIndex(q)]!;
          for (const distractor of all.filter((o) => o !== correct)) {
            expect(differ(correct, distractor, letters(q)), `${q.id}: ${distractor} vs ${correct}`).toBe(true);
          }
        }
      }
    }
  });

  it('are read the way they are written', () => {
    // Worked examples for the formula reader the solvers rely on.
    expect(evaluate('(p − c) × 1,000 ÷ v', { p: 4.2, c: 1.7, v: 0.5 })).toBeCloseTo(5_000);
    expect(evaluate('(B + E × S × 2%) ÷ (8 × 5 × 46)', { B: 36_800, E: 10, S: 18_400 })).toBeCloseTo(22);
    expect(evaluate('(p × (1 − d%) − c)', { p: 10, d: 20, c: 3 })).toBeCloseTo(5);
    expect(differ('(w + n) ÷ 160', 'w ÷ 160 + n ÷ 160', ['w', 'n'])).toBe(false);
    expect(differ('(w + n) ÷ 160', 'w ÷ 160', ['w', 'n'])).toBe(true);
  });
});

describe('generated scenario questions and the booklets', () => {
  const booklets = Object.values(
    import.meta.glob<{ default: { caseTitle: string; question: string; context: { text?: string; items?: string[] }[] }[] }>(
      '../../../content/booklets/*.json',
      { eager: true },
    ),
  ).flatMap((m) => m.default);
  const words = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? [];
  /** Every run of eight words: the length at which shared wording stops being coincidence. */
  const runs = (text: string) => {
    const w = words(text);
    return w.slice(0, Math.max(0, w.length - 7)).map((_, i) => w.slice(i, i + 8).join(' '));
  };
  const bookletRuns = new Set(
    booklets.flatMap((b) => runs([b.question, ...b.context.flatMap((c) => [c.text ?? '', ...(c.items ?? [])])].join(' '))),
  );
  const names = [...new Set(booklets.map((b) => b.caseTitle.replace(/\s*\(.*\)$/, '').replace(/ (ltd|inc)\.?$/i, '')))];

  it.skipIf(NO_BOOKLETS)('borrow neither the booklets’ company names nor their wording', () => {
    expect(booklets.length).toBeGreaterThan(90);
    for (const skill of SCENARIO_SKILLS) {
      for (const template of listTemplates(skill)) {
        for (const tier of TIERS) {
          for (const q of generate(skill, template, tier, 30, 9_000)) {
            const text = visibleText(q).join(' ').toLowerCase();
            for (const name of names) {
              const asWord = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`);
              expect(text, `${q.id} uses ${name}`).not.toMatch(asWord);
            }
            for (const run of runs(visibleText(q).join(' '))) expect(bookletRuns.has(run), `${q.id}: "${run}"`).toBe(false);
          }
        }
      }
    }
  });
});

describe('scenario skill listing', () => {
  it('lists every scenario skill the spec names, and only those, at three tiers', () => {
    const listed = listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : []));
    expect([...listed].sort()).toEqual([...SCENARIO_SKILLS].sort());
    for (const skill of SCENARIO_SKILLS) {
      const info = listSkills().find((s) => s.skill === skill);
      expect(info).toMatchObject({ kind: 'scenario', tiers: [1, 2, 3] });
      expect(info?.sources).toEqual(expect.arrayContaining(['generated', 'authored']));
    }
  });
});

describe('payback-ceiling worked solutions', () => {
  const questions = TIERS.flatMap((tier) => generate('break-even-payback', 'payback-ceiling', tier, 120));

  it('name the margin after what is sold: a member, a desk or a unit', () => {
    for (const q of questions) {
      const listed = q.context.flatMap((b) => (b.type === 'list' ? b.items : [])).join(' ');
      const one = /desk/i.test(listed) ? 'desk' : /unit/i.test(listed) ? 'unit' : 'member';
      expect(q.solution[0], q.id).toMatch(new RegExp(`^Margin per ${one}:`));
    }
  });

  it('never route a payback in months through a year it does not divide into', () => {
    for (const q of questions) {
      const months = Number(/within (\d+) months/.exec(q.prompt)?.[1] ?? 12);
      if (months % 12 !== 0) expect(q.shortcut, q.id).not.toMatch(/× 12/);
    }
  });
});

describe('missing-count shortcuts', () => {
  it('work the two-group count as a share of the total and land on the answer', () => {
    for (const q of generate('averages-mixes', 'missing-count', 1, 150)) {
      if (q.answer.kind !== 'choice') continue;
      expect(q.shortcut, q.id).toMatch(/of the way/);
      expect(q.shortcut, q.id).toContain(q.answer.options[q.answer.correctIndex]!);
      expect(q.shortcut, q.id).not.toMatch(/ratio/);
    }
  });
});

describe('weighted-price tables', () => {
  /** The roundest step a value in cents sits on: $73.05 is on 5¢, $75 on $5. */
  const fineness = (cents: number) => [500, 100, 50, 10, 5, 1].find((d) => cents % d === 0)!;
  const cents = (text: string) => Math.round(num(text.replace('$', '')) * 100);

  it('print gross profits no finer than the prices beside them (to the half dollar)', () => {
    for (const q of generate('averages-mixes', 'weighted-price', 3, 200)) {
      const table = q.context.find((b) => b.type === 'table')!;
      if (table.type !== 'table') continue;
      const finest = Math.min(50, ...table.rows.map((r) => fineness(cents(r[2]!))));
      for (const r of table.rows) expect(fineness(cents(r[3]!)), `${q.id}: ${r.join(' | ')}`).toBeGreaterThanOrEqual(finest);
    }
  });
});

describe('scenario layout', () => {
  it('never draws a table of one row: a single record reads better as a list on a phone', () => {
    for (const skill of SCENARIO_SKILLS) {
      for (const template of listTemplates(skill)) {
        for (const q of TIERS.flatMap((tier) => generate(skill, template, tier, 40))) {
          for (const block of q.context) if (block.type === 'table') expect(block.rows.length, `${q.id}: ${block.title}`).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe('statement thresholds', () => {
  it('sit close enough to the true figure that the statement needs working, yet clear of it', () => {
    for (const template of ['statement-growth', 'statement-margin']) {
      for (const q of TIERS.flatMap((tier) => generate('testing-statements', template, tier, 150))) {
        if (q.answer.kind !== 'choice') continue;
        q.answer.options.forEach((option, i) => {
          const stated = /than (\d+(?:\.\d+)?)%/.exec(option);
          const actual = /= ([\d.,−]+)%(?: a year)?$/.exec(q.solution[i]!);
          if (!stated || !actual) return;
          const [x, a] = [Number(stated[1]), num(actual[1]!.replace('−', '-'))];
          const gap = Math.abs(x - a);
          expect(gap, `${q.id}: "${option}" against ${a}%`).toBeLessThanOrEqual(Math.max(3, Math.abs(a) * 0.12));
          expect(gap, `${q.id}: "${option}" against ${a}%`).toBeGreaterThanOrEqual(Math.min(1, Math.abs(a) * 0.04));
        });
      }
    }
  });
});

describe('formula-headcount tables', () => {
  it('quote hourly pay in round half dollars, as a payroll would', () => {
    for (const q of TIERS.flatMap((tier) => generate('building-formulas', 'formula-headcount', tier, 60))) {
      const table = q.context.find((b) => b.type === 'table');
      if (table?.type !== 'table') continue;
      for (const rate of table.rows[0]!.slice(1)) expect(rate, q.id).toMatch(/^\$\d+\.(00|50)$/);
    }
  });
});
