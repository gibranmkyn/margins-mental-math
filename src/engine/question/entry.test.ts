import { describe, expect, it } from 'vitest';
import { createQuestion, createRandom, markAnswer, readEntry } from './index';

const valueOf = (entry: string) => readEntry(entry)?.value ?? null;

const ZEROS = { k: 3, m: 6, bn: 9 } as const;
type Suffix = keyof typeof ZEROS;

/**
 * The full number a shorthand stands for, worked out on the digits alone:
 * mantissa 1234 with 2 decimals and suffix m is "1234" followed by 6 − 2 zeros.
 */
function fullDigits(mantissa: number, decimals: number, suffix: Suffix): string {
  return String(mantissa) + '0'.repeat(ZEROS[suffix] - decimals);
}

describe('reading a typed entry', () => {
  it('reads plain numbers, decimals and negatives', () => {
    expect(valueOf('42')).toBe(42);
    expect(valueOf('-17')).toBe(-17);
    expect(valueOf('3.25')).toBe(3.25);
    expect(valueOf('12.')).toBe(12);
    expect(valueOf('-0')).toBe(0);
  });

  it('reads k, m and bn as thousand, million and billion', () => {
    expect(valueOf('45k')).toBe(45_000);
    expect(valueOf('1.2m')).toBe(1_200_000);
    expect(valueOf('3bn')).toBe(3_000_000_000);
    expect(valueOf('-2.5k')).toBe(-2_500);
    expect(valueOf('0.07m')).toBe(70_000);
    expect(valueOf('4.35bn')).toBe(4_350_000_000);
  });

  it('reads a percentage answer as the bare number, since the board shows the unit and no percent sign is typed', () => {
    expect(valueOf('14')).toBe(14);
    expect(valueOf('-37.5')).toBe(-37.5);
    expect(valueOf('14%')).toBeNull();
  });

  it('is not yet a number while incomplete or malformed', () => {
    for (const entry of ['', '-', '.', 'k', '%', 'm5', '1k5', '1.2.3', '1kk', '1k%', '--3', '1 000', '1,000', 'bn']) {
      expect(valueOf(entry), entry).toBeNull();
    }
  });

  it('reads every shorthand as exactly the full number it stands for', () => {
    const random = createRandom(11);
    for (let i = 0; i < 5000; i++) {
      const decimals = Math.floor(random.next() * 3);
      const mantissa = 1 + Math.floor(random.next() * 99_999);
      const suffix = (['k', 'm', 'bn'] as const)[i % 3]!;
      const typed = (mantissa / 10 ** decimals).toFixed(decimals);
      const full = fullDigits(mantissa, decimals, suffix);
      expect(valueOf(typed + suffix), `${typed}${suffix}`).toBe(valueOf(full));
      expect(valueOf(`-${typed}${suffix}`), `-${typed}${suffix}`).toBe(valueOf(`-${full}`));
    }
  });
});

describe('an answer typed in shorthand', () => {
  /** The shortest shorthand for a whole number, found on its digits: 1,250,000 -> "1.25m". */
  function shorthand(value: number): string | null {
    const digits = String(Math.abs(value));
    for (const [suffix, zeros] of [['bn', 9], ['m', 6], ['k', 3]] as const) {
      if (digits.length <= zeros) continue;
      const whole = digits.slice(0, -zeros);
      const rest = digits.slice(-zeros).replace(/0+$/, '');
      return `${value < 0 ? '-' : ''}${whole}${rest ? '.' + rest : ''}${suffix}`;
    }
    return null;
  }

  it('is marked the same as the full number, right or wrong, across every skill that has large answers', () => {
    let checked = 0;
    for (const skill of ['large-numbers', 'multiplication', 'addition', 'subtraction'] as const) {
      for (const tier of [1, 2, 3] as const) {
        for (let seed = 1; seed <= 400; seed++) {
          const q = createQuestion(skill, tier, createRandom(seed));
          for (const value of [q.answer.value, q.answer.value + 1000, q.answer.value * 10]) {
            if (!Number.isInteger(value)) continue;
            const short = shorthand(value);
            if (!short) continue;
            const typedShort = readEntry(short);
            const typedFull = readEntry(String(value));
            expect(typedShort, short).not.toBeNull();
            expect(markAnswer(q, typedShort!), `${q.prompt}: ${short} vs ${value}`).toEqual(markAnswer(q, typedFull!));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});
