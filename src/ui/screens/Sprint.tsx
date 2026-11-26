import { useEffect, useRef, useState } from 'preact/hooks';
import { skipSprint, SPRINT_MS, SPRINT_START, typeIntoSprint } from '../../engine/progress';
import type { Happening, SprintAnswered } from '../../engine/progress';
import type { DrillQuestion, DrillSkill, Key } from '../../engine/question';
import { useTypingKeys } from '../entry';
import { formatNumber, SKILL_NAMES } from '../format';
import { useArrivalGuard } from '../arrival';
import { useCountdown } from '../countdown';
import { NewBadges } from './NewBadges';
import type { BadgeWin } from './NewBadges';
import { Banner, Button, Clock, cx, Dock, Keypad, Screen, ScreenBar, Stat, Stats } from '../parts';

const LOW_MS = 10_000;

type Result = Extract<Happening, { kind: 'sprint-finished' }>;

/** Before the clock starts: the number to beat, and one button. */
export function SprintReady({ skill, best, onStart, onHome }: { skill: DrillSkill; best: number | null; onStart(): void; onHome(): void }) {
  return (
    <Screen
      class="sprint-ready"
      actions={
        <>
          <Button arrow onClick={onStart}>
            Start sprint
          </Button>
          <Button variant="secondary" onClick={onHome}>
            Home
          </Button>
        </>
      }
    >
      <header class="summary-head">
        <p class="label">{SKILL_NAMES[skill]} sprint</p>
        <p class="score" data-testid="sprint-best">
          <span class="score-hit">{best === null ? '—' : best}</span>
        </p>
        <p class="meta">{best === null ? 'No best yet. Set the first one.' : 'Your best. Beat it.'}</p>
      </header>
      <p class="sprint-rules">
        {formatNumber(SPRINT_MS / 1000)} seconds. As many correct answers as you can. The next drill comes at once; misses cost nothing and do not
        come back.
      </p>
    </Screen>
  );
}

interface RunProps {
  skill: DrillSkill;
  best: number | null;
  /** The next drill; never the same prompt twice running. */
  nextQuestion(previousPrompt: string | null): DrillQuestion;
  onFinish(score: number, attempted: number): void;
  /** Each answer given, for the answer sound. */
  onAnswered?(correct: boolean): void;
  onLeave(): void;
}

/** How long the first press of Stop waits for the second. */
const STOP_CONFIRM_MS = 3000;

interface Last {
  correct: boolean;
  /** What the right answer was. */
  expected: string;
}

