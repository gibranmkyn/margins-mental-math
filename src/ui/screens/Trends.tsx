import { useMemo } from 'preact/hooks';
import type { DrillTimeTrend, MockTrend, Totals, TrendRange } from '../../engine/progress';
import type { ChartBlock, DrillSkill } from '../../engine/question';
import { Chart } from '../chart/Chart';
import { formatDay, formatDuration, formatMonth, formatNumber, SKILL_NAMES } from '../format';
import { Button, Chip, ChipGroup, Panel, Screen, Stat, Stats } from '../parts';

interface Props {
  mocks: MockTrend;
  time: DrillTimeTrend;
  /** Drill skills with answers, for the per-skill view. */
  skills: DrillSkill[];
  /** The skill the pace chart is narrowed to; null for every drill. */
  skill: DrillSkill | null;
  onSkill(skill: DrillSkill | null): void;
  /** How far back both charts look. */
  range: TrendRange;
  onRange(range: TrendRange): void;
  totals: Totals;
  longestStreak: number;
  onHome(): void;
}

/** Gridlines every step, at most five of them, up to the first step above the largest value. */
function timeAxis(maxSeconds: number) {
  const step = [5, 10, 20, 30, 60, 120, 300].find((s) => maxSeconds / s <= 5) ?? 600;
  return { min: 0, max: Math.max(step, Math.ceil(maxSeconds / step) * step), step };
}

const RANGES: Array<{ range: TrendRange; label: string }> = [
  { range: '2w', label: '2 weeks' },
  { range: '3m', label: '3 months' },
  { range: 'all', label: 'All time' },
];

const PER = { day: 'day', week: 'week', month: 'month' } as const;

/** A point's label: the day, the week's first day, or the month. */
const pointLabel = (day: string, bucket: 'mock' | 'day' | 'week' | 'month') => (bucket === 'month' ? formatMonth(day) : formatDay(day));

/** What the mock chart draws: scores, and the pass mark as a second, flat line. */
function mockChart(trend: MockTrend): ChartBlock {
  return {
    type: 'chart',
    chart: 'line',
    title: trend.bucket === 'mock' ? 'Mock score by sitting' : `Mock score, average by ${trend.bucket}`,
    unit: trend.bucket === 'mock' ? 'Correct, % of questions' : `Correct, % of questions, by ${trend.bucket} starting`,
    categories: trend.points.map((p) => pointLabel(p.finishedAt, trend.bucket)),
    series: [
      { name: 'Score', values: trend.points.map((p) => p.percent) },
      { name: `Pass mark`, values: trend.points.map(() => trend.passMark) },
    ],
    axis: { min: 0, max: 100, step: 25 },
    labelled: false,
    decimals: 0,
    suffix: '%',
    highlight: 0,
    ...(trend.points.length === 1 ? { note: 'One mock so far. The line starts with the second.' } : {}),
  };
}

function timeChart(trend: DrillTimeTrend, skill: DrillSkill | null): ChartBlock {
  const values = trend.points.map((p) => Math.round(p.averageMs / 100) / 10);
  return {
    type: 'chart',
    chart: 'line',
    title: skill ? `${SKILL_NAMES[skill]}: time per drill` : 'Time per drill, every skill',
    unit: trend.bucket === 'day' ? 'Average seconds per drill, by day' : `Average seconds per drill, by ${PER[trend.bucket]} starting`,
    categories: trend.points.map((p) => pointLabel(p.day, trend.bucket)),
    series: [{ name: 'Seconds', values }],
    axis: timeAxis(Math.max(...values)),
    labelled: values.length <= 6,
    decimals: 1,
    suffix: 's',
    highlight: 0,
    ...(values.length === 1
      ? { note: `One ${PER[trend.bucket]} so far. The line starts on the second.` }
      : trend.gaps > 0
        ? { note: `No drills in ${formatNumber(trend.gaps)} ${trend.gaps === 1 ? PER[trend.bucket] : `${PER[trend.bucket]}s`} of this range; the line skips ${trend.gaps === 1 ? 'it' : 'them'}.` }
        : {}),
  };
}

