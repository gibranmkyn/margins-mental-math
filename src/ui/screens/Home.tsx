import { levelFor, libraryTotals, SPRINT_MS } from '../../engine/progress';
import type { BookletStatus, MockRecord, SpotCheckLength, StarCount, StreakStatus, Totals } from '../../engine/progress';
import type { Marking, Skill, Tier } from '../../engine/question';
import { formatNumber, markingShort, SKILL_NAMES } from '../format';
import { Banner, Button, Flaps, Panel, ProgressBar, Row, RowList, Screen, Stars, Stat, Stats } from '../parts';
import { MockRow } from './Mock';

/** The session the app picked, as Home describes it before starting. */
export interface NextSession {
  skill: Skill;
  tier: Tier;
  stars: StarCount;
  /** Questions in the session. */
  length: number;
  /** "drills" or "questions". */
  noun: string;
  /** How drills are marked, stated before starting; null for multiple choice. */
  marking: Marking | null;
  /** Retries the session brings back. */
  retries: number;
}

interface Props {
  /** Said once about saved progress that could not be read as it was; null when all is well. */
  notice?: string | null;
  totals: Totals;
  /** Missed questions waiting to come back. */
  retriesPending: number;
  xp: number;
  streak: StreakStatus;
  next: NextSession;
  onStart(): void;
  /** Starts a spot check of 1 or 3 questions. */
  onSpotCheck(length: SpotCheckLength): void;
  onSkills(): void;
  /** Opens the sprint picker: a timed sprint in one drill skill. */
  onSprint(): void;
  /** The library's booklets; none (and no library row) without the private booklet files. */
  booklets: BookletStatus[];
  onOpenLibrary(): void;
  onProfile(): void;
  onSettings(): void;
  /** Mocks sat so far, oldest first. */
  mocks: MockRecord[];
  onOpenMocks(): void;
  onOpenTrends(): void;
}

export function Home({ notice = null, totals, retriesPending, xp, streak, next, onStart, onSpotCheck, onSkills, onSprint, booklets, onOpenLibrary, onProfile, onSettings, mocks, onOpenMocks, onOpenTrends }: Props) {
  const library = libraryTotals(booklets);
  const { accuracy } = totals;
  return (
    <Screen
      class="home"
      actions={
        <>
          <p class="next-meta" data-testid="next-meta">
            <span class="next-skill">
              <strong data-testid="next-skill">{SKILL_NAMES[next.skill]}</strong>
              <Stars value={next.stars} />
            </span>
            <span class="meta">
              tier {next.tier} · {next.length} {next.noun}
              {next.marking && ` · ${markingShort(next.marking)}`}
            </span>
            <span class="meta next-retries" data-testid="retries-pending">
              {retriesLine(retriesPending, next.retries)}
            </span>
          </p>
          <Button arrow onClick={onStart}>
            Start session
          </Button>
          <div class="spot-pair" role="group" aria-label="Spot check">
            <Button variant="secondary" onClick={() => onSpotCheck(1)} data-testid="spot-check-1">
              Spot check · 1
            </Button>
            <Button variant="secondary" onClick={() => onSpotCheck(3)} data-testid="spot-check-3">
              Spot check · 3
            </Button>
          </div>
        </>
      }
    >
      <header class="home-head">
        <h1 class="wordmark">Margins</h1>
        <p class="meta">Case math, daily.</p>
        <Button variant="quiet" class="home-settings" onClick={onSettings} data-testid="open-settings">
          Settings
        </Button>
      </header>

      {notice && (
        <Banner role="status" testId="store-notice">
          {notice}
        </Banner>
      )}

      <LevelMeter xp={xp} />

      <StreakPanel streak={streak} />

      <Stats label="Your progress">
        <Stat label="Answered" value={formatNumber(totals.answered)} testId="answered-count" />
        <Stat label="Accuracy" value={accuracy === null ? '—' : `${accuracy}%`} />
        <Stat label="Sessions" value={formatNumber(totals.sessionsFinished)} />
      </Stats>

      <RowList label="More practice">
        <Row title="Skills" meta="Start a session in any skill" onClick={onSkills} testId="skills-entry" />
        <MockRow mocks={mocks} onOpen={onOpenMocks} />
        <Row title="Trends" meta="Mock score and time per drill" onClick={onOpenTrends} testId="trends-entry" />
        <Row title="Sprint" meta={`${formatNumber(SPRINT_MS / 1000)} seconds · one drill skill`} onClick={onSprint} testId="sprint-row" />
        {booklets.length > 0 && (
          <Row
            title="Booklet library"
            meta={`${booklets.length} booklets · ${library.correct} of ${library.total} correct`}
            onClick={onOpenLibrary}
            testId="library-entry"
          />
        )}
        <Row title="Badges" meta="Every badge, earned and to come" onClick={onProfile} testId="open-profile" />
      </RowList>
    </Screen>
  );
}

function retriesLine(pending: number, inSession: number): string {
  if (pending === 0) return 'No retries pending';
  const count = `${formatNumber(pending)} ${pending === 1 ? 'retry' : 'retries'} pending`;
  return inSession > 0 ? `${count} · ${formatNumber(inSession)} in this session` : count;
}

export function LevelMeter({ xp }: { xp: number }) {
  const level = levelFor(xp);
  const pct = level.xpForLevel === 0 ? 100 : (level.xpIntoLevel / level.xpForLevel) * 100;
  return (
    <Panel
      label="Level"
      testId="level"
      title={<span data-testid="rank">{level.rank}</span>}
      meta={`${formatNumber(xp)} XP`}
      foot={level.nextRank ? `${formatNumber(level.xpForLevel - level.xpIntoLevel)} XP to ${level.nextRank}` : 'Top rank reached'}
    >
      <ProgressBar value={pct} label="Level progress" />
    </Panel>
  );
}

export function StreakPanel({ streak }: { streak: StreakStatus }) {
  const { current, longest, securedToday, xpToday, dailyGoal, goalMet } = streak;
  const days = (n: number) => `${formatNumber(n)} ${n === 1 ? 'day' : 'days'}`;
  return (
    <Panel
      label="Streak and daily goal"
      testId="streak-panel"
      title={
        <span data-testid="streak-count">
          <Flaps value={formatNumber(current)} /> {current === 1 ? 'day' : 'days'}
        </span>
      }
      meta={
        <span class={securedToday ? 'streak-secured' : undefined} data-testid="today-status">
          {securedToday ? 'Today secured' : current > 0 ? 'Finish a session to keep it' : longest > 0 ? 'Finish a session to start again' : 'Finish a session to start'}
        </span>
      }
      foot={`Longest ${days(longest)}`}
    >
      <p class="goal-line meta">
        <span>Daily goal</span>
        <span data-testid="goal-progress">
          {formatNumber(xpToday)} / {formatNumber(dailyGoal)} XP{goalMet ? ' · met' : ''}
        </span>
      </p>
      <ProgressBar value={Math.min(100, (xpToday / dailyGoal) * 100)} label="Daily goal" />
    </Panel>
  );
}
