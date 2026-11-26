import { describe, expect, it } from 'vitest';
import { bookletNamesIn, bookletWording, indexBooklets, numericOptionProblems, optionValues, originalityProblems, unorderedNumericOptionProblems, verifyCalculation } from './authored-verify';
import type { BookletText, Entry, ExhibitText } from './authored-verify';

/** A value question with the given options and calculation; everything else is filler the checks below do not read. */
function valueEntry(options: string[], answer: string, correctIndex: number, given = 'Revenue rose by 2,500,000 dollars from 1,000,000.'): Entry {
  return {
    id: 'test-value',
    skill: 'percentages-in-context',
    tier: 2,
    context: [{ type: 'paragraph', text: given }],
    prompt: 'By how much did revenue rise over the year?',
    options,
    correctIndex,
    solution: ['step one', 'step two'],
    shortcut: 'a quicker way to see it',
    check: { kind: 'value', answer },
  };
}

describe('numeric options in mixed formats', () => {
  it('reads one shape as written, and mixed scales of one unit as amounts of that unit', () => {
    expect(optionValues(['$1.2m', '$2.4m', '$3.6m', '$4.8m'])).toEqual([1.2, 2.4, 3.6, 4.8]);
    expect(optionValues(['$300,000', '$700,000', '$2.5 million', '$7.5 million'])).toEqual([300_000, 700_000, 2_500_000, 7_500_000]);
    expect(optionValues(['€400k', '€1.2 million', '€900,000', '€2bn'])).toEqual([400_000, 1_200_000, 900_000, 2_000_000_000]);
  });

  it('reads singular and plural as one unit, as booklet questions pst3-q14 and pracC-q17 write them', () => {
    // Option sets of the same shape as theirs, not theirs.
    expect(optionValues(['1 minute', '5 minutes', '10 minutes', '15 minutes'])).toEqual([1, 5, 10, 15]);
    expect(optionValues(['1 percentage point', '3 percentage points', '18 percentage points', '24 percentage points'])).toEqual([1, 3, 18, 24]);
    // The bank's option rule reads them the same way, ascending included.
    expect(numericOptionProblems(valueEntry(['1 minute', '5 minutes', '10 minutes', '15 minutes'], '2500000 / 500000', 1))).toEqual([]);
  });

  it('accepts a set that mixes scales of one unit, as booklet question pracA-q14 does', () => {
    // A set of the same shape as its options, not its options.
    const e = valueEntry(['$300,000', '$700,000', '$2.5 million', '$7.5 million'], '2500000 + 1000000 - 1000000', 2);
    expect(unorderedNumericOptionProblems(e)).toEqual([]);
    expect(numericOptionProblems(e)).toEqual([]);
    expect(() => verifyCalculation(e)).not.toThrow();
  });

  it('holds the answer of a mixed set to the precision it displays, in the plain unit', () => {
    // "$2.5 million" displays to the nearest $0.1 million, so 2,540,000 is $2.5 million as displayed and 2,600,000 is not.
    expect(() => verifyCalculation(valueEntry(['$300,000', '$700,000', '$2.5 million', '$7.5 million'], '2500000 + 40000', 2, 'Revenue rose by 2,500,000 and 40,000 dollars.'))).not.toThrow();
    expect(() => verifyCalculation(valueEntry(['$300,000', '$700,000', '$2.5 million', '$7.5 million'], '2500000 + 100000', 2, 'Revenue rose by 2,500,000 and 100,000 dollars.'))).toThrow(
      /vs stated/,
    );
  });

  it('still rejects options in different units or that do not read as one number', () => {
    const problems = (options: string[]) => unorderedNumericOptionProblems(valueEntry(options, '2500000 / 1000000', 0));
    expect(problems(['12%', '0.5 percentage points', '3%', '4%']).join()).toMatch(/differ in unit or scale/);
    expect(problems(['$5 million', '€6 million', '$7 million', '$8 million']).join()).toMatch(/differ in unit or scale/);
    expect(problems(['$700,000', '2.5 million', '$3 million', '$4 million']).join()).toMatch(/differ in unit or scale/);
    expect(problems(['$700,000', '$2.5 million or $3 million', '$3.5 million', '$4 million']).join()).toMatch(/differ in unit or scale/);
  });

  it('still rejects two options that show the same amount', () => {
    expect(unorderedNumericOptionProblems(valueEntry(['$500,000', '$0.5 million', '$2.5 million', '$7.5 million'], '2500000 / 1', 2)).join()).toMatch(/same value/);
  });

  it('orders a mixed set by amount for the bank, not by the numbers as written', () => {
    expect(numericOptionProblems(valueEntry(['$700,000', '$2.5 million', '$900,000', '$7.5 million'], '2500000 / 1', 1)).join()).toMatch(/ascending/);
  });
});

