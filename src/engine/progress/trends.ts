import { listSkills } from '../question';
import type { DrillSkill, Skill } from '../question';
import { dayNumber, dayNumberOf, localDay } from './days';
import { answeredSkills, drillDayTotals } from './history';
import { MOCK_PASS_PERCENT } from './mocks';
import type { Progress } from './types';

/** How far back a trend looks: the last two weeks, the last three months, or everything. */
export type TrendRange = '2w' | '3m' | 'all';

/** A stretch of local days a trend point stands for: one day, one week (seven days) or one calendar month. */
interface Bucket {
  /** First local day, YYYY-MM-DD. */
  from: string;
  /** Last local day, YYYY-MM-DD. */
  to: string;
}

type BucketSize = 'day' | 'week' | 'month';

const TWO_WEEKS = 14;
const THREE_MONTHS_WEEKS = 13;
/** "All" goes by day up to two weeks of history, by week up to 26 weeks, then by month. */
const ALL_BY_WEEK_UP_TO_DAYS = 26 * 7;

const dayOf = (n: number): string => {
  const d = new Date(Date.UTC(1970, 0, 1) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/**
 * The stretches a trend is drawn in, oldest first, ending today: 14 days for two
 * weeks; 13 weeks of seven days for three months; and for everything since `first`,
 * days, weeks or calendar months depending on how long that is.
 */
function bucketsFor(range: TrendRange, now: Date, first: string | null): { size: BucketSize; buckets: Bucket[] } {
  const today = dayNumber(now);
  const days = (count: number) => Array.from({ length: count }, (_, i) => ({ from: dayOf(today - count + 1 + i), to: dayOf(today - count + 1 + i) }));
  const weeks = (count: number) => Array.from({ length: count }, (_, i) => ({ from: dayOf(today - (count - i) * 7 + 1), to: dayOf(today - (count - 1 - i) * 7) }));
  if (range === '2w') return { size: 'day', buckets: days(TWO_WEEKS) };
  if (range === '3m') return { size: 'week', buckets: weeks(THREE_MONTHS_WEEKS) };
  const span = first === null ? 1 : Math.max(1, today - dayNumberOf(first) + 1);
  if (span <= TWO_WEEKS) return { size: 'day', buckets: days(span) };
  if (span <= ALL_BY_WEEK_UP_TO_DAYS) return { size: 'week', buckets: weeks(Math.ceil(span / 7)) };
  const months: Bucket[] = [];
  const start = new Date(Number(first!.slice(0, 4)), Number(first!.slice(5, 7)) - 1, 1);
  for (let d = start; d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({ from: localDay(d), to: localDay(last) });
  }
  return { size: 'month', buckets: months };
}

/** One mock on the trend, or the average of several in one week or month: when, and the score against the pass mark. */
export interface MockPoint {
  /** When it finished, or the first day of the week or month averaged. */
  finishedAt: string;
  percent: number;
  passed: boolean;
  /** Mocks the point stands for. */
  count: number;
}

export interface MockTrend {
  /** The range's mocks, oldest first: one point each, or averaged by week or month once there are many. */
  points: MockPoint[];
  /** `mock` when each point is one mock. */
  bucket: 'mock' | 'week' | 'month';
  latest: number | null;
  /** Best score over every mock, not only the ones drawn. */
  best: number | null;
  passMark: number;
  /** Every mock sat. */
  sat: number;
  passed: number;
}

/** More mocks than this in a range are averaged by week (or by month when the range runs by month). */
const MOCK_POINTS_MAX = 12;

/** Mock scores over time, which the owner measures against the pass mark, over the range chosen. */
export function mockTrend(progress: Progress, now: Date, range: TrendRange = 'all'): MockTrend {
  const all = progress.mocks;
  const dayOfMock = (m: { finishedAt: string }) => localDay(new Date(m.finishedAt));
  const { size, buckets } = bucketsFor(range, now, all.length === 0 ? null : dayOfMock(all[0]!));
  const from = buckets[0]?.from ?? '';
  const inRange = all.filter((m) => dayOfMock(m) >= from);
  let points: MockPoint[];
  let bucket: MockTrend['bucket'] = 'mock';
  if (inRange.length <= MOCK_POINTS_MAX) {
    points = inRange.map((m) => ({ finishedAt: m.finishedAt, percent: m.percent, passed: m.passed, count: 1 }));
  } else {
    const grouped = size === 'month' ? buckets : bucketsFor('all', now, from).buckets;
    bucket = size === 'month' ? 'month' : 'week';
    points = grouped.flatMap((b) => {
      const ms = inRange.filter((m) => dayOfMock(m) >= b.from && dayOfMock(m) <= b.to);
      if (ms.length === 0) return [];
      const percent = Math.round(ms.reduce((sum, m) => sum + m.percent, 0) / ms.length);
      return [{ finishedAt: b.from, percent, passed: percent >= MOCK_PASS_PERCENT, count: ms.length }];
    });
  }
  return {
    points,
    bucket,
    latest: all.at(-1)?.percent ?? null,
    best: all.length === 0 ? null : Math.max(...all.map((m) => m.percent)),
    passMark: MOCK_PASS_PERCENT,
    sat: all.length,
    passed: all.filter((m) => m.passed).length,
  };
}

/** The average time of the drills answered over one day, week or month. */
export interface DayPoint {
  /** First local day it covers, YYYY-MM-DD. */
  day: string;
  /** Last local day it covers. */
  to: string;
  averageMs: number;
  count: number;
}

export interface DrillTimeTrend {
  /** The range's days, weeks or months that had drills, oldest first. */
  points: DayPoint[];
  bucket: BucketSize;
  /** Days, weeks or months in the range with no drills: left out of the points. */
  gaps: number;
  /** Average over the 7 days ending today; null when none was answered. */
  recentMs: number | null;
  /** Average over the 7 days before those; null when none was answered. */
  priorMs: number | null;
  /** Recent minus prior, to a tenth of a second; null until both weeks have drills. Negative is faster. */
  changeMs: number | null;
  /** The recent week is faster than the one before, by at least a tenth of a second. */
  faster: boolean;
  /** Average over every drill answered (of the skill, when one is chosen). */
  lifetimeMs: number | null;
  /** Drills answered (of the skill, when one is chosen). */
  answered: number;
}

const DRILL_SKILLS = new Set<Skill>(listSkills().filter((s) => s.kind === 'drill').map((s) => s.skill));

/** Average of what a set of day totals adds up to; null when it holds no drill. */
function averageOf(totals: Iterable<{ count: number; totalMs: number }>): number | null {
  let count = 0;
  let totalMs = 0;
  for (const t of totals) {
    count += t.count;
    totalMs += t.totalMs;
  }
  return count === 0 ? null : totalMs / count;
}

/**
 * Average time per typed drill over time, overall or for one skill, over the range
 * chosen: by day for two weeks, by week for three months, and by day, week or month
 * for everything. Only drills count: scenario and chart questions are timed
 * differently. Days are the owner's local calendar days.
 */
export function drillTimeTrend(progress: Progress, now: Date, options: { skill?: DrillSkill; range?: TrendRange } = {}): DrillTimeTrend {
  const { skill, range = '2w' } = options;
  const byDay = drillDayTotals(progress, (s) => DRILL_SKILLS.has(s) && (skill === undefined || s === skill));
  const sorted = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const { size, buckets } = bucketsFor(range, now, sorted[0]?.[0] ?? null);
  const points: DayPoint[] = [];
  for (const b of buckets) {
    const totals = sorted.filter(([d]) => d >= b.from && d <= b.to).map(([, t]) => t);
    const averageMs = averageOf(totals);
    if (averageMs !== null) points.push({ day: b.from, to: b.to, averageMs, count: totals.reduce((n, t) => n + t.count, 0) });
  }

  const today = dayNumber(now);
  const within = (from: number, to: number) => sorted.filter(([d]) => dayNumberOf(d) >= from && dayNumberOf(d) <= to).map(([, t]) => t);
  const recentMs = averageOf(within(today - 6, today));
  const priorMs = averageOf(within(today - 13, today - 7));
  // To a tenth of a second, as shown; `+ 0` turns a rounded -0 into 0.
  const changeMs = recentMs === null || priorMs === null ? null : Math.round((recentMs - priorMs) / 100) * 100 + 0;
  return {
    points,
    bucket: size,
    gaps: buckets.length - points.length,
    recentMs,
    priorMs,
    changeMs,
    faster: changeMs !== null && changeMs < 0,
    lifetimeMs: averageOf(byDay.values()),
    answered: [...byDay.values()].reduce((n, t) => n + t.count, 0),
  };
}

/** Drill skills with at least one answer, in the app's skill order: the choices for a per-skill trend. */
export function trendSkills(progress: Progress): DrillSkill[] {
  const answered = answeredSkills(progress);
  return listSkills().flatMap((s) => (s.kind === 'drill' && answered.has(s.skill) ? [s.skill] : []));
}
