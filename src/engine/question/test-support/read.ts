import type { ContextBlock, Question } from '../types';

/**
 * Test support: reading numbers back off the screen, the way the owner meets a
 * question. Solvers use these to recompute answers from the text shown, never
 * from anything the engine computed.
 */

export type Table = Extract<ContextBlock, { type: 'table' }>;

/** The number in a piece of owner-facing text: "$1,250.50" -> 1250.5, "12%" -> 12. */
export function num(text: string): number {
  const match = /-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/.exec(text);
  if (!match) throw new Error(`No number in "${text}"`);
  return Number(match[0].replaceAll(',', ''));
}

/** Every number in a piece of text, in order. */
export function nums(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(',', '')));
}

/** "+8%" -> 0.08, "−5%" -> -0.05 (the minus sign shown is U+2212). */
export function signedPercent(text: string): number {
  const sign = /^[−-]/.test(text.trim()) ? -1 : 1;
  return (sign * num(text)) / 100;
}

export function tables(question: Question): Table[] {
  return question.context.filter((b): b is Table => b.type === 'table');
}

/** The cell in the row whose first cell matches, in the column whose header matches (default: second column). */
export function cell(question: Question, row: RegExp, column?: RegExp): string {
  for (const table of tables(question)) {
    const col = column ? table.headers.findIndex((h) => column.test(h)) : 1;
    if (col < 0) continue;
    const found = table.rows.find((r) => row.test(r[0] ?? ''));
    if (found) return found[col] ?? '';
  }
  throw new Error(`No table cell for ${row} / ${column} in ${question.id}`);
}

/** The column of a table whose header matches. */
export function column(table: Table, header: RegExp): string[] {
  const col = table.headers.findIndex((h) => header.test(h));
  if (col < 0) throw new Error(`No column ${header} in ${table.headers.join(' | ')}`);
  return table.rows.map((r) => r[col]!);
}

export function listItems(question: Question): string[] {
  return question.context.flatMap((b) => (b.type === 'list' ? b.items : []));
}

/** The number after the last colon of the list item that matches. */
export function listValue(question: Question, label: RegExp): number {
  const item = listItems(question).find((i) => label.test(i));
  if (!item) throw new Error(`No list item ${label} in ${question.id}`);
  return num(item.split(':').at(-1)!);
}

export function paragraphs(question: Question): string {
  return question.context.flatMap((b) => (b.type === 'paragraph' ? [b.text] : [])).join(' ');
}

/** The number right after a phrase in the paragraphs or prompt, e.g. after "surveyed ". */
export function after(question: Question, phrase: RegExp): number {
  const text = `${paragraphs(question)} ${question.prompt}`;
  const match = new RegExp(`${phrase.source}\\s*[$£€]?(-?[\\d,]+(?:\\.\\d+)?)`).exec(text);
  if (!match) throw new Error(`Nothing after ${phrase} in ${question.id}`);
  return num(match[1]!);
}

export function options(question: Question): string[] {
  if (question.answer.kind !== 'choice') throw new Error('not multiple choice');
  return question.answer.options;
}

/** Every piece of text the owner can see, before or after answering. */
export function visibleText(question: Question): string[] {
  const context = question.context.flatMap((b) => {
    switch (b.type) {
      case 'paragraph':
        return [b.text];
      case 'list':
        return b.items;
      case 'table':
        return [...(b.title ? [b.title] : []), ...b.headers, ...b.rows.flat()];
      case 'chart':
        return [b.title, b.unit, ...b.categories, ...(b.barNotes ?? []), ...(b.note ? [b.note] : [])];
    }
  });
  const choices = question.answer.kind === 'choice' ? question.answer.options : [];
  return [question.prompt, ...context, ...choices, ...question.solution, question.shortcut];
}

/**
 * What an independent solver concludes about a question: either the true
 * value, which the correct option must be strictly closest to, or a verdict on
 * each option, of which exactly the correct one must be right.
 */
export type Solved = number | { judged: boolean[] };

/**
 * a > b, decided by a clear margin: a comparison within `relative` of a tie is
 * too close to call fairly, so the solver refuses it and the test fails.
 */
export function isMore(a: number, b: number, relative = 0.01): boolean {
  if (Math.abs(a - b) <= relative * Math.max(Math.abs(a), Math.abs(b))) {
    throw new Error(`Too close to call: ${a} vs ${b}`);
  }
  return a > b;
}

/**
 * Whether a stated figure is the true one: equal up to the rounding shown, or
 * clearly different (by more than `apart` relative). Anything in between is a trap
 * that rests on a rounding hair, so the solver refuses it.
 */
export function isStated(stated: number, truth: number, rounding: number, apart = 0.05): boolean {
  if (Math.abs(stated - truth) <= rounding / 2 + 1e-9) return true;
  if (Math.abs(stated - truth) > apart * Math.abs(truth)) return false;
  throw new Error(`Too close to call: stated ${stated}, true ${truth}`);
}

/** The order of labels by value, highest first unless `ascending`, refusing near ties. */
export function rankBy(values: Map<string, number>, ascending: boolean, relative = 0.02): string[] {
  const order = [...values.entries()].sort((a, b) => (ascending ? a[1] - b[1] : b[1] - a[1]));
  for (let i = 1; i < order.length; i++) isMore(order[i - 1]![1], order[i]![1], relative);
  return order.map(([label]) => label);
}
