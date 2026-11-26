/**
 * Consulting ranks and the total XP at which each begins. Honest practice earns about
 * 35 XP a minute spent answering (see xp.ts), so about 20 minutes a day (some 700 XP) reaches Analyst
 * on the first day and Senior Partner in about three months; each rank takes longer
 * than the one before. docs/spec.md shows the arithmetic.
 */
const RANKS = [
  { rank: 'Intern', from: 0 },
  { rank: 'Analyst', from: 350 },
  { rank: 'Senior Analyst', from: 1_400 },
  { rank: 'Associate', from: 4_200 },
  { rank: 'Senior Associate', from: 9_000 },
  { rank: 'Engagement Manager', from: 17_000 },
  { rank: 'Associate Partner', from: 28_000 },
  { rank: 'Partner', from: 43_000 },
  { rank: 'Senior Partner', from: 63_000 },
] as const;

export interface LevelStatus {
  /** 1-based level number. */
  level: number;
  rank: string;
  /** XP earned since this level began. */
  xpIntoLevel: number;
  /** XP needed to span this level; 0 at the top. */
  xpForLevel: number;
  /** Null at the top rank. */
  nextRank: string | null;
}

export function levelFor(xp: number): LevelStatus {
  let index = 0;
  while (index + 1 < RANKS.length && xp >= RANKS[index + 1]!.from) index++;
  const current = RANKS[index]!;
  const next = RANKS[index + 1];
  return {
    level: index + 1,
    rank: current.rank,
    xpIntoLevel: xp - current.from,
    xpForLevel: next ? next.from - current.from : 0,
    nextRank: next ? next.rank : null,
  };
}