/** The sprint itself: a hero count, a clock, the keypad. No feedback sheet: only a one-line signal. */
export function Sprint({ skill, best, nextQuestion, onFinish, onAnswered, onLeave }: RunProps) {
  // The drill on screen and what is typed into it. Handlers read the ref, so keys pressed faster than
  // the screen redraws (a hardware keyboard at speed) still build on each other.
  const [current, setCurrent] = useState(() => ({ question: nextQuestion(null), entry: '' }));
  const onBoard = useRef(current);
  const putOnBoard = (next: typeof current) => {
    onBoard.current = next;
    setCurrent(next);
  };
  const { question, entry } = current;
  const [score, setScore] = useState(0);
  const [last, setLast] = useState<Last | null>(null);
  const tally = useRef(SPRINT_START);
  const done = useRef(false);
  // A wall-clock deadline, like the mock's: locking the phone or switching apps does not pause the sprint,
  // and coming back after they ran out shows the result at once.
  const [deadline] = useState(() => Date.now() + SPRINT_MS);
  const left = useCountdown(
    deadline,
    () => {
      if (done.current) return;
      done.current = true;
      onFinish(tally.current.score, tally.current.attempted);
    },
    100,
  );

  // The progress engine decides when an answer is taken; the screen only shows it and moves on at once.
  const take = ({ tally: counted, mark }: SprintAnswered) => {
    const answered = onBoard.current.question;
    tally.current = counted;
    setScore(counted.score);
    onAnswered?.(mark.correct);
    setLast({ correct: mark.correct, expected: formatNumber(mark.expected) + answered.answer.unit });
    putOnBoard({ question: nextQuestion(answered.prompt), entry: '' });
  };

  // Nothing is taken once the deadline has passed, even before the countdown's next tick has noticed.
  const over = () => done.current || Date.now() >= deadline;

  // A right answer is taken the moment it is on the board; anything else stays to keep typing.
  const type = (key: Key) => {
    if (over()) return;
    const board = onBoard.current;
    const step = typeIntoSprint(tally.current, board.question, board.entry, key);
    if (step.kind === 'answered') take(step);
    else putOnBoard({ question: board.question, entry: step.entry });
  };

  // Skip passes the drill, typed or not: attempted, missed, and the answer shown.
  const skip = () => {
    if (over()) return;
    take(skipSprint(tally.current, onBoard.current.question));
  };

  useTypingKeys(true, type, skip);

  // Stop sits near the keypad's reach: the first press asks, a second within a few seconds leaves.
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!stopping) return;
    const t = setTimeout(() => setStopping(false), STOP_CONFIRM_MS);
    return () => clearTimeout(t);
  }, [stopping]);
  const stop = () => (stopping ? onLeave() : setStopping(true));

  return (
    <Screen layout="task" class="sprint">
      <ScreenBar
        leading={
          <Button variant="quiet" onClick={stop} data-testid="sprint-stop">
            {stopping ? 'Stop now?' : 'Stop'}
          </Button>
        }
        center={<span class="meta">{SKILL_NAMES[skill]} sprint</span>}
        trailing={<span class="meta">{best === null ? 'No best yet' : `Best ${best}`}</span>}
      />

      <section class="stage" aria-label="Sprint">
        <div class="sprint-meter">
          <span class="sprint-count" data-testid="sprint-score" aria-label={`${score} correct`}>
            {score}
          </span>
          <Clock ms={left} size="hero" low={left <= LOW_MS} testId="sprint-clock" />
        </div>
        <p class={cx('sprint-last', last && (last.correct ? 'sprint-last-hit' : 'sprint-last-miss'))} role="status" data-testid="sprint-last">
          {last === null ? 'Go.' : last.correct ? 'Last one: correct' : <>Last one: missed, it was{' '}<strong>{last.expected}</strong></>}
        </p>
        <p class="prompt" data-testid="prompt" style={{ '--chars': question.prompt.length }}>
          {question.prompt}
        </p>
        <p class="entry" data-testid="entry">
          <span class="entry-eq" aria-hidden="true">
            =
          </span>
          <span class="entry-value">{entry.replace('-', '−')}</span>
          <span class="caret" aria-hidden="true" />
          {question.answer.unit && <span class="entry-unit">{question.answer.unit}</span>}
        </p>
      </section>

      <Dock label="Answer">
        <Keypad onKey={type} action={{ label: 'Skip', onPress: skip, variant: 'secondary' }} />
      </Dock>
    </Screen>
  );
}

export function SprintResult({
  result,
  badges = [],
  promotedTo = null,
  onAgain,
  onHome,
}: {
  result: Result;
  badges?: BadgeWin[];
  /** The rank the sprint's XP promoted to, if it did. */
  promotedTo?: string | null;
  onAgain(): void;
  onHome(): void;
}) {
  const { skill, score, attempted, xp, previousBest, newBest } = result;
  const best = newBest ? score : previousBest;
  const settled = useArrivalGuard();
  const bestLine = newBest
    ? previousBest === null
      ? 'First one on the board.'
      : `Up from ${previousBest}.`
    : previousBest === null
      ? 'Nothing on the board yet.'
      : score === previousBest
        ? 'Level with your best.'
        : `${previousBest - score} short of your best.`;
  return (
    <Screen
      class="sprint-result"
      actions={
        <>
          <Button arrow {...settled(onAgain)}>
            Sprint again
          </Button>
          <Button variant="secondary" {...settled(onHome)}>
            Home
          </Button>
        </>
      }
    >
      <header class="summary-head">
        <p class="label">{SKILL_NAMES[skill]} sprint done</p>
        <p class="score" data-testid="sprint-result-score">
          <span class={cx('score-hit', newBest && 'score-perfect')}>{score}</span>
        </p>
        <p class="meta">correct in {formatNumber(SPRINT_MS / 1000)} seconds</p>
      </header>

      {promotedTo ? (
        <>
          <Banner tone="win" kicker="Promoted" role="status" testId="level-up">
            {promotedTo}
          </Banner>
          <p class="meta" data-testid={newBest ? 'personal-best' : 'best-gap'}>
            {newBest ? `New personal best. ${bestLine}` : bestLine}
          </p>
        </>
      ) : newBest ? (
        <Banner tone="win" kicker="New personal best" role="status" testId="personal-best">
          {bestLine}
        </Banner>
      ) : (
        <p class="meta" data-testid="best-gap">
          {bestLine}
        </p>
      )}

      <NewBadges badges={badges} banner={!newBest && !promotedTo} />

      <Stats label="This sprint">
        <Stat label="Correct" value={String(score)} />
        <Stat label="Attempted" value={String(attempted)} />
        <Stat label="Best" value={best === null ? '—' : String(best)} testId="sprint-result-best" />
        <Stat label="XP" value={`+${formatNumber(xp)}`} tone="accent" testId="sprint-result-xp" />
      </Stats>
    </Screen>
  );
}
