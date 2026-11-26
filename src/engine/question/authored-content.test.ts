import { describe, expect, it } from 'vitest';
import { listAuthoredQuestions, listBookletQuestions, listSkills } from './index';
import {
  bankFieldProblems,
  independentCheckProblems,
  indexBooklets,
  numericOptionProblems,
  originalityProblems,
  structureProblems,
  unorderedNumericOptionProblems,
  verifyCalculation,
} from './authored-verify';
import type { BookletText, CheckRecord, Entry, ExhibitText } from './authored-verify';
import { fingerprintText, NO_BOOKLETS } from './test-support/booklets';

/**
 * Content tests for the authored bank. Every entry in `content/authored/*.json`
 * carries a calculation beside its stated answer; these tests evaluate it and
 * insist it reproduces the answer from numbers the owner can see. They also
 * check that each entry passed a second, independent check (recorded in
 * `content/authored/checks/*.json` against a fingerprint of the visible text,
 * so editing a question after its check fails here until it is re-checked),
 * and that no entry copies a booklet.
 *
 * Two kinds of id: `au-NNN` for questions written free, and `bk-<booklet question>-<letter>`
 * for questions modelled on one booklet question (admitted from `content/candidates` by
 * `scripts/authored/admit.mjs`), which name it in `modelledOn`.
 */

// ---------- The content, read as files ----------

type BankEntry = Entry & { modelledOn?: string };

const entryFiles = import.meta.glob<BankEntry[]>('../../../content/authored/*.json', { eager: true, import: 'default' });
const checkFiles = import.meta.glob<Record<string, CheckRecord>>('../../../content/authored/checks/*.json', {
  eager: true,
  import: 'default',
});
const bookletFiles = import.meta.glob<BookletText[]>('../../../content/booklets/*.json', { eager: true, import: 'default' });

const exhibitFiles = import.meta.glob<ExhibitText[]>('../../../content/exhibits/*.json', { eager: true, import: 'default' });

const entries: BankEntry[] = Object.values(entryFiles).flat();
const checks: Record<string, CheckRecord> = Object.assign({}, ...Object.values(checkFiles));
const booklets: BookletText[] = Object.values(bookletFiles).flat();
const exhibits: ExhibitText[] = Object.values(exhibitFiles).flat();

/**
 * Admitted questions that match booklet text under the originality rule of 26 November 2026: to be reworded and re-solved.
 * Each is the gate's problem line with the quoted booklet text replaced by its fingerprint (`backlogKey`), so the
 * list stays exact without carrying the booklet wording.
 */
const ORIGINALITY_BACKLOG: readonly string[] = [
  ...['a', 'b', 'c', 'd'].flatMap((l) => [
    `bk-pracA-q13-${l} repeats a whole booklet title or sentence, #59d4d404 (pracA-q12)`,
    `bk-pracA-q13-${l} repeats a whole booklet title or sentence, #f2e5654a (pracA-q12)`,
    `bk-pst1-q03-${l} repeats a whole booklet title or sentence, #5c616de8 (pst1-q03)`,
  ]),
  'bk-pst2-q02-d repeats a whole booklet title or sentence, #be45aa88 (pst2-q02)',
  'bk-bcg-q02-a copies #4be31105 (bcg-q02)',
];

/** A problem line of the originality gate, its quoted booklet text replaced by the text's fingerprint. */
const backlogKey = (problem: string): string => problem.replace(/"([^"]*)"/, (_, text: string) => `#${fingerprintText(text)}`);

// ---------- The tests ----------

