import { describe, expect, it } from 'vitest';
import { listBooklets, listBookletQuestions, listSkills } from './index';
import type { ChartBlock, ContextBlock, Question } from './index';
import { chartProblems } from './chart-check';
import { fingerprintText, NO_BOOKLETS } from './test-support/booklets';

/**
 * Content tests for the booklet questions. The transcription in
 * `content/booklets/*.json` was verified against each booklet's answer key; these
 * tests check every entry is structurally sound and that the engine serves each one
 * with the transcribed wording, options and answer unchanged. Exhibits the
 * transcription wrote down as tables "(chart)" are redrawn in `content/exhibits`
 * from the PDFs; these tests check each redraw is a sound chart that draws every
 * figure the transcribed table held, and is read the same way (printed values, or
 * estimated from gridlines).
 */

interface Entry {
  id: string;
  source: string;
  caseTitle: string;
  number: number;
  topic: string;
  difficulty: number;
  context: Array<{ type: string; text?: string; items?: string[]; title?: string; headers?: string[]; rows?: string[][] }>;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  tip?: string;
  note?: string;
}

interface Exhibit {
  id: string;
  page: number;
  replaces: string[];
  questions: string[];
  blocks: Array<ChartBlock | { type: 'table'; title?: string; headers: string[]; rows: string[][] }>;
}

const files = import.meta.glob<Entry[]>('../../../content/booklets/*.json', { eager: true, import: 'default' });
const entries: Entry[] = Object.values(files).flat();
const exhibitFiles = import.meta.glob<Exhibit[]>('../../../content/exhibits/*.json', { eager: true, import: 'default' });
const exhibits: Exhibit[] = Object.values(exhibitFiles).flat();
const served = new Map(listBookletQuestions().map((q) => [q.id, q]));

