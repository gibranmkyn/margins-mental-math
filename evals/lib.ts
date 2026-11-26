import { listAuthoredQuestions, listBookletQuestions, listSkills } from '../src/engine/question';
import type { Question } from '../src/engine/question';
import { indexBooklets } from '../src/engine/question/authored-verify';
import type { BookletText, CheckRecord, Entry, ExhibitText } from '../src/engine/question/authored-verify';
import type { SourceDistractors, Trap } from './traps';

/**
 * What the evals read: candidates, their blind-solve records and judges' verdicts,
 * the booklet questions they are modelled on (as the app serves them, redrawn charts
 * included), and the authored bank. Shared by the candidate evals and the export of
 * judge inputs, so both see the same questions.
 */

/**
 * An authored entry modelled on one booklet question: same structure, new company, wording and
 * numbers, and its source's traps declared as it reproduces them (evals/traps.ts).
 */
export type Candidate = Entry & { modelledOn: string; traps?: Trap[] };

/**
 * One judge's verdict on one question, as every judge writes it. `fail` is the
 * judge's one failure mode. For a model judge `id` is the fingerprinted id the judge was
 * shown (evals/judge-view.ts), so a verdict counts only for the text it judged; the
 * owner writes the candidate's own id and may add the `fingerprint` of the text
 * reviewed (`fingerprint()` in authored-verify.ts) so the note lapses when it changes.
 */
export interface Judgement {
  id: string;
  judge: string;
  fail: boolean;
  why?: string;
  fingerprint?: string;
  /** Owner verdicts only, as the review page writes them: "real" (reads real), "off" (something off) or "reject". */
  mark?: string;
}

/** The four judged failure modes, one judge each; a candidate is admitted only once all four have passed it. */
export const JUDGES = ['ambiguity', 'distractors', 'realism', 'difficulty'] as const;
/** The owner's review of a sample (the review page, `npm run eval:review`): same format, judge "owner", `why` the one-line note. */
export const OWNER = 'owner';

const candidateFiles = import.meta.glob<Candidate[]>('../content/candidates/*.json', { eager: true, import: 'default' });
const checkFiles = import.meta.glob<Record<string, CheckRecord>>('../content/candidates/checks/*.json', { eager: true, import: 'default' });
const judgementFiles = import.meta.glob<Judgement[]>('../content/candidates/judgements/*.json', { eager: true, import: 'default' });
const bookletFiles = import.meta.glob<BookletText[]>('../content/booklets/*.json', { eager: true, import: 'default' });
const exhibitFiles = import.meta.glob<ExhibitText[]>('../content/exhibits/*.json', { eager: true, import: 'default' });
const authoredFiles = import.meta.glob<Array<Entry & { modelledOn?: string }>>('../content/authored/*.json', { eager: true, import: 'default' });
const distractorFiles = import.meta.glob<{ questions: Record<string, SourceDistractors> }>('./source-distractors.json', { eager: true, import: 'default' });

/** Candidates in file order, so a report reads the way the files do. */
export const candidates: Candidate[] = Object.keys(candidateFiles)
  .sort()
  .flatMap((path) => candidateFiles[path]!);
export const checks: Record<string, CheckRecord> = Object.assign({}, ...Object.values(checkFiles));
export const judgements: Judgement[] = Object.values(judgementFiles).flat();
export const bookletIndex = indexBooklets(Object.values(bookletFiles).flat(), Object.values(exhibitFiles).flat());
export const sources = new Map(listBookletQuestions().map((q) => [q.id, q]));
export const bank: readonly Question[] = listAuthoredQuestions();
export const scenarioSkills = new Set<string>(listSkills().flatMap((s) => (s.kind === 'scenario' ? [s.skill] : [])));
/**
 * Variants already admitted to the authored bank (entries in content/authored with `modelledOn`): a new round's
 * candidates sit beside them, so the sibling checks (variety, variants per source, answer letters per source) count them.
 */
export const admitted: Array<Entry & { modelledOn: string }> = Object.keys(authoredFiles)
  .sort()
  .flatMap((path) => authoredFiles[path]!)
  .filter((e): e is Entry & { modelledOn: string } => typeof e.modelledOn === 'string');
/** How each booklet question builds its wrong options (evals/source-distractors.json). */
export const sourceDistractors: Record<string, SourceDistractors> = Object.values(distractorFiles)[0]?.questions ?? {};

/** FNV-1a, as hex. */
export function fingerprintText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
