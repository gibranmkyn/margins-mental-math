import { describe, expect, it } from 'vitest';
import { initialProgress, MOCK_PASS_PERCENT, drillTimeTrend, mockTrend, trendSkills } from './index';
import type { AnswerRecord, MockRecord, Progress } from './index';

/** Local-time date, so tests do not depend on the machine's time zone. */
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0);

function answer(skill: AnswerRecord['skill'], when: Date, timeMs: number): AnswerRecord {
  return {
    sessionId: 's',
    questionId: `q${when.getTime()}${timeMs}`,
    skill,
    tier: 1,
    source: 'generated',
    correct: true,
    timeMs,
    metTarget: true,
    xp: 10,
    answeredAt: when.toISOString(),
  };
}

function mock(percent: number, when: Date): MockRecord {
  return {
    id: `m${when.getTime()}`,
    length: 'short',
    finishedAt: when.toISOString(),
    questionCount: 10,
    correctCount: percent / 10,
    answeredCount: 10,
    percent,
    passed: percent >= MOCK_PASS_PERCENT,
    timeMs: 600_000,
    xp: 0,
    questions: [],
  };
}

const withHistory = (answers: AnswerRecord[], mocks: MockRecord[] = []): Progress => ({ ...initialProgress(), answers, mocks });

describe('mock trend', () => {
  it('is empty before any mock is sat', () => {
    expect(mockTrend(initialProgress(), at(20))).toMatchObject({ points: [], latest: null, best: null, passMark: 70, sat: 0, passed: 0 });
  });

  it('lists scores oldest first against the 70% pass mark', () => {
    const p = withHistory([], [mock(50, at(10)), mock(70, at(12)), mock(60, at(14))]);
    const t = mockTrend(p, at(20));
    expect(t.points.map((x) => x.percent)).toEqual([50, 70, 60]);
    expect(t.points.map((x) => x.passed)).toEqual([false, true, false]);
    expect(t).toMatchObject({ latest: 60, best: 70, sat: 3, passed: 1, passMark: 70 });
  });

  it('draws the mocks of the range chosen but counts them all', () => {
    const mocks = Array.from({ length: 12 }, (_, i) => mock(40 + i, at(1 + i)));
    const t = mockTrend(withHistory([], mocks), at(20), '2w');
    expect(t.points.map((x) => x.percent)).toEqual([46, 47, 48, 49, 50, 51]);
    expect(t).toMatchObject({ sat: 12, best: 51, latest: 51 });
  });
});

describe('drill time trend', () => {
  it('is empty with no drill answers; scenario answers never count as drills', () => {
    expect(drillTimeTrend(initialProgress(), at(20))).toMatchObject({ points: [], gaps: 14, recentMs: null, priorMs: null, changeMs: null, faster: false, lifetimeMs: null, answered: 0 });
    const p = withHistory([answer('ratios-comparisons', at(20), 90_000)]);
    expect(drillTimeTrend(p, at(20)).answered).toBe(0);
  });

  it('averages each local day, oldest first', () => {
    const p = withHistory([
      answer('addition', at(18, 9), 20_000),
      answer('addition', at(18, 10), 30_000),
      answer('division', at(20, 23), 12_000),
    ]);
    const t = drillTimeTrend(p, at(21));
    expect(t.points).toEqual([
      { day: '2026-11-18', to: '2026-11-18', averageMs: 25_000, count: 2 },
      { day: '2026-11-20', to: '2026-11-20', averageMs: 12_000, count: 1 },
    ]);
    expect(t.lifetimeMs).toBeCloseTo(62_000 / 3);
  });

  it('compares the last 7 days with the 7 before', () => {
    const p = withHistory([
      answer('addition', at(5), 40_000), // prior window: Nov 5 to 11
      answer('addition', at(11), 30_000),
      answer('addition', at(12), 20_000), // recent window: Nov 12 to 18
      answer('addition', at(18), 10_000),
      answer('addition', at(4), 99_000), // before both windows: lifetime only
    ]);
    const t = drillTimeTrend(p, at(18, 22));
    expect(t.recentMs).toBe(15_000);
    expect(t.priorMs).toBe(35_000);
  });

  it('has no prior figure on the first week', () => {
    const t = drillTimeTrend(withHistory([answer('addition', at(18), 10_000)]), at(18));
    expect(t).toMatchObject({ recentMs: 10_000, priorMs: null, answered: 1 });
  });

  it('has no recent figure after a quiet week but still has the lifetime one', () => {
    const t = drillTimeTrend(withHistory([answer('addition', at(1), 10_000)]), at(20));
    expect(t).toMatchObject({ recentMs: null, lifetimeMs: 10_000 });
  });

  it('narrows to one skill', () => {
    const answers = Array.from({ length: 14 }, (_, i) => answer(i % 2 ? 'addition' : 'division', at(1 + i), 10_000 + i * 1000));
    const t = drillTimeTrend(withHistory(answers), at(15), { skill: 'division' });
    expect(t.points.map((x) => x.day)).toEqual(['2026-11-03', '2026-11-05', '2026-11-07', '2026-11-09', '2026-11-11', '2026-11-13']);
    expect(t.answered).toBe(7);
  });

  it('offers only drill skills that have been answered', () => {
    const p = withHistory([answer('division', at(2), 1), answer('addition', at(3), 1), answer('ratios-comparisons', at(3), 1)]);
    expect(trendSkills(p)).toEqual(['addition', 'division']);
  });
});

