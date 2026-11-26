import { expect } from 'vitest';
import type { Question } from '../types';
import { after, column, isMore, isStated, listItems, listValue, num, options, paragraphs, rankBy, tables } from './read';
import type { Solved } from './read';
import { judgeFormulas, letter, letters } from './formula';

/** The percentage in the list item that matches, or 0 when the item is absent. */
function itemPercent(q: Question, label: RegExp): number {
  const item = listItems(q).find((i) => label.test(i));
  return item ? num(/(\d+(?:\.\d+)?)%/.exec(item)![1]!) / 100 : 0;
}

/** Independent solvers for the scenario templates beyond the first five, keyed by template name. */
export const coverageSolvers: Record<string, (q: Question) => Solved> = {
  'markup-discount': (q) => {
    // Cost 1: shelf price 1 + markup, paid after the discount, fee charged on what is paid.
    const markup = itemPercent(q, /^Shelf price/);
    const discount = itemPercent(q, /off the shelf price/);
    const fee = itemPercent(q, /of the price the customer pays/);
    const paid = (1 + markup) * (1 - discount);
    return ((paid - 1 - fee * paid) / paid) * 100;
  },
  'growth-rate': (q) => {
    // Sum the rows the prompt names, in the two years it names; compound when it asks for a yearly rate.
    const table = tables(q)[0]!;
    const [from, to] = /between (\d{4}) and (\d{4})/.exec(q.prompt)!.slice(1).map(Number) as [number, number];
    const rows = table.rows.filter((r) => q.prompt.includes(` ${r[0]} `));
    const at = (year: number) => rows.reduce((sum, r) => sum + num(r[table.headers.indexOf(String(year))]!), 0);
    const factor = at(to) / at(from);
    return /annual/.test(q.prompt) ? (factor ** (1 / (to - from)) - 1) * 100 : (factor - 1) * 100;
  },
  'share-shift': (q) => {
    // Grow the starting level by the yearly factor; the answer is the smallest option year past the threshold.
    const text = paragraphs(q);
    const rates = [...text.matchAll(/by (\d+)% a year/g)].map((m) => Number(m[1]) / 100);
    const absolute = /exceeds \$?([\d,]+)/.exec(q.prompt);
    let level: number;
    let target: number;
    let factor: number;
    if (absolute) {
      level = num(/ is \$?([\d,]+)/.exec(text)![1]!);
      target = num(absolute[1]!);
      factor = 1 + rates[0]!;
    } else {
      const table = tables(q)[0];
      level = table
        ? (num(table.rows[0]![1]!) / table.rows.reduce((sum, r) => sum + num(r[1]!), 0)) * 100
        : num(/makes up (\d+)%/.exec(text)![1]!);
      target = num(/more than (\d+)%/.exec(q.prompt)![1]!);
      factor = (1 + rates[0]!) / (1 + rates[1]!);
    }
    const years = options(q).map(num);
    const past = years.map((n) => isMore(level * factor ** n, target, 0.02));
    return { judged: past.map((ok, i) => ok && years.every((n, j) => !(n < years[i]! && past[j]))) };
  },
  'growth-projection': (q) => {
    // Each named line grows again by its own factor: later = now × now ÷ then; profit applies the margin column.
    const table = tables(q)[0]!;
    const [then, now] = [table.headers[1]!, table.headers[2]!];
    const marginCol = table.headers.findIndex((h) => /margin/i.test(h));
    const rows = /all three/.test(q.prompt) ? table.rows : table.rows.filter((r) => q.prompt.includes(r[0]!));
    expect(rows.length).toBeGreaterThan(0);
    expect(q.prompt).toContain(`from ${then} to ${now}`);
    return rows.reduce((sum, r) => {
      const projected = num(r[2]!) ** 2 / num(r[1]!);
      return sum + projected * (marginCol > 0 ? num(r[marginCol]!) / 100 : 1);
    }, 0);
  },
  'cost-per-unit': (q) => {
    // The week's cost (one figure, or lines with staff built from people × hours × rate) over the week's volume.
    // One row per day: Day | Volume.
    const volume = tables(q)[0]!.rows.reduce((sum, r) => sum + num(r[1]!), 0);
    const items = listItems(q);
    const cost =
      items.length === 0
        ? after(q, /total cost last week was/)
        : items.reduce((sum, item) => {
            const people = /(\d+) people, each paid for ([\d.]+) hours a week at \$([\d.]+) an hour/.exec(item);
            return sum + (people ? Number(people[1]) * Number(people[2]) * Number(people[3]) : num(item.split(':').at(-1)!));
          }, 0);
    return cost / volume;
  },
  'supplier-switch': (q) => {
    // Profit before and after, from the list; each option states a signed change to test against it.
    const value = (label: RegExp) => listValue(q, label);
    const items = listItems(q);
    const volume = value(/^Units sold a year now/);
    const price = value(/^Selling price now/);
    const other = value(/^Other costs/);
    const costs = items.filter((i) => /^Purchase cost of/.test(i));
    const costNow = num(costs[0]!.split(':')[1]!);
    const next = costs[1]!.split(':')[1]!;
    const tiered = /for the first ([\d,]+) a year, then \$([\d.]+)/.exec(next);
    const priceNextItem = items.find((i) => /^Selling price with/.test(i));
    const priceNext = priceNextItem ? num(priceNextItem.split(':')[1]!) : price;
    const growth = /sells (\d+)% more/.exec(q.prompt);
    const volumeNext = volume * (1 + (growth ? Number(growth[1]) : 0) / 100);
    const purchases = tiered
      ? num(tiered[1]!) * num(next) + (volumeNext - num(tiered[1]!)) * Number(tiered[2])
      : volumeNext * num(next);
    const change = volumeNext * (priceNext - other) - purchases - volume * (price - costNow - other);
    return { judged: options(q).map((o) => isStated((/falls/.test(o) ? -1 : 1) * num(o.replace(/^\D+/, '')), change, 1)) };
  },
  'price-point': (q) => {
    // Weekly profit at each price in the table, extras included; the best must beat the next by a clear margin.
    const table = tables(q)[0]!;
    const cost = listValue(q, /^Cost of providing/);
    const extrasItem = listItems(q).find((i) => /also spends/.test(i));
    const extra = extrasItem ? num(/spends \$([\d,.]+)/.exec(extrasItem)![1]!) * (num(/margin of (\d+)%/.exec(extrasItem)![1]!) / 100) : 0;
    const profitAt = new Map(
      table.rows.map((r) => [r[0]!, num(r[1]!) * ((num(r[0]!) - cost) * (r[2] === undefined ? 1 : num(r[2])) + extra)]),
    );
    const [best, second] = [...profitAt.entries()].sort((a, b) => b[1] - a[1]);
    isMore(best![1], second![1], 0.03);
    return { judged: options(q).map((o) => o === best![0]) };
  },
  'rank-ratio': (q) => {
    // "by <numerator> per <denominator>": find both columns by name; profit multiplies by the margin column.
    const table = tables(q)[0]!;
    const [, measure, unit, direction] = /by (.+?) per (.+?), from (\w+)/.exec(q.prompt)!;
    const denominator = table.headers.findIndex((h) => h.toLowerCase().startsWith(unit!.split(' ')[0]!));
    const margin = table.headers.findIndex((h) => /margin/i.test(h));
    const numerator = table.headers.findIndex((h, i) => i > 0 && i !== denominator && i !== margin && (measure === 'profit' || h.toLowerCase().startsWith(measure!)));
    expect(Math.min(denominator, numerator)).toBeGreaterThan(0);
    const values = new Map(
      table.rows.map((r) => [r[0]!, (num(r[numerator]!) * (margin > 0 ? num(r[margin]!) / 100 : 1)) / num(r[denominator]!)]),
    );
    const ranking = rankBy(values, direction === 'lowest').join(', ');
    return { judged: options(q).map((o) => o === ranking) };
  },
  'highest-ratio': (q) => {
    // What each measure means, as a reader of the prompt would build it from the columns.
    const table = tables(q)[0]!;
    const measure = /comes out highest on (.+)\?$/.exec(q.prompt)![1]!;
    const col = (header: RegExp) => column(table, header).map(num);
    const builders: Record<string, () => number[]> = {
      'average household income in US dollars': () => zip(col(/income/), col(/per US dollar/), (i, r) => i / r),
      'revenue per passenger': () => zip(col(/Revenue/), col(/Passengers/), (r, p) => r / p),
      'coffee consumption per person, in litres': () => zip(col(/Cups/), col(/cup size/), (c, s) => c * s),
      'number of visits per month': () => zip(col(/^Members/), col(/Visits per member/), (m, v) => m * v),
      'number of cups sold per café': () => zip(zip(col(/Population/), col(/Cups/), (p, c) => p * c), col(/Cafés/), (x, n) => x / n),
      'number of purchases per checkout': () => zip(zip(col(/Visitors/), col(/Share/), (v, s) => (v * s) / 100), col(/Checkouts/), (x, n) => x / n),
    };
    expect(Object.keys(builders)).toContain(measure);
    const values = builders[measure]!();
    const [best, second] = [...values].sort((a, b) => b - a);
    isMore(best!, second!, 0.02);
    const winner = table.rows[values.indexOf(best!)]![0]!;
    return { judged: options(q).map((o) => o === winner || o.endsWith(` ${winner}`)) };
  },
  'same-ratio': (q) => {
    // The named row's share of its own total, applied to the grand total; less today's part when asked how much more.
    const table = tables(q)[0]!;
    const name = / as ([\w-]+)[,.]/.exec(q.prompt)![1]!;
    const totals = table.headers[2] === 'Total';
    const totalOf = (r: string[]) => (totals ? num(r[2]!) : num(r[1]!) + num(r[2]!));
    const row = table.rows.find((r) => r[0] === name)!;
    const projected = (num(row[1]!) / totalOf(row)) * table.rows.reduce((sum, r) => sum + totalOf(r), 0);
    return /exceed today/.test(q.prompt) ? projected - table.rows.reduce((sum, r) => sum + num(r[1]!), 0) : projected;
  },
  'weighted-price': (q) => {
    // Share-weighted price (and profit); the margin is the ratio of the two weighted averages.
    const table = tables(q)[0]!;
    const shares = column(table, /^Share/).map((v) => num(v) / 100);
    const prices = column(table, /^Price/).map(num);
    const averagePrice = shares.reduce((sum, s, i) => sum + s * prices[i]!, 0);
    if (/average price/.test(q.prompt)) return averagePrice;
    const profitColumn = table.headers.some((h) => /^Gross profit/.test(h));
    const averageProfit = profitColumn
      ? shares.reduce((sum, s, i) => sum + s * num(column(table, /^Gross profit/)[i]!), 0)
      : after(q, /gross profit of/);
    return (averageProfit / averagePrice) * 100;
  },
  'average-per-head': (q) => {
    // The years named in the prompt; each year's revenue (all lines) over its headcount (all lines), then averaged.
    const table = tables(q)[0]!;
    const [from, to] = /(\d{4}) to (\d{4})/.exec(q.prompt)!.slice(1).map(Number) as [number, number];
    const rows = table.rows.filter((r) => Number(r[0]) >= from && Number(r[0]) <= to);
    expect(rows.length).toBe(to - from + 1);
    const revenueCols = table.headers.flatMap((h, i) => (/revenue/i.test(h) ? [i] : []));
    const headCols = table.headers.flatMap((h, i) => (i > 0 && !/revenue/i.test(h) ? [i] : []));
    const perYear = rows.map((r) => {
      const revenue = revenueCols.reduce((sum, c) => sum + num(r[c]!), 0);
      return headCols.length === 0 ? revenue : revenue / headCols.reduce((sum, c) => sum + num(r[c]!), 0);
    });
    return perYear.reduce((a, b) => a + b, 0) / perYear.length;
  },
  'missing-count': (q) => {
    const text = paragraphs(q);
    const table = tables(q)[0];
    if (table) {
      // Strip the flat uplift from the projected total, then the top group counts double.
      const counts = table.rows.map((r) => num(r[1]!));
      const uplift = after(q, /yearly gift by/);
      const total = after(q, /bringing the total to/);
      expect(text).toMatch(/twice as much/);
      const light = (total - uplift * counts.reduce((a, b) => a + b, 0)) / (counts[1]! + 2 * counts[2]!);
      return 2 * light;
    }
    // Groups balance around the overall average: Σ count × (group average − overall) = 0.
    const total = after(q, /It has/);
    const overall = num(/of \$?([\d,]+(?:\.\d+)?)(?: thousand| litres)? across/.exec(text)![1]!);
    const asked = /are (.+?) \w+\?$/.exec(q.prompt)![1]!;
    const averageOf = (item: string) => num(/of \$?([\d,]+(?:\.\d+)?)(?: thousand| litres)?$/.exec(item)![1]!);
    const items = listItems(q);
    const askedAverage = averageOf(items.find((i) => i.startsWith(`${asked} `))!);
    const known = /([\d,]+) of them are (.+?) \w+\./.exec(text);
    const knownCount = known ? num(known[1]!) : 0;
    const knownAverage = known ? averageOf(items.find((i) => i.startsWith(`${known[2]} `))!) : 0;
    const otherAverage = averageOf(items.find((i) => !i.startsWith(`${asked} `) && !(known && i.startsWith(`${known[2]} `)))!);
    const rest = total - knownCount;
    return (total * overall - knownCount * knownAverage - rest * otherAverage) / (askedAverage - otherAverage);
  },
  'formula-per-unit': (q) => {
    // Profit per item (after any discount) spread over the item's size, scaled to the unit asked for.
    const [p, c, v] = [letter(q, /selling price/), letter(q, /cost of making/), letter(q, /^(volume|weight|minutes)/)];
    const discount = /discount of (\w+)%/.exec(q.prompt)?.[1];
    const scale = /per 1,000 |per tonne/.test(q.prompt) ? 1_000 : /per hour/.test(q.prompt) ? 60 : 1;
    const truth = (x: Record<string, number>) => ((x[p]! * (1 - (discount ? x[discount]! / 100 : 0)) - x[c]!) * scale) / x[v]!;
    // The products in the table are real values to test against too.
    const table = tables(q)[0]!;
    const d = /d = (\d+)%/.exec(table.title ?? '');
    const shown = table.rows.map((r) =>
      Object.fromEntries([...table.headers.slice(1).map((h, i) => [h.split(' ')[0]!, num(r[i + 1]!)]), ...(d ? [['d', Number(d[1])]] : [])]),
    );
    return { judged: judgeFormulas(options(q), letters(q), truth, shown) };
  },
  'formula-pay': (q) => {
    // Base plus count × value × rate for each commission, less any deduction, over the hours worked in a year.
    const base = letter(q, /base salary/);
    const commissions = listItems(q).flatMap((item) => {
      const earns = /^(\w+) = .* of one (.+?), in \$ \(.* earns (\d+)% of it\)/.exec(item);
      return earns ? [{ value: earns[1]!, count: letter(q, new RegExp(`^number of ${earns[2]}s`)), rate: Number(earns[3]) }] : [];
    });
    expect(commissions.length).toBeGreaterThan(0);
    const works = /working year is (\d+) weeks of (\d+) days, (\d+) hours a day/.exec(q.prompt);
    const hoursLetter = works ? null : letter(q, /hours worked/);
    const deducted = listItems(q).some((i) => /deducted/.test(i)) ? letter(q, /deducted/) : null;
    const truth = (x: Record<string, number>) => {
      const pay = x[base]! + commissions.reduce((sum, c) => sum + (x[c.count]! * x[c.value]! * c.rate) / 100, 0);
      const hours = works ? Number(works[1]) * Number(works[2]) * Number(works[3]) : x[hoursLetter!]!;
      return (pay * (deducted ? 1 - x[deducted]! / 100 : 1)) / hours;
    };
    const table = tables(q)[0]!;
    const shown = table.rows.map((r) => Object.fromEntries(table.headers.slice(1).map((h, i) => [h.split(' ')[0]!, num(r[i + 1]!)])));
    return { judged: judgeFormulas(options(q), letters(q), truth, shown) };
  },
  'statement-growth': (q) => {
    // Read each statement's claim and test it against the table, refusing any call that rests on a rounding hair.
    const table = tables(q)[0]!;
    const row = (name: string) => table.rows.find((r) => r[0]!.toLowerCase() === name.toLowerCase())!;
    const at = (r: string[], year: string) => num(r[table.headers.indexOf(year)]!);
    const growth = (r: string[], a: string, b: string) => (at(r, b) / at(r, a) - 1) * 100;
    const claim = (actual: number, side: string, x: string) => (side === 'more' ? isMore(actual, Number(x)) : isMore(Number(x), actual));
    return {
      judged: options(q).map((o) => {
        let m: RegExpExecArray | null;
        if ((m = /^Revenue in (.+) grew by an average of (more|less) than (\d+)% a year between (\d{4}) and (\d{4})$/.exec(o))) {
          const years = Number(m[5]) - Number(m[4]);
          return claim(((at(row(m[1]!), m[5]!) / at(row(m[1]!), m[4]!)) ** (1 / years) - 1) * 100, m[2]!, m[3]!);
        }
        if ((m = /^Revenue in (.+) grew by (more|less) than (\d+)% between (\d{4}) and (\d{4})$/.exec(o))) {
          return claim(growth(row(m[1]!), m[4]!, m[5]!), m[2]!, m[3]!);
        }
        if ((m = /^Revenue in (.+) grew faster than revenue in (.+) between (\d{4}) and (\d{4})$/.exec(o))) {
          return isMore(growth(row(m[1]!), m[3]!, m[4]!), growth(row(m[2]!), m[3]!, m[4]!), 0.05);
        }
        if ((m = /^Total revenue grew by (more|less) than (\d+)% between (\d{4}) and (\d{4})$/.exec(o))) {
          const total = (year: string) => table.rows.filter((r) => r[0] !== 'Total').reduce((sum, r) => sum + at(r, year), 0);
          return claim((total(m[4]!) / total(m[3]!) - 1) * 100, m[1]!, m[2]!);
        }
        if ((m = /^(.+) accounted for (more|less) than (\d+)% of total revenue in (\d{4})$/.exec(o))) {
          const total = table.rows.filter((r) => r[0] !== 'Total').reduce((sum, r) => sum + at(r, m![4]!), 0);
          return claim((at(row(m[1]!), m[4]!) / total) * 100, m[2]!, m[3]!);
        }
        throw new Error(`Unrecognised statement: ${o}`);
      }),
    };
  },
  'statement-margin': (q) => {
    // Profit = revenue × margin and costs = revenue − profit, built from the table, then each claim tested.
    const table = tables(q)[0]!;
    const year = (y: string) => {
      const r = table.rows.find((row) => row[0] === y)!;
      const revenue = num(r[1]!);
      const profit = (revenue * num(r[2]!)) / 100;
      return { revenue, profit, cost: revenue - profit };
    };
    const claim = (actual: number, side: string, x: string) => (side === 'more' ? isMore(actual, num(x)) : isMore(num(x), actual));
    return {
      judged: options(q).map((o) => {
        let m: RegExpExecArray | null;
        if ((m = /^Profit was higher in (\d{4}) than in (\d{4})$/.exec(o))) return isMore(year(m[1]!).profit, year(m[2]!).profit, 0.03);
        if ((m = /^Costs were (more|less) than \$([\d,]+) million in (\d{4})$/.exec(o))) return claim(year(m[3]!).cost, m[1]!, m[2]!);
        if ((m = /^Revenue from (\d{4}) to (\d{4}) added up to (more|less) than \$([\d,]+) million$/.exec(o))) {
          const total = table.rows.filter((r) => r[0]! >= m![1]! && r[0]! <= m![2]!).reduce((sum, r) => sum + num(r[1]!), 0);
          return claim(total, m[3]!, m[4]!);
        }
        if ((m = /^Profit grew by (more|less) than (\d+)% between (\d{4}) and (\d{4})$/.exec(o))) {
          return claim((year(m[4]!).profit / year(m[3]!).profit - 1) * 100, m[1]!, m[2]!);
        }
        if ((m = /^Costs grew faster than revenue between (\d{4}) and (\d{4})$/.exec(o))) {
          const [a, b] = [year(m[1]!), year(m[2]!)];
          return isMore(b.cost / a.cost, b.revenue / a.revenue, 0.005);
        }
        throw new Error(`Unrecognised statement: ${o}`);
      }),
    };
  },
  'statement-funnel': (q) => {
    // Shares of shares multiply down the tables; shares within one group add.
    const [split, outcomes, sub] = tables(q);
    const share = (table: typeof split, label: string) => {
      const row = table!.rows.find((r) => r[0]!.toLowerCase() === label.toLowerCase());
      if (!row) throw new Error(`No row ${label}`);
      return num(row[1]!);
    };
    const outcomeShare = (phrase: string) =>
      phrase.split(' or ').reduce((sum, part) => {
        const [main, deeper] = part.split(' and ');
        return sum + share(outcomes, main!) * (deeper ? share(sub, deeper) / 100 : 1);
      }, 0);
    return {
      judged: options(q).map((o) => {
        let m: RegExpExecArray | null;
        if ((m = /^([\d.]+)% of all (\w+) were (\w+) \2 who (.+)$/.exec(o))) {
          return isStated(Number(m[1]), (share(split, m[3]!) * outcomeShare(m[4]!)) / 100, 0.01);
        }
        if ((m = /^More (\w+) were (\w+) \1 who (.+) than were (\w+) \1$/.exec(o))) {
          return isMore((share(split, m[2]!) * outcomeShare(m[3]!)) / 100, share(split, m[4]!), 0.05);
        }
        if ((m = /^([\d.]+)% of (\w+) (\w+) (.+)$/.exec(o))) return isStated(Number(m[1]), outcomeShare(m[4]!), 0.01);
        throw new Error(`Unrecognised statement: ${o}`);
      }),
    };
  },
  'risk-ranking': (q) => {
    // Expected cost = probability × cost if it happens (months × monthly loss when given that way).
    const table = tables(q)[0]!;
    const probability = column(table, /^Probability/).map((v) => num(v) / 100);
    const months = table.headers.some((h) => /^Months/.test(h)) ? column(table, /^Months/).map(num) : null;
    const cost = months ? column(table, /lost per month/).map((v, i) => num(v) * months[i]!) : column(table, /^Cost if/).map(num);
    const values = new Map(table.rows.map((r, i) => [r[0]!, probability[i]! * cost[i]!]));
    const ranking = rankBy(values, /from the one to worry about least/.test(q.prompt)).join(', ');
    return { judged: options(q).map((o) => o === ranking) };
  },
  'expected-payoff': (q) => {
    // Probability-weighted profits (a leading minus sign is a loss), less any sure spend or forgone certain profit.
    const money = (text: string) => (/^\s*−/.test(text) ? -1 : 1) * num(text);
    const table = tables(q)[0];
    if (!table) {
      const chance = listValue(q, /^Chance of success/) / 100;
      const payoff = money(listItems(q).find((i) => /^Payoff/.test(i))!.split(': ').at(-1)!);
      const cost = money(listItems(q).find((i) => /^Cost of trying/.test(i))!.split(': ').at(-1)!);
      return chance * payoff - cost;
    }
    const expected = table.rows.reduce((sum, r) => sum + (num(r[1]!) / 100) * money(r[2]!), 0);
    const text = paragraphs(q);
    const spend = /must spend \$([\d,.]+) million/.exec(text);
    const certain = /certain profit of \$([\d,.]+) million/.exec(text);
    return expected - (spend ? num(spend[1]!) : 0) - (certain ? num(certain[1]!) : 0);
  },
  'break-even-probability': (q) => {
    // p × (payoff − follow-up cost) + (1 − p) × salvage = cost, solved for p.
    const value = (label: RegExp) => (listItems(q).some((i) => label.test(i)) ? listValue(q, label) : 0);
    const cost = value(/^Cost of/);
    const payoff = value(/^Payoff if/);
    const salvage = value(/value .* if/i);
    const extra = value(/^Extra /);
    return ((cost - salvage) / (payoff - extra - salvage)) * 100;
  },
  'formula-headcount': (q) => {
    // Paid hours (worked or not) over hours per employee give headcount; work and cost follow from it.
    const [h, w, n, r] = [letter(q, /per month$/), letter(q, /^paid hours spent working/), letter(q, /^paid hours not spent/), letter(q, /rate of pay/)];
    const month = num(/paid for (\d+) hours a month/.exec(q.prompt)![1]!);
    const employees = (x: Record<string, number>) => (x[w]! + x[n]!) / month;
    const truth = /number of employees/.test(q.prompt)
      ? employees
      : /per employee/.test(q.prompt)
        ? (x: Record<string, number>) => x[h]! / employees(x)
        : (x: Record<string, number>) => (x[r]! * (x[w]! + x[n]!)) / x[h]!;
    const table = tables(q)[0]!;
    const shown = table.headers.slice(1).map((_, col) =>
      Object.fromEntries(table.rows.map((row) => [/\((\w)[,)]/.exec(row[0]!)![1]!, num(row[col + 1]!)])),
    );
    return { judged: judgeFormulas(options(q), letters(q), truth, shown) };
  },
};

function zip(a: number[], b: number[], f: (x: number, y: number) => number): number[] {
  return a.map((x, i) => f(x, b[i]!));
}