const CHART_TITLE = /\(chart\b/i;
type Block = Entry['context'][number];
const isChartTable = (b: Block) => b.type === 'table' && CHART_TITLE.test(b.title ?? '');
const exhibitFor = (e: Entry, b: Block) => exhibits.find((x) => x.questions.includes(e.id) && x.replaces.includes(b.title ?? ''));

/** The transcribed text of a block, as the content test of PR #13 reads it. */
function transcribedText(b: Block): string[] {
  return b.type === 'p' ? [b.text!] : b.type === 'list' ? b.items! : [...(b.title ? [b.title] : []), ...b.headers!, ...b.rows!.flat()];
}

/** Numbers written wrongly: leftovers of formatting bugs, or a thousands comma in the wrong place. */
const MALFORMED = /NaN|undefined|null|Infinity|\d,(?=\d)(?!\d{3}(?!\d))|\.\d+\.\d/;

function blockText(block: ContextBlock): string[] {
  switch (block.type) {
    case 'paragraph':
      return [block.text];
    case 'list':
      return block.items;
    case 'table':
      return [...(block.title ? [block.title] : []), ...block.headers, ...block.rows.flat()];
    case 'chart':
      return [block.title, block.unit, ...block.categories, ...block.series.map((s) => s.name), ...(block.barNotes ?? []), ...(block.note ? [block.note] : [])];
  }
}

function visibleText(q: Question): string[] {
  const options = q.answer.kind === 'choice' ? q.answer.options : [];
  return [...q.context.flatMap(blockText), q.prompt, ...options, ...q.solution, q.shortcut];
}

describe.skipIf(NO_BOOKLETS)('the booklet questions', () => {
  it('are the 103 transcribed questions from 8 booklets, each with a unique id', () => {
    expect(entries).toHaveLength(103);
    expect(new Set(entries.map((e) => e.id)).size).toBe(103);
    expect(Object.keys(files)).toHaveLength(8);
    expect(listBooklets()).toHaveLength(8);
  });

  it('are each structurally valid as transcribed', () => {
    for (const e of entries) {
      expect(e.id, e.id).toMatch(/^[a-z]+[A-Z0-9]?\d*-q\d{2}$/);
      expect(e.source.trim().length, e.id).toBeGreaterThan(0);
      expect(e.caseTitle.trim().length, e.id).toBeGreaterThan(0);
      expect(Number.isInteger(e.number) && e.number > 0, e.id).toBe(true);
      expect([1, 2, 3], e.id).toContain(e.difficulty);
      expect(e.context.length, e.id).toBeGreaterThan(0);
      for (const block of e.context) {
        expect(['p', 'list', 'table'], e.id).toContain(block.type);
        if (block.type === 'p') expect(block.text?.trim().length, e.id).toBeGreaterThan(0);
        if (block.type === 'list') expect(block.items?.length, e.id).toBeGreaterThan(0);
        if (block.type === 'table') {
          expect(block.headers?.length, e.id).toBeGreaterThan(1);
          expect(block.rows?.length, e.id).toBeGreaterThan(0);
          for (const row of block.rows ?? []) expect(row.length, `${e.id}: ragged table ${block.title}`).toBe(block.headers!.length);
        }
      }
      expect(e.question.trim().length, e.id).toBeGreaterThan(10);
      expect(e.options.length, e.id).toBeGreaterThanOrEqual(4);
      expect(e.options.length, e.id).toBeLessThanOrEqual(5);
      expect(new Set(e.options).size, `${e.id}: options repeat`).toBe(e.options.length);
      expect(Number.isInteger(e.answer) && e.answer >= 0 && e.answer < e.options.length, e.id).toBe(true);
      expect(e.explanation.trim().length, e.id).toBeGreaterThan(10);
    }
  });

  it('keep each booklet in booklet order: the transcription runs by question number within each case set', () => {
    for (const booklet of listBooklets()) {
      const own = entries.filter((e) => e.id.startsWith(`${booklet.id}-q`));
      // Question numbers only ever restart where a booklet holds a second practice set (the BCG file has two).
      const restarts = own.filter((e, i) => i > 0 && e.number <= own[i - 1]!.number).length;
      expect(restarts, booklet.name).toBeLessThanOrEqual(booklet.name.startsWith('BCG') ? 1 : 0);
      const order = own.map((e) => e.id).filter((id) => served.has(id));
      expect(booklet.questions.map((q) => q.id), booklet.name).toEqual(order);
    }
  });

  it('serves every question whose chart exhibits are all redrawn, and holds back only those still waiting', () => {
    for (const e of entries) {
      const waiting = e.context.some((b) => isChartTable(b) && !exhibitFor(e, b));
      expect(served.has(e.id), `${e.id}: waiting for a redraw ${waiting}`).toBe(!waiting);
    }
    const waiting = listBooklets().reduce((sum, b) => sum + b.waiting, 0);
    expect(served.size + waiting).toBe(entries.length);
  });

  it('show each redrawn exhibit in place of the table it replaces, and every other block as transcribed', () => {
    for (const e of entries.filter((x) => served.has(x.id))) {
      const shown = new Set<Exhibit>();
      const expected = e.context.flatMap((b): unknown[] => {
        const exhibit = isChartTable(b) ? exhibitFor(e, b) : undefined;
        if (!exhibit) return [b.type === 'p' ? { type: 'paragraph', text: b.text } : b];
        if (shown.has(exhibit)) return [];
        shown.add(exhibit);
        return exhibit.blocks;
      });
      expect(served.get(e.id)!.context, e.id).toEqual(expected);
      for (const block of served.get(e.id)!.context) if (block.type === 'table') expect(block.title ?? '', e.id).not.toMatch(CHART_TITLE);
    }
  });

  it('keep the verified wording, options and answers from the transcription unchanged', () => {
    for (const e of entries.filter((x) => served.has(x.id))) {
      const q = served.get(e.id)!;
      expect(q.prompt, e.id).toBe(e.question);
      expect(q.answer, e.id).toEqual({ kind: 'choice', options: e.options, correctIndex: e.answer });
      // Every block but a redrawn exhibit keeps its transcribed text.
      const kept = e.context.filter((b) => !(isChartTable(b) && exhibitFor(e, b)));
      const shownText = q.context.filter((b) => b.type !== 'chart' && !exhibits.some((x) => x.blocks.includes(b as never))).flatMap(blockText);
      expect(shownText, e.id).toEqual(kept.flatMap(transcribedText));
      expect(q.booklet, e.id).toMatchObject({ booklet: e.id.replace(/-q\d+$/, ''), name: e.source, caseTitle: e.caseTitle, number: e.number });
      expect(q.shortcut, e.id).toBe(e.tip ?? '');
    }
  });

  it('carry a booklet note under the solution only where the transcription has one, never empty', () => {
    for (const e of entries.filter((x) => served.has(x.id))) {
      const q = served.get(e.id)!;
      if (e.note === undefined) expect(q.note, e.id).toBeUndefined();
      else {
        expect(e.note.trim().length, e.id).toBeGreaterThan(10);
        expect(q.note, e.id).toBe(e.note);
      }
    }
  });

  // The two notes are pinned by fingerprint (see test-support/booklets.ts), so their wording and figures stay out of this file.
  it('note on Practice A question 16 why the key\'s answer is kept, and keep that answer', () => {
    const q = served.get('pracA-q16')!;
    expect(fingerprintText(q.note!)).toBe('72d59ba1');
    expect(q.note).toMatch(/The key's answer is kept\.$/);
    if (q.answer.kind !== 'choice') throw new Error('choice expected');
    expect(fingerprintText(JSON.stringify(q.answer.options))).toBe('e04cc82b');
    expect(q.answer.correctIndex).toBe(0);
  });

  it('note on Practice C question 19 that the redrawn chart and the worked solution read the days differently, and keep the answer', () => {
    const q = served.get('pracC-q19')!;
    expect(fingerprintText(q.note!)).toBe('0eb8ae1c');
    // The note names the answer it keeps.
    expect(q.answer.kind === 'choice' && q.note!.endsWith(`so the answer is ${q.answer.options[q.answer.correctIndex]!.replace(/ .*/, '')} either way.`)).toBe(true);
  });

  it('are served as valid scenario questions: a known skill and tier, a target time and a worked solution', () => {
    const scenarioSkills = new Set(listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : [])));
    for (const q of served.values()) {
      expect(scenarioSkills.has(q.skill as never), `${q.id}: ${q.skill}`).toBe(true);
      expect([1, 2, 3], q.id).toContain(q.tier);
      expect(q.source, q.id).toBe('booklet');
      expect(q.targetTimeMs, q.id).toBeGreaterThan(0);
      expect(q.solution.length, q.id).toBeGreaterThan(0);
      for (const step of q.solution) expect(step.trim().length, q.id).toBeGreaterThan(1);
      // The explanation survives as steps: nothing of the method is lost in the split.
      const e = entries.find((x) => x.id === q.id)!;
      for (const step of q.solution) expect(e.explanation, q.id).toContain(step);
      for (const text of visibleText(q)) expect(text, q.id).not.toMatch(MALFORMED);
    }
  });

  it('each give a shortcut, a faster mental method than the worked solution (story 28)', () => {
    expect(entries.filter((e) => !(e.tip ?? '').trim()).map((e) => e.id)).toEqual([]);
    for (const q of served.values()) expect(q.shortcut.trim().length, q.id).toBeGreaterThan(40);
  });

  it('write shortcuts with true minus, times and divide signs, as the rest of the app does', () => {
    for (const e of entries) expect(e.tip ?? '', e.id).not.toMatch(/(^|\s)-\d|\d (?:-|x|\/) \d/);
  });
});