/** A day N days after 1 Sep 2026, local time. */
const on = (n: number, hour = 12) => new Date(2026, 8, 1 + n, hour, 0);

describe('trend ranges', () => {
  // Drill time falls from about 14 s to 7 s over 90 days, with every seventh day off.
  const slowing = Array.from({ length: 91 }, (_, n) => n).filter((n) => n % 7 !== 3).map((n) => answer('addition', on(n), 14_000 - n * 77));
  const today = on(90, 20);

  it('shows the last two weeks day by day, each day where it falls, saying how many days had no drills', () => {
    const t = drillTimeTrend(withHistory(slowing), today, { range: '2w' });
    expect(t.bucket).toBe('day');
    expect(t.points.map((p) => p.day)).toEqual(
      Array.from({ length: 14 }, (_, i) => 77 + i).filter((n) => n % 7 !== 3).map((n) => localDayOf(on(n))),
    );
    expect(t.gaps).toBe(2);
  });

  it('shows three months week by week, so a slow improvement is visible', () => {
    const t = drillTimeTrend(withHistory(slowing), today, { range: '3m' });
    expect(t.bucket).toBe('week');
    expect(t.points).toHaveLength(13);
    expect(t.points.at(-1)).toMatchObject({ to: localDayOf(on(90)) });
    for (const p of t.points) expect(p.count).toBeGreaterThan(0);
    expect(t.points[0]!.averageMs).toBeGreaterThan(t.points.at(-1)!.averageMs + 5000);
  });

  it('shows all of a long history month by month, and a short one day by day', () => {
    const long = drillTimeTrend(withHistory([answer('addition', on(-200), 20_000), ...slowing]), today, { range: 'all' });
    expect(long.bucket).toBe('month');
    expect(long.points[0]).toMatchObject({ day: '2026-02-01', averageMs: 20_000, count: 1 });
    expect(long.points.at(-1)!.day).toBe('2026-11-01');
    const short = drillTimeTrend(withHistory(slowing.slice(-5)), today, { range: 'all' });
    expect(short.bucket).toBe('day');
  });

  it('keeps the last-week comparison and lifetime figures whatever the range', () => {
    const a = drillTimeTrend(withHistory(slowing), today, { range: '2w' });
    const b = drillTimeTrend(withHistory(slowing), today, { range: 'all' });
    expect([a.recentMs, a.priorMs, a.lifetimeMs, a.answered]).toEqual([b.recentMs, b.priorMs, b.lifetimeMs, b.answered]);
  });

  it('draws every mock of the range, and averages them by week or month once there are many', () => {
    const mocks = Array.from({ length: 40 }, (_, i) => mock(30 + i, on(i * 2)));
    const all = mockTrend(withHistory([], mocks), on(80), 'all');
    expect(all.bucket).toBe('week');
    expect(all.points.length).toBeLessThan(40);
    expect(all.points.length).toBeGreaterThan(8);
    expect(all.points.at(-1)!.percent).toBeGreaterThan(all.points[0]!.percent);
    const recent = mockTrend(withHistory([], mocks), on(80), '2w');
    expect(recent.bucket).toBe('mock');
    expect(recent.points.map((p) => p.percent)).toEqual([64, 65, 66, 67, 68, 69]);
    expect(all).toMatchObject({ sat: 40, passed: mocks.filter((m) => m.passed).length });
  });
});

function localDayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
