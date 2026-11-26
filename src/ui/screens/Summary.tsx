import { isPerfect } from '../../engine/progress';
import type { Happening, SpotCheckLength, SpotCheckSeen } from '../../engine/progress';
import { formatDuration, formatNumber } from '../format';
import { Banner, Button, cx, Flaps, Panel, ProgressBar, Screen, Stat, Stats, Tally } from '../parts';
import { useArrivalGuard } from '../arrival';
import { LevelMeter } from './Home';
import { NewBadges } from './NewBadges';
import type { BadgeWin } from './NewBadges';

/** What the summary of a spot check adds: its length, its question's target time, and how much of the test-level set has been seen. */
export interface SpotCheckSummary {
  length: SpotCheckLength;
  /** The target time of the first question: the third stat when there is only one. */
  targetTimeMs: number;
  seen: SpotCheckSeen;
}

interface Props {
  result: Extract<Happening, { kind: 'session-finished' }>;
  results: boolean[];
  levelUps: string[];
  badges?: BadgeWin[];
  xpNow: number;
  /** What the session was made of, for labels: drills or scenario questions. */
  noun?: 'drill' | 'question';
  /** Set when the session was a spot check. */
  spotCheck?: SpotCheckSummary;
  onAgain(): void;
  onHome(): void;
}

export function Summary({ result, results, levelUps, badges = [], xpNow, noun = 'drill', spotCheck, onAgain, onHome }: Props) {
  const Noun = noun === 'drill' ? 'Drill' : 'Question';
  const { score, total, timeMs } = result;
  const allRight = score === total;
  const perfect = isPerfect({ questionCount: total, correctCount: score });
  const single = spotCheck?.length === 1;
  const settled = useArrivalGuard();
  return (
    <Screen
      class="summary"
      actions={
        <>
          <Button arrow {...settled(onAgain)}>
            {spotCheck ? (single ? 'Another question' : 'Another spot check') : 'Another session'}
          </Button>
          <Button variant="secondary" {...settled(onHome)}>
            Home
          </Button>
        </>
      }
    >
      <header class="summary-head">
        <p class="label">{spotCheck ? 'Spot check done' : 'Session done'}</p>
        <p class="score" data-testid="score">
          <Flaps value={String(score)} size="hero" class={cx('score-hit', perfect && 'score-perfect')} />
          <span class="score-of">/{total}</span>
        </p>
        <p class="meta">{perfect ? 'Clean sheet.' : allRight && total <= 2 ? (total === 1 ? 'One for one.' : 'Two for two.') : score >= total - 1 && total > 1 ? 'Nearly clean.' : 'Worth another go.'}</p>
      </header>

      <Tally variant="blocks" results={results} total={total} label="Results" itemName={Noun} />

      <Stats label={spotCheck ? 'This spot check' : 'This session'}>
        <Stat label="XP earned" value={`+${formatNumber(result.xp)}`} tone="accent" testId="session-xp" />
        <Stat label="Time" value={formatDuration(timeMs)} testId="session-time" />
        {spotCheck && single ? (
          <Stat label="Target" value={formatDuration(spotCheck.targetTimeMs)} testId="target-time" />
        ) : (
          <Stat label={`Per ${noun}`} value={formatDuration(timeMs / Math.max(total, 1))} />
        )}
      </Stats>

      {levelUps.length > 0 && (
        <Banner tone="win" kicker="Promoted" role="status" testId="level-up">
          {levelUps[levelUps.length - 1]}
        </Banner>
      )}

      <NewBadges badges={badges} banner={levelUps.length === 0} />

      {spotCheck && <TestLevel seen={spotCheck.seen} misses={results.filter((r) => !r).length} />}

      <LevelMeter xp={xpNow} />
    </Screen>
  );
}

/** How much of the test-level set has been seen, and what happens to this spot check's misses. */
function TestLevel({ seen: { seen, total }, misses }: { seen: SpotCheckSeen; misses: number }) {
  return (
    <Panel
      label="Test-level questions"
      testId="test-level"
      title="Test level"
      meta={`${formatNumber(seen)} of ${formatNumber(total)} seen`}
      foot={
        misses === 0
          ? seen === total
            ? 'All seen. The oldest come round again.'
            : 'Unseen questions come first'
          : `${formatNumber(misses)} ${misses === 1 ? 'miss comes back as a retry' : 'misses come back as retries'} in a session or a 3-question spot check`
      }
    >
      {/* At least a sliver once anything is seen, so the first few questions show. */}
      <ProgressBar value={seen === 0 ? 0 : Math.max(2, (seen / total) * 100)} tone="neutral" label="Test-level questions seen" />
    </Panel>
  );
}
