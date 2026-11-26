/**
 * The only source of randomness the engines use. Injected so that any
 * question or session can be reproduced from its seed.
 */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
}

/** Seeded generator (mulberry32): small, fast and deterministic. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** An integer in [min, max], both inclusive. */
export function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

/** A shuffled copy of `items` (Fisher-Yates), drawn from a random source. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(random, 0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** A fresh 32-bit seed drawn from a random source. */
export function randomSeed(random: Random): number {
  return Math.floor(random.next() * 4294967296) >>> 0;
}
