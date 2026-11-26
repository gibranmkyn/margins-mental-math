import { listAuthoredQuestions, listBookletQuestions } from '../index';
import type { Question, Skill } from '../index';

/**
 * True when the private booklet files are absent (content/booklets and content/exhibits are
 * gitignored, so a public checkout has neither). Tests that need the booklet questions
 * themselves (their content, booklet sessions, fixtures that must resolve to a real booklet
 * question) are skipped then with `describe.skipIf(NO_BOOKLETS)` or `it.skipIf(NO_BOOKLETS)`;
 * everything else runs either way.
 */
export const NO_BOOKLETS = listBookletQuestions().length === 0;

/**
 * Questions in a skill that return as themselves when missed, for tests where any such question
 * will do: the booklet questions while there are booklets (as these tests have always used),
 * else authored questions written free, which are no one's siblings.
 */
export function fixedQuestions(skill: Skill): Question[] {
  const booklet = listBookletQuestions().filter((q) => q.skill === skill);
  return booklet.length > 0 ? booklet : listAuthoredQuestions().filter((q) => q.skill === skill && q.modelledOn === undefined);
}

/**
 * FNV-1a of a text, as hex (as `fingerprint()` in authored-verify.ts). Tests pin booklet wording and
 * figures by fingerprint, so the exact text is checked without being copied into the test.
 */
export function fingerprintText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
