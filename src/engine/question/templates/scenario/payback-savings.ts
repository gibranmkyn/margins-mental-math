import { formatFixed, formatNumber as f } from '../../format';
import { randomInt } from '../../random';
import type { ScenarioTemplate } from '../template';
import { choiceOptions } from './options';
import { approx, cents, money, pick, randomStep } from './text';

interface Setting {
  intro: string;
  current: string;
  next: string;
  /** "each electric van" */
  each: string;
  /** "van", for the table title. */
  thing: string;
  quantity: { label: string; unit: string; range: [number, number]; step: number };
  /** Running cost per unit of quantity, in cents: current model range, new model range. */
  rate: { label: string; current: [number, number]; next: [number, number] };
  /** Upkeep: annual cost at tiers 1 and 2; visits × cost per visit at tier 3. */
  upkeep: { name: string; visit: string; perYear: [number, number]; visitCost: [number, number] };
}

const SETTINGS: Setting[] = [
  {
    intro: 'A parcel courier is deciding whether to replace its diesel vans with electric vans as they come up for renewal.',
    current: 'Diesel van',
    next: 'Electric van',
    each: 'each electric van',
    thing: 'van',
    quantity: { label: 'Distance driven per year', unit: 'km', range: [20_000, 60_000], step: 1_000 },
    rate: { label: 'Energy cost per km', current: [16, 30], next: [4, 10] },
    upkeep: { name: 'Servicing', visit: 'Service', perYear: [600, 2_400], visitCost: [150, 450] },
  },
  {
    intro: 'A hotel group is considering new commercial washing machines for its laundry rooms.',
    current: 'Current machine',
    next: 'New machine',
    each: 'each new machine',
    thing: 'machine',
    quantity: { label: 'Loads washed per year', unit: 'loads', range: [2_000, 5_000], step: 100 },
    rate: { label: 'Water and energy per load', current: [70, 140], next: [35, 65] },
    upkeep: { name: 'Repairs', visit: 'Repair', perYear: [300, 1_500], visitCost: [120, 300] },
  },
  {
    intro: 'A distribution centre plans to swap its gas forklifts for lithium-battery forklifts.',
    current: 'Gas forklift',
    next: 'Battery forklift',
    each: 'each battery forklift',
    thing: 'forklift',
    quantity: { label: 'Hours operated per year', unit: 'hours', range: [1_500, 4_500], step: 100 },
    rate: { label: 'Energy cost per hour', current: [320, 520], next: [90, 200] },
    upkeep: { name: 'Maintenance', visit: 'Maintenance', perYear: [800, 3_000], visitCost: [200, 500] },
  },
];

/**
 * Payback period: extra purchase price ÷ annual running-cost saving, where
 * the saving has to be built from a side-by-side cost table. Tier 3 gives
 * upkeep as visits × cost per visit, with the new model costing more per visit.
 */