/** The change in average time, signed: negative is faster, and the one that is good news. */
function changeText(changeMs: number): string {
  if (changeMs === 0) return '0.0s';
  return `${changeMs < 0 ? '−' : '+'}${formatDuration(Math.abs(changeMs))}`;
}

/** The owner's two measures first, mock score against the pass mark and time per drill, then lifetime totals. */
export function Trends({ mocks, time, skills, skill, onSkill, range, onRange, totals, longestStreak, onHome }: Props) {
  const mockBlock = useMemo(() => (mocks.points.length > 0 ? mockChart(mocks) : null), [mocks]);
  const timeBlock = useMemo(() => (time.points.length > 0 ? timeChart(time, skill) : null), [time, skill]);
  const headline = time.recentMs ?? time.lifetimeMs;
  const { accuracy } = totals;
  return (
    <Screen
      class="trends"
      actions={
        <Button variant="secondary" onClick={onHome}>
          Home
        </Button>
      }
    >
      <header class="library-head">
        <p class="label">Trends</p>
        <h1 class="library-title">Is it working?</h1>
      </header>

      <section class="setting" aria-label="Range">
        <ChipGroup label="Range">
          {RANGES.map((r) => (
            <Chip key={r.range} pressed={range === r.range} onClick={() => onRange(r.range)}>
              {r.label}
            </Chip>
          ))}
        </ChipGroup>
      </section>

      <Panel label="Mock score" title="Mock score" meta={`Pass ${mocks.passMark}%`} testId="trend-mocks">
        <Stats>
          <Stat label="Latest" value={mocks.latest === null ? '—' : `${mocks.latest}%`} testId="mock-latest" />
          <Stat label="Best" value={mocks.best === null ? '—' : `${mocks.best}%`} />
          <Stat label="Passed" value={mocks.sat === 0 ? '—' : `${mocks.passed} of ${mocks.sat}`} />
        </Stats>
        {mockBlock ? (
          <Chart block={mockBlock} own />
        ) : (
          <p class="meta trends-empty">
            {mocks.sat === 0 ? `No mocks yet. Sit one and your score lands here, against the ${mocks.passMark}% line.` : 'No mocks in this range. Choose a longer one to see earlier sittings.'}
          </p>
        )}
      </Panel>

      <Panel label="Time per drill" title="Time per drill" testId="trend-time">
        <Stats>
          <Stat label={time.recentMs === null ? 'All time' : 'Last 7 days'} value={headline === null ? '—' : formatDuration(headline)} testId="time-headline" />
          <Stat label="Against week before" value={time.changeMs === null ? '—' : changeText(time.changeMs)} tone={time.faster ? 'accent' : 'default'} testId="time-change" />
        </Stats>
        {skills.length > 0 && (
          <ChipGroup label="Skill" scroll>
            <Chip pressed={skill === null} onClick={() => onSkill(null)}>
              All skills
            </Chip>
            {skills.map((s) => (
              <Chip key={s} pressed={skill === s} onClick={() => onSkill(s)}>
                {SKILL_NAMES[s]}
              </Chip>
            ))}
          </ChipGroup>
        )}
        {timeBlock ? (
          <Chart block={timeBlock} own />
        ) : (
          <p class="meta trends-empty">
            {time.answered === 0 ? 'No drills yet. Answer one and your pace shows up here, day by day.' : 'No drills in this range. Choose a longer one to see earlier days.'}
          </p>
        )}
        {time.changeMs === null && time.answered > 0 && <p class="meta trends-empty">The change appears once there are drills in both of two weeks.</p>}
      </Panel>

      <Stats label="Lifetime">
        <Stat label="Answered" value={formatNumber(totals.answered)} testId="trend-answered" />
        <Stat label="Accuracy" value={accuracy === null ? '—' : `${accuracy}%`} />
        <Stat label="Longest" value={`${formatNumber(longestStreak)}d`} />
      </Stats>
    </Screen>
  );
}