// ---------- Redrawn exhibits ----------

const near = (a: number, b: number, within = 1e-6) => Math.abs(a - b) <= within;
const charts = (x: Exhibit) => x.blocks.filter((b): b is ChartBlock => b.type === 'chart');

/** Every number in a piece of text: "2.5k patients" -> [2.5], "USD 47 billion" -> [47], "-21.6" -> [-21.6]. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/[-−]?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace('−', '-').replaceAll(',', '')));
}

/** Every number an exhibit shows: drawn values and positions, and every figure printed in or beside it. */
function shownNumbers(x: Exhibit): number[] {
  return x.blocks.flatMap((b) => {
    if (b.type === 'table') return [b.title ?? '', ...b.headers, ...b.rows.flat()].flatMap(numbersIn);
    const text = [b.title, b.unit, ...b.categories, ...b.series.map((s) => s.name), ...(b.barNotes ?? []), ...(b.barNoteRows ?? []).flatMap((r) => r.notes), b.note ?? ''];
    // A scatter's horizontal axis is labelled at both ends.
    const ends = b.xAxis ? [b.xAxis.min, b.xAxis.max] : [];
    return [...b.series.flatMap((s) => s.values), ...(b.x ?? []), ...ends, ...text.flatMap(numbersIn)];
  });
}

