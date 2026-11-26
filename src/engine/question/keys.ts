import { ENTRY_SUFFIX } from './entry';
import type { EntrySuffix } from './entry';

/** What the on-screen keypad (or a hardware keyboard) can send into a typed entry. */
export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'negate' | 'delete' | EntrySuffix;

const MAX_LENGTH = 10;

/** A key that is a whole suffix of the entry grammar (shorthand), not a digit or an edit. */
const SUFFIX_KEY = new RegExp(`^${ENTRY_SUFFIX.source}`);
const isSuffix = (key: Key): key is EntrySuffix => SUFFIX_KEY.test(key);

/** Apply one key press to the typed entry. */
export function pressKey(entry: string, key: Key): string {
  // The minus sign toggles in front and never counts towards the length.
  if (key === 'negate') return entry.startsWith('-') ? entry.slice(1) : '-' + entry;
  const suffix = ENTRY_SUFFIX.exec(entry)?.[1] ?? '';
  const digits = entry.slice(0, entry.length - suffix.length);
  // A suffix is deleted whole, so "bn" goes in one press.
  if (key === 'delete') return suffix ? digits : entry.slice(0, -1);
  if (entry.startsWith('-')) return '-' + pressKey(entry.slice(1), key);
  // A suffix follows at least one digit and replaces any suffix already typed.
  if (isSuffix(key)) return /\d/.test(digits) ? digits + key : entry;
  if (suffix) return entry;
  if (entry.length >= MAX_LENGTH) return entry;
  if (key === '.') {
    if (entry.includes('.')) return entry;
    return entry === '' ? '0.' : entry + '.';
  }
  if (entry === '0') return key;
  return entry + key;
}