describe('originality: exhibit text and whole booklet sentences and titles', () => {
  // An invented booklet: its wording only has the shapes the gate tells apart, so no real booklet is copied here.
  const booklet: BookletText = {
    id: 'bk1-q01',
    source: 'Example Practice Test',
    caseTitle: 'Gadgetron',
    context: [
      { type: 'p', text: 'The client sells kettles in four regions.' },
      { type: 'table', title: 'Exhibit 2: Colour', headers: ['Region', 'Revenue, $m'], rows: [['North', '12']] },
      { type: 'table', title: 'Exhibit 1 (chart): Index, Q1 2019 = 100', headers: ['Quarter', 'Index'], rows: [['Q1', '100']] },
    ],
    question: 'Which of the following statements is true?',
    options: ['Region D is largest', 'Region A is largest', 'Region B is largest', 'Region C is largest'],
    explanation: 'Demand tracks rainfall times the weather index. Cost = volume × unit price. Region D is largest. So 12% is the lowest option.',
  };
  const exhibit: ExhibitText = {
    id: 'bk1-exhibit-3',
    questions: ['bk1-q01'],
    blocks: [
      { title: 'Exhibit 3: Average first season spend', unit: 'US$ per customer', categories: ['Quintile 1'], series: [{ name: 'Average first season spend' }] },
      { title: 'Exhibit 1', unit: 'EUR millions: bookings on the upper scale, fleet size on the lower scale', note: 'Figure above each bar: total orders' },
    ],
  };
  const index = indexBooklets([booklet], [exhibit]);

  /** An entry whose chart and solution carry the given wording; everything else is filler no booklet shares. */
  const entry = (chart: { title: string; unit: string; series?: string }, step = 'Margin times sales gives the profit of each line.'): Entry => ({
    id: 'bk-bk1-q01-a',
    skill: 'ratios-comparisons',
    tier: 2,
    context: [
      { type: 'paragraph', text: 'A chain of florists compares its shops.' },
      { type: 'chart', chart: 'bar', title: chart.title, unit: chart.unit, categories: ['Shop 1'], series: [{ name: chart.series ?? 'Sales', values: [3] }], labelled: true, decimals: 0 },
    ],
    prompt: 'Which shop sells most?',
    options: ['Shop 1', 'Shop 2', 'Shop 3', 'Shop 4'],
    correctIndex: 0,
    solution: [step, 'Shop 1 is ahead.'],
    shortcut: 'Look at the tallest bar.',
    check: { kind: 'best', pick: 'max', scores: ['3', '2', '1', '0'] },
  });
  const wording = (e: Entry) => originalityProblems(e, index).filter((p) => !p.includes('figures'));

  it("fails a redrawn exhibit's title repeated whole, as a title or a series name, though shorter than eight words", () => {
    expect(wording(entry({ title: 'Exhibit 3: Average first season spend', unit: 'Profit per buyer, $' })).join()).toMatch(/whole booklet title or sentence, "Average first season spend" \(bk1-q01\)/);
    expect(wording(entry({ title: 'Exhibit 3: Profit per buyer', unit: '$', series: 'average first-season spend' })).join()).toMatch(/Average first season spend/);
    expect(wording(entry({ title: 'Exhibit 3: Profit in the first year, per buyer', unit: '$', series: 'Profit in year one' }))).toEqual([]);
  });

  it('fails eight words shared with an exhibit unit line or note', () => {
    expect(wording(entry({ title: 'Exhibit 1', unit: 'Thousand cars: rentals on the upper scale, fleet size on the lower scale' })).join()).toMatch(/copies "upper scale fleet size on the lower scale"/);
    expect(wording(entry({ title: 'Exhibit 1', unit: 'Thousand cars; rentals against the top scale, the fleet against the bottom' }))).toEqual([]);
  });

  it('fails a whole booklet sentence of six or seven words, and not a reworded one', () => {
    expect(wording(entry({ title: 'Exhibit 3: Sales', unit: '$' }, 'Demand tracks rainfall times the weather index.')).join()).toMatch(/"Demand tracks rainfall times the weather index\."/);
    expect(wording(entry({ title: 'Exhibit 3: Sales', unit: '$' }, 'Demand follows rainfall, scaled by the index of weather.'))).toEqual([]);
  });

  it('allows what is generic: exhibit numbers, short titles, unit labels, year and index labels, short sentences, equations, stock stems', () => {
    expect(wording(entry({ title: 'Exhibit 1', unit: 'Revenue, $m' }))).toEqual([]);
    expect(wording(entry({ title: 'Exhibit 2: Colour', unit: 'US$ per customer' }))).toEqual([]);
    expect(wording(entry({ title: 'Exhibit 1: Index, Q1 2019 = 100', unit: 'Index, Q1 2019 = 100' }))).toEqual([]);
    for (const step of ['Region D is largest.', 'So 12% is the lowest option.', 'Cost = volume × unit price.', 'Which of the following statements is true?'])
      expect(wording(entry({ title: 'Exhibit 3: Sales', unit: '$' }, step)), step).toEqual([]);
    expect(bookletWording('Quintile 1', index)).toEqual([]);
  });

  it('finds booklet names, case titles and test-makers in any case where the review page would', () => {
    expect(bookletNamesIn('Adapted from a McKinsey test', index)).toContain('McKinsey');
    expect(bookletNamesIn('the example practice test, question 1', index)).toContain('Example Practice Test');
    expect(bookletNamesIn('A florist in a market town', index)).toEqual([]);
  });
});