describe.skipIf(NO_BOOKLETS)('the redrawn exhibits', () => {
  it('each replace chart-titled tables in the questions they name, drawn from a page of the booklet', () => {
    expect(new Set(exhibits.map((x) => x.id)).size).toBe(exhibits.length);
    for (const x of exhibits) {
      expect(x.page, x.id).toBeGreaterThan(0);
      expect(x.replaces.length, x.id).toBeGreaterThan(0);
      expect(x.questions.length, x.id).toBeGreaterThan(0);
      expect(charts(x).length, `${x.id}: draws a chart`).toBeGreaterThan(0);
      for (const id of x.questions) {
        const e = entries.find((y) => y.id === id);
        expect(e, `${x.id}: ${id}`).toBeDefined();
        const titles = e!.context.filter(isChartTable).map((b) => b.title);
        expect(x.replaces.some((t) => titles.includes(t)), `${x.id}: replaces a chart table of ${id}`).toBe(true);
        // Exactly one redraw for each chart table.
        for (const t of titles) expect(exhibits.filter((y) => y.questions.includes(id) && y.replaces.includes(t!)).length, `${id}: ${t}`).toBeLessThanOrEqual(1);
      }
      for (const b of x.blocks) if (b.type === 'table') expect(b.title ?? '', x.id).not.toMatch(CHART_TITLE);
    }
  });

  it('cover every exhibit the transcription marked as a chart, so every booklet question is served', () => {
    for (const e of entries) {
      for (const b of e.context.filter(isChartTable)) expect(exhibitFor(e, b), `${e.id}: ${b.title}`).toBeDefined();
      expect(served.has(e.id), e.id).toBe(true);
    }
    for (const booklet of listBooklets()) expect(booklet.waiting, booklet.name).toBe(0);
  });

  it('are each a sound chart: a value for every category, values on the axes, shares adding up', () => {
    expect(exhibits.flatMap((x) => charts(x).flatMap((c, i) => chartProblems(c, `${x.id} chart ${i + 1}`)))).toEqual([]);
  });

  it('show every figure of the tables they replace, read the same way: printed, or estimated within reading error', () => {
    for (const x of exhibits) {
      const shown = shownNumbers(x);
      for (const id of x.questions) {
        const e = entries.find((y) => y.id === id)!;
        for (const table of e.context.filter((b) => isChartTable(b) && x.replaces.includes(b.title ?? ''))) {
          const estimated = /approximate|read off/i.test(table.title ?? '');
          if (estimated || table.rows!.flat().some((cell) => /^about\b/.test(cell))) {
            // The booklet's values were estimated from the chart, so the redraw must be estimated too.
            for (const c of charts(x)) expect(c.labelled, `${x.id}: read from gridlines like the booklet`).toBe(false);
          }
          for (const cell of table.rows!.flat()) {
            for (const v of numbersIn(cell)) {
              // A reading the booklet's transcriber estimated may differ from the redraw's own reading of the PDF by up to a tenth.
              const within = estimated || /^about\b/.test(cell) ? Math.max(Math.abs(v) * 0.1, 0.5) : 1e-6;
              expect(shown.some((s) => near(s, v, within)), `${x.id} (${id}): ${cell} in "${table.title}"`).toBe(true);
            }
          }
        }
      }
    }
  });
});
