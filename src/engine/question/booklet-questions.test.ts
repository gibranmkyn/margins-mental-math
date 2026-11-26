import { describe, expect, it } from 'vitest';
import { bookletEntries } from './booklets';
import { createQuestion, createRandom, listBooklets, listBookletQuestions, listSkills } from './index';
import { fingerprintText, NO_BOOKLETS } from './test-support/booklets';

/** A question as transcribed, by id: what the engine is expected to serve, so no booklet wording is copied here. */
const transcribed = (id: string) => bookletEntries().flatMap((b) => b.entries).find((e) => e.id === id)!;

describe.skipIf(NO_BOOKLETS)('booklet questions through the question engine', () => {
  it('lists the 8 booklets by name', () => {
    expect(listBooklets().map((b) => b.name)).toEqual([
      'BCG Potential Test',
      'McKinsey PST 1',
      'McKinsey PST 2',
      'McKinsey PST 3',
      'McKinsey Practice Test A',
      'McKinsey Practice Test B',
      'McKinsey Practice Test C',
      'Sample McKinsey PST',
    ]);
  });

  it('serves each booklet in booklet order, every question labelled with its booklet name and original number', () => {
    const pst1 = listBooklets().find((b) => b.name === 'McKinsey PST 1')!;
    expect(pst1.questions.map((q) => q.booklet?.number)).toEqual([3, 5, 6, 7, 9, 11, 12, 14, 15, 17, 22, 24, 25, 26]);
    const q5 = transcribed('pst1-q05');
    // Its case title and options, pinned by fingerprint (test-support/booklets.ts) so they are not copied here.
    expect(fingerprintText(JSON.stringify([q5.caseTitle, q5.options]))).toBe('e58f6a73');
    expect(pst1.questions.find((q) => q.id === 'pst1-q05')).toMatchObject({
      id: 'pst1-q05',
      source: 'booklet',
      skill: 'break-even-payback',
      tier: 2,
      booklet: { booklet: pst1.id, name: 'McKinsey PST 1', caseTitle: q5.caseTitle, number: 5 },
      answer: { kind: 'choice', options: q5.options, correctIndex: 2 },
    });
    for (const booklet of listBooklets()) {
      for (const q of booklet.questions) expect(q.booklet).toMatchObject({ booklet: booklet.id, name: booklet.name });
    }
  });

  it('gives every booklet question a label no other question of its booklet shares, naming the practice set where a booklet holds two', () => {
    for (const booklet of listBooklets()) {
      const labels = booklet.questions.map((q) => `${q.booklet?.part ?? ''} Question ${q.booklet?.number}`);
      expect(new Set(labels).size, booklet.name).toBe(labels.length);
    }
    // The BCG file is BCG's official sample (questions 1 to 4) followed by MConsultingPrep's practice set (questions 1 to 5).
    const bcg = listBookletQuestions().filter((q) => q.id.startsWith('bcg-'));
    expect(bcg.map((q) => [q.booklet?.part, q.booklet?.number])).toEqual([
      ['BCG official sample', 1],
      ['BCG official sample', 2],
      ['BCG official sample', 3],
      ['BCG official sample', 4],
      ['MCP practice set', 2],
      ['MCP practice set', 4],
      ['MCP practice set', 5],
    ]);
    // A booklet with one numbered set needs no part.
    expect(listBookletQuestions().filter((q) => !q.id.startsWith('bcg-')).every((q) => q.booklet?.part === undefined)).toBe(true);
  });

  it('shows an exhibit the booklet drew as a chart redrawn as a chart of the same kind, in place of its table', () => {
    const q = listBookletQuestions().find((x) => x.id === 'pst1-q03')!;
    const entry = transcribed('pst1-q03');
    // PST 1 Q3 rests on a plain table and a chart-titled one, an indexed line chart read from its gridlines.
    expect(entry.context.map((b) => b.type)).toEqual(['p', 'table', 'p', 'table']);
    expect(q.context.map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph', 'chart']);
    const chart = q.context[3]!;
    expect(chart).toMatchObject({ type: 'chart', chart: 'indexed-line', labelled: false });
    // Two series of six readings, indexed to 100 at the start.
    if (chart.type !== 'chart') throw new Error('chart expected');
    expect(chart.unit).toMatch(/^Index\b.*= 100$/);
    expect(chart.series.map((s) => s.values.length)).toEqual([6, 6]);
    for (const s of chart.series) expect(s.values[0]).toBe(100);
    // The series (names and readings) and the unit, pinned by fingerprint.
    expect(fingerprintText(JSON.stringify(chart.series.map((s) => [s.name, s.values])))).toBe('99f84017');
    expect(fingerprintText(chart.unit)).toBe('7f13aa80');
    // The plain table stays a table, as transcribed, its title pinned too.
    expect(q.context[1]).toEqual(entry.context[1]);
    expect(q.context[1]!.type === 'table' && fingerprintText(q.context[1]!.title ?? '')).toBe('5d11137a');
  });

  it('serves a booklet question on request for a scenario skill and tier that has one', () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const q = createQuestion('break-even-payback', 2, createRandom(seed), { source: 'booklet' });
      expect(q).toMatchObject({ skill: 'break-even-payback', tier: 2, source: 'booklet' });
      expect(listBookletQuestions()).toContainEqual(q);
      ids.add(q.id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('lists booklets as a source of the scenario skills they serve', () => {
    const testing = listSkills().find((s) => s.skill === 'testing-statements')!;
    expect(testing.sources).toContain('booklet');
    for (const q of listBookletQuestions()) {
      expect(listSkills().find((s) => s.skill === q.skill)?.sources, q.id).toContain('booklet');
    }
  });
});