export const paybackSavings: ScenarioTemplate = {
  id: 'payback-savings',
  skill: 'break-even-payback',
  tiers: [1, 2, 3],
  build(tier, random) {
    const s = pick(random, SETTINGS);
    const quantity = randomStep(random, s.quantity.range[0], s.quantity.range[1], tier === 1 ? s.quantity.step * 5 : s.quantity.step);
    const rateNow = randomInt(random, s.rate.current[0], s.rate.current[1]) / 100;
    const rateNew = randomInt(random, s.rate.next[0], s.rate.next[1]) / 100;

    let upkeepNow: number;
    let upkeepNew: number;
    const rows: string[][] = [
      [s.quantity.label, `${f(quantity)} ${s.quantity.unit}`, `${f(quantity)} ${s.quantity.unit}`],
      [s.rate.label, cents(rateNow), cents(rateNew)],
    ];
    const visits = { now: 0, next: 0, costNow: 0, costNew: 0 };
    if (tier === 3) {
      visits.now = randomInt(random, 4, 8);
      visits.next = randomInt(random, 1, visits.now - 2);
      visits.costNow = randomStep(random, s.upkeep.visitCost[0], s.upkeep.visitCost[1], 10);
      // Dearer visits, but few enough that upkeep still saves money.
      const headroom = (visits.costNow * (visits.now - visits.next)) / visits.next - 10;
      visits.costNew = visits.costNow + randomStep(random, 20, Math.min(150, headroom), 10);
      upkeepNow = visits.now * visits.costNow;
      upkeepNew = visits.next * visits.costNew;
      rows.push([`${s.upkeep.visit} visits per year`, f(visits.now), f(visits.next)]);
      rows.push([`Cost per ${s.upkeep.visit.toLowerCase()} visit`, money(visits.costNow), money(visits.costNew)]);
    } else {
      const step = tier === 1 ? 100 : 10;
      upkeepNow = randomStep(random, s.upkeep.perYear[0], s.upkeep.perYear[1], step);
      upkeepNew = randomStep(random, s.upkeep.perYear[0] * 0.2, upkeepNow * 0.7, step);
      rows.push([`${s.upkeep.name} per year`, money(upkeepNow), money(upkeepNew)]);
    }

    const runningSaving = round2(quantity * (rateNow - rateNew));
    const upkeepSaving = upkeepNow - upkeepNew;
    const saving = round2(runningSaving + upkeepSaving);

    // Tier 1 makes the payback land on a quarter year; above that the price is just rounded.
    const extra =
      tier === 1
        ? Math.round(saving * (randomInt(random, 6, 28) / 4) / 10) * 10
        : Math.round((saving * (randomInt(random, 150, 700) / 100)) / 100) * 100;
    const years = extra / saving;

    const { options, correctIndex, correct } = choiceOptions(years, random, {
      format: (value, decimals) => `${formatFixed(value, decimals)} years`,
      finestStep: 0.01,
      // Forgetting the upkeep saving is the usual slip.
      traps: [extra / runningSaving],
    });

    const floor = Math.floor(years);
    const solution = [
      `Running cost saving: ${f(quantity)} × (${cents(rateNow)} − ${cents(rateNew)}) = ${money(runningSaving)} a year`,
      tier === 3
        ? `${s.upkeep.name} saving: ${visits.now} × ${money(visits.costNow)} − ${visits.next} × ${money(visits.costNew)} = ${money(upkeepNow)} − ${money(upkeepNew)} = ${money(upkeepSaving)} a year`
        : `${s.upkeep.name} saving: ${money(upkeepNow)} − ${money(upkeepNew)} = ${money(upkeepSaving)} a year`,
      `Total saving: ${money(runningSaving)} + ${money(upkeepSaving)} = ${money(saving)} a year`,
      `Payback: ${money(extra)} ÷ ${money(saving)} = ${approx(years)} years`,
      `Closest option: ${correct}`,
    ];
    const shortcut =
      `Work on differences only, never full costs: ${money(rateNow - rateNew)} × ${f(quantity)} plus ${money(upkeepSaving)} of upkeep. ` +
      `Then bracket: ${money(saving)} × ${floor} = ${money(saving * floor)} and × ${floor + 1} = ${money(saving * (floor + 1))}, ` +
      `so it lies between ${yearsText(floor)} and ${yearsText(floor + 1)}, nearer ${yearsText(years - floor < 0.5 ? floor : floor + 1)}.`;

    return {
      targetTimeMs: [75_000, 100_000, 130_000][tier - 1]!,
      prompt: `How many years will the running-cost savings of ${s.each} take to pay back its extra purchase price? Choose the closest.`,
      context: [
        { type: 'paragraph', text: s.intro },
        { type: 'table', title: `Annual running costs per ${s.thing}`, headers: ['', s.current, s.next], rows },
        { type: 'paragraph', text: `The new model carries an extra purchase price of ${money(extra)} over the current one.` },
      ],
      answer: { kind: 'choice', options, correctIndex },
      solution,
      shortcut,
    };
  },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function yearsText(n: number): string {
  return n === 1 ? '1 year' : `${n} years`;
}