describe('the authored bank', () => {
  it('has at least 150 questions, spread so every scenario skill has at least three at every tier', () => {
    expect(entries.length).toBeGreaterThanOrEqual(150);
    const scenarioSkills = listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : []));
    expect(scenarioSkills.length).toBeGreaterThanOrEqual(9);
    for (const skill of scenarioSkills) {
      for (const tier of [1, 2, 3] as const) {
        const count = entries.filter((e) => e.skill === skill && e.tier === tier).length;
        expect(count, `${skill} tier ${tier}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives every question a unique, stable id, and serves every entry through the engine unchanged', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of entries) {
      if (e.modelledOn === undefined) expect(e.id).toMatch(/^au-\d{3}$/);
      // The id names the booklet question it is modelled on (that the question exists is checked below, with the booklets).
      else expect(e.id.startsWith(`bk-${e.modelledOn}-`) && /^bk-[A-Za-z0-9]+-q\d+-[a-z]+$/.test(e.id), e.id).toBe(true);
    }
    const served = listAuthoredQuestions();
    expect(served.map((q) => q.id).sort()).toEqual([...ids].sort());
    for (const e of entries) {
      const q = served.find((s) => s.id === e.id)!;
      expect(q).toMatchObject({ skill: e.skill, tier: e.tier, source: 'authored', prompt: e.prompt, context: e.context });
      expect(q.answer).toEqual({ kind: 'choice', options: e.options, correctIndex: e.correctIndex });
      expect(q.modelledOn).toBe(e.modelledOn);
    }
  });

  it.skipIf(NO_BOOKLETS)('models each bk- question on a booklet question that exists', () => {
    const booklet = new Set(listBookletQuestions().map((q) => q.id));
    for (const e of entries) if (e.modelledOn !== undefined) expect(booklet.has(e.modelledOn), `${e.id} modelled on ${e.modelledOn}`).toBe(true);
  });

  it('keeps only what the app or these tests read: eval metadata such as traps stays out of the bundle', () => {
    // The candidate evals' structure gate applies the same rule (allowing `traps`, which admission strips).
    expect(entries.flatMap((e) => bankFieldProblems(e))).toEqual([]);
  });

  it('is structurally valid: a scenario with data, four or five distinct options, a worked solution and a shortcut', () => {
    const scenarioSkills = new Set<string>(listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : [])));
    expect(entries.flatMap((e) => structureProblems(e, scenarioSkills))).toEqual([]);
  });

  it('gives numeric options one unit, in ascending order unless the question keeps its booklet question\'s order', () => {
    // One unit as `optionValues` reads it: scales of one unit may mix ("$700,000", "$2.5 million") and singular and plural are one unit.
    // A question modelled on a booklet question (`bk-...`) orders its options as the booklets do (not always ascending): the
    // candidate evals' structure gate runs the same `unorderedNumericOptionProblems`, so what the evals admit passes here.
    expect(entries.flatMap((e) => (e.modelledOn === undefined ? numericOptionProblems(e) : unorderedNumericOptionProblems(e)))).toEqual([]);
  });

  it('spreads correct answers across option positions, so favouring one letter does not pay', () => {
    const fourOption = entries.filter((e) => e.options.length === 4);
    for (let position = 0; position < 4; position++) {
      const share = fourOption.filter((e) => e.correctIndex === position).length / fourOption.length;
      expect(share, `position ${position}`).toBeGreaterThanOrEqual(0.18);
      expect(share, `position ${position}`).toBeLessThanOrEqual(0.32);
    }
  });

  it.each(entries.map((e) => [e.id, e] as const))('%s: its calculation reproduces the stated answer', (_id, e) => {
    verifyCalculation(e);
  });

  it('admits only questions a second, independent check agreed with, on the exact text it saw', () => {
    expect(entries.flatMap((e) => independentCheckProblems(e, checks))).toEqual([]);
  });

  it.skipIf(NO_BOOKLETS)('copies no booklet wording, names or figures, beyond a listed backlog admitted before the rule was widened', () => {
    const index = indexBooklets(booklets, exhibits);
    expect(index.phrases.size).toBeGreaterThan(1_000);
    expect(index.wholes.size).toBeGreaterThan(20);
    expect(index.names.size).toBeGreaterThan(20);
    // The gate has indexed redrawn exhibits' text and whole booklet sentences and titles since 26 November 2026
    // (evals/README.md, "Changes to the criteria"). These admitted questions match under that rule; rewording them needs
    // a new blind solve, so it is a separate job. The list is exact: no other match may appear, and a reworded entry
    // comes off it.
    expect(entries.flatMap((e) => originalityProblems(e, index)).map(backlogKey).sort()).toEqual([...ORIGINALITY_BACKLOG].sort());
  });
});
