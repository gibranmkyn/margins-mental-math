import type { ContextBlock, Question } from '../src/engine/question';
import { fingerprintText, sourceDistractors } from './lib';

/**
 * What each judge sees of a question, built the same way for the judge-input export
 * (judge-input.eval.ts) and for the scorecard (candidates.eval.ts), so that a verdict can be
 * matched to the exact text it was given. An item's id is a fingerprint of the judge's prompt and
 * of everything the judge saw: when the question or the prompt changes, the id changes, and a
 * verdict saved against the old id no longer counts (the report lists it as stale).
 */

export const LETTERS = 'ABCDE';

/** A question as the owner sees it, before answering. */
export interface Blind {
  id: string;
  context: ContextBlock[];
  question: string;
  options: Record<string, string>;
}

/** A question with its answer and worked solution, for the judges that must see them. */
export interface Answered extends Blind {
  answer: string;
  solution: string[];
  shortcut: string;
}

export interface Plain {
  context: ContextBlock[];
  prompt: string;
  options: string[];
  correctIndex: number;
  solution: string[];
  shortcut: string;
}

export const fromQuestion = (q: Question): Plain => ({
  context: q.context,
  prompt: q.prompt,
  options: q.answer.kind === 'choice' ? q.answer.options : [],
  correctIndex: q.answer.kind === 'choice' ? q.answer.correctIndex : -1,
  solution: q.solution,
  shortcut: q.shortcut,
});

export const blind = (id: string, p: Plain): Blind => ({
  id,
  context: p.context,
  question: p.prompt,
  options: Object.fromEntries(p.options.map((o, i) => [LETTERS[i]!, o])),
});

export const answered = (id: string, p: Plain): Answered => ({ ...blind(id, p), answer: LETTERS[p.correctIndex]!, solution: p.solution, shortcut: p.shortcut });

/** The difficulty judge's pair: the question and the booklet question it must match in difficulty, both with answers and solutions. */
export const pair = (id: string, mine: Plain, source: Plain) => {
  const strip = ({ id: _id, ...rest }: Answered) => rest;
  return { id, question: strip(answered(id, mine)), source: strip(answered(id, source)) };
};

/**
 * What a question's source does that the distractors judge accepts only where the source does it
 * (evals/judges/distractors.md): a statement about something the data does not cover, an option ruled
 * out by another option alone, an evenly spaced wide grid, each common slip that still lands on the
 * source's own correct option (named without the source's figures), and each wrong option no slip lands on
 * that the source keeps anyway (a filler, with its kind). Empty when the source has none.
 * A booklet question is its own source.
 */
export function sourceHas(sourceId: string): string[] {
  const s = sourceDistractors[sourceId];
  if (!s) return [];
  return [
    ...(s.noBasis > 0 ? [`${s.noBasis === 1 ? 'one statement' : `${s.noBasis} statements`} about something the data does not cover`] : []),
    ...(s.dominated > 0 ? [`${s.dominated === 1 ? 'one option' : `${s.dominated} options`} ruled out by another option alone`] : []),
    ...(s.wideGrid ? ['an evenly spaced wide grid with no slip on its neighbours'] : []),
    ...(s.slipsOnAnswer ?? []).map((x) => `a common slip that still lands on the correct option: ${x.slip}`),
    ...(s.fillers ?? []).map((f) => `a filler (${f.kind}): ${f.note}`),
  ];
}

export const distractorsItem = (id: string, p: Plain, sourceId: string) => ({ ...answered(id, p), sourceHas: sourceHas(sourceId) });

const promptFiles = import.meta.glob<string>('./judges/*.md', { eager: true, query: '?raw', import: 'default' });
/** Each judge's prompt text, so that an item id changes when the prompt does. */
export const judgePrompt = (judge: string): string => promptFiles[`./judges/${judge}.md`] ?? '';

/** The id a judge sees for an item: a fingerprint of the prompt, the question's own id and what the judge saw. */
export function judgeItemId(judge: string, key: string, item: object, prefix = 'j'): string {
  const { id: _id, ...seen } = item as { id?: string };
  return `${prefix}-${fingerprintText(`${judgePrompt(judge)}\n${key}\n${JSON.stringify(seen)}`)}`;
}

/** Builds an item with its fingerprinted id from a builder that takes the id. */
export function withJudgeId<T extends object>(judge: string, key: string, build: (id: string) => T, prefix = 'j'): T {
  return build(judgeItemId(judge, key, build(''), prefix));
}

/** The item each per-candidate judge sees for a candidate (its id is what a saved verdict must carry). */
export function candidateItem(judge: string, c: Plain & { id: string; modelledOn: string }, source: Plain): { id: string } {
  if (judge === 'distractors') return withJudgeId(judge, c.id, (id) => distractorsItem(id, c, c.modelledOn));
  if (judge === 'difficulty') return withJudgeId(judge, c.id, (id) => pair(id, c, source));
  return withJudgeId(judge, c.id, (id) => blind(id, c));
}
