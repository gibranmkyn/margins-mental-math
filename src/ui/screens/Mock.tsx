import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { MOCK_LENGTHS, MOCK_PASS_PERCENT, mockTimedOut } from '../../engine/progress';
import type { MockLength, MockMix, MockPlan, MockQuestionResult, MockRecord } from '../../engine/progress';
import { hasBooklets } from '../../engine/question';
import type { Question } from '../../engine/question';
import { formatDay, formatDuration, formatNumber, SKILL_NAMES } from '../format';
import { Banner, Button, Chip, ChipGroup, Clock, cx, Dock, Flaps, QuestionNav, Row, RowList, Screen, ScreenBar, Stat, Stats, Tally } from '../parts';
import type { OptionState } from '../parts';
import { NewBadges } from './NewBadges';
import type { BadgeWin } from './NewBadges';
import { CaseBody, ChoiceVerdict, LETTERS, optionFromKey } from './ScenarioSession';
import { Solution } from './Session';
import { useArrivalGuard } from '../arrival';
import { useCountdown } from '../countdown';
import { visibleNow } from '../visible-clock';

/** The clock turns the accent for the last two minutes. */
const LOW_MS = 2 * 60_000;
/** How long a first press of Leave waits for the second. */
const LEAVE_CONFIRM_MS = 4000;

const LENGTH_NAMES: Record<MockLength, string> = { short: 'Short', full: 'Full' };

function lengthLine(length: MockLength): string {
  const { questions, minutes } = MOCK_LENGTHS[length];
  return `${questions} questions · ${minutes} min`;
}

/* ---------- Home: the way in ---------- */

/** The home screen's way into mocks: one row in its list, with the last result. */
export function MockRow({ mocks, onOpen }: { mocks: MockRecord[]; onOpen(): void }) {
  const last = mocks[mocks.length - 1];
  return (
    <Row
      title="Mock"
      meta={last ? `Last ${last.percent}% · ${last.passed ? 'passed' : `below ${MOCK_PASS_PERCENT}%`}` : `${MOCK_LENGTHS.short.questions} in ${MOCK_LENGTHS.short.minutes} min, or ${MOCK_LENGTHS.full.questions} in ${MOCK_LENGTHS.full.minutes}`}
      onClick={onOpen}
      testId="mock-entry"
    />
  );
}

/* ---------- Before the clock starts ---------- */

interface ReadyProps {
  length: MockLength;
  /** Where the chosen length's questions would come from. */
  mix: MockMix;
  /** Mocks sat so far, oldest first. */
  history: MockRecord[];
  onLength(length: MockLength): void;
  onStart(): void;
  onHome(): void;
}

export function MockReady({ length, mix, history, onLength, onStart, onHome }: ReadyProps) {
  const recent = history.slice(-5).reverse();
  return (
    <Screen
      class="mock-ready"
      actions={
        <>
          <p class="next-meta" data-testid="mock-next">
            <strong>{LENGTH_NAMES[length]} mock</strong>
            <span class="meta">{lengthLine(length)}</span>
          </p>
          <Button arrow onClick={onStart}>
            Start mock
          </Button>
          <Button variant="secondary" onClick={onHome}>
            Home
          </Button>
        </>
      }
    >
      <header class="mock-head">
        <p class="label">Mock</p>
        <h1 class="mock-title">Sit a mock</h1>
      </header>

      <ChipGroup label="Length">
        {(['short', 'full'] as const).map((l) => (
          <Chip key={l} pressed={l === length} onClick={() => onLength(l)} ariaLabel={`${LENGTH_NAMES[l]} mock: ${lengthLine(l)}`}>
            {MOCK_LENGTHS[l].questions} in {MOCK_LENGTHS[l].minutes}m
          </Chip>
        ))}
      </ChipGroup>

      <ul class="case-list mock-rules">
        <li>No feedback until you submit.</li>
        <li>Skip, flag and come back. Change any answer until the end.</li>
        <li>The mock submits itself when the clock reaches zero.</li>
        <li>Pass mark {MOCK_PASS_PERCENT}%. Every question is reviewed at the end; misses come back as retries.</li>
      </ul>

      <p class="meta" data-testid="mock-mix">
        {!hasBooklets()
          ? `All ${formatNumber(mix.other)} generated or authored.`
          : mix.booklet === 0
            ? `No booklet questions left open: all ${formatNumber(mix.other)} generated or authored.`
            : mix.booklet < mix.half
              ? `${formatNumber(mix.booklet)} booklet questions still open; ${formatNumber(mix.other)} generated or authored fill the rest.`
              : `${formatNumber(mix.booklet)} from your booklets, ${formatNumber(mix.other)} generated or authored.`}
      </p>

      {recent.length > 0 && (
        <RowList label="Past mocks">
          {recent.map((m) => (
            <Row
              key={m.id}
              title={<span class="mock-percent">{m.percent}%</span>}
              meta={`${LENGTH_NAMES[m.length]} · ${formatDay(m.finishedAt)} · ${m.correctCount}/${m.questionCount}`}
              trailing={<span class={cx('label', 'mock-mark', m.passed && 'mock-mark-pass')}>{m.passed ? 'Passed' : `Below ${MOCK_PASS_PERCENT}%`}</span>}
            />
          ))}
        </RowList>
      )}
    </Screen>
  );
}

/* ---------- Sitting the mock ---------- */

/** Where a mock has got to: what is saved after every change so a reload can resume it. */
export interface MockState {
  index: number;
  choices: Array<number | null>;
  flagged: boolean[];
  /** Time spent on each question so far, while the app was visible. */
  spentMs: number[];
}

interface RunProps {
  plan: MockPlan;
  /** Wall-clock start (Date.now()), so time keeps counting while the phone sleeps. */
  startedAt: number;
  /** Carry on from here: a mock saved before a reload. */
  resume?: MockState;
  /** Every change, and whenever the app is hidden, so it can be saved. */
  onChange?(state: MockState): void;
  /** Called once: by the owner, or by the clock at zero. */
  onSubmit(choices: Array<number | null>, timesMs: number[], timeMs: number): void;
  onLeave(): void;
}

/**
 * One question at a time, no feedback. The question scrolls; the navigator, Back,
 * Flag and Skip/Next stay docked under the thumb, the clock pinned in the bar.
 * Submit opens the finish view, which lists anything unanswered before the final press.
 */
export function MockRun({ plan, startedAt, resume, onChange, onSubmit, onLeave }: RunProps) {
  const total = plan.questions.length;
  const [index, setIndex] = useState(() => Math.max(0, Math.min(total - 1, resume?.index ?? 0)));
  const [view, setView] = useState<'question' | 'finish'>('question');
  const [choices, setChoices] = useState<Array<number | null>>(() => resume?.choices ?? plan.questions.map(() => null));
  const [flagged, setFlagged] = useState<boolean[]>(() => resume?.flagged ?? plan.questions.map(() => false));
  const [leaving, setLeaving] = useState(false);
  const spent = useRef<number[]>(resume?.spentMs.slice() ?? plan.questions.map(() => 0));
  const shownAt = useRef(visibleNow());
  const done = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef({ index, view, choices, flagged, onSubmit, onChange });
  latest.current = { index, view, choices, flagged, onSubmit, onChange };

  const deadline = startedAt + plan.timeLimitMs;
  const question = plan.questions[index]!;
  const chosen = choices[index] ?? null;
  const answered = choices.map((c) => c !== null);

  /** Add the time on screen to the question showing (time the app was hidden never counts). */
  const bank = () => {
    const at = visibleNow();
    if (latest.current.view === 'question') spent.current[latest.current.index]! += at - shownAt.current;
    shownAt.current = at;
  };

  const submit = () => {
    if (done.current) return;
    done.current = true;
    bank();
    latest.current.onSubmit(
      latest.current.choices,
      spent.current.map((ms) => Math.round(ms)),
      Math.min(Date.now() - startedAt, plan.timeLimitMs),
    );
  };

  /** Hand the current state out to be saved. */
  const save = () => {
    if (done.current) return;
    bank();
    const { index: i, choices: c, flagged: f, onChange: changed } = latest.current;
    changed?.({ index: i, choices: c, flagged: f, spentMs: spent.current.map((ms) => Math.round(ms)) });
  };

  useLayoutEffect(save, [index, choices, flagged]);

  // Saved again as the app is hidden: the phone may close it from there.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) save();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // The clock: checked often, and again whenever the page comes back into view. At zero it submits.
  const left = useCountdown(deadline, submit);

  const low = left <= LOW_MS;

  // Before paint, so it cannot undo a scroll made in the first frame (see ScenarioSession).
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [index, view]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), LEAVE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const go = (i: number) => {
    bank();
    setIndex(Math.max(0, Math.min(total - 1, i)));
    setView('question');
  };
  const openFinish = () => {
    bank();
    setView('finish');
  };
  const next = () => (index === total - 1 ? openFinish() : go(index + 1));
  /** Choose an option; choosing the chosen one again clears it. */
  const choose = (option: number) => setChoices((current) => current.map((c, i) => (i === index ? (c === option ? null : option) : c)));
  const toggleFlag = () => setFlagged((current) => current.map((f, i) => (i === index ? !f : f)));
  const leave = () => (leaving ? onLeave() : setLeaving(true));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || view !== 'question') return;
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(index - 1);
        return;
      }
      const pick = optionFromKey(event.key, question.answer.kind === 'choice' ? question.answer.options.length : 0);
      if (pick !== null) choose(pick);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (view === 'finish') {
    const unanswered = answered.flatMap((a, i) => (a ? [] : [i + 1]));
    const marked = flagged.flatMap((f, i) => (f ? [i + 1] : []));
    return (
      <Screen
        class="mock-finish"
        actions={
          <>
            <Button onClick={submit}>Submit mock</Button>
            <Button variant="secondary" onClick={() => go(index)}>
              Back to questions
            </Button>
          </>
        }
      >
        <header class="mock-head">
          <p class="label">{LENGTH_NAMES[plan.length]} mock</p>
          <h1 class="mock-title">Finish the mock</h1>
        </header>
        <Stats label="So far">
          <Stat label="Answered" value={`${total - unanswered.length}/${total}`} testId="mock-answered" />
          <Stat label="Flagged" value={formatNumber(marked.length)} />
          <Stat label="Time left" value={<Clock ms={left} low={low} board testId="mock-clock" />} />
        </Stats>
        {unanswered.length > 0 ? (
          <Banner testId="unanswered-warning">
            {unanswered.length === 1 ? 'Question' : 'Questions'} {listNumbers(unanswered)} {unanswered.length === 1 ? 'is' : 'are'} unanswered
            and will score zero.
          </Banner>
        ) : (
          <Banner testId="unanswered-warning">All {total} answered. Answers can still change until you submit.</Banner>
        )}
        {marked.length > 0 && <p class="meta">Flagged: {listNumbers(marked)}.</p>}
        <QuestionNav answered={answered} flagged={flagged} current={index} onSelect={go} />
      </Screen>
    );
  }

  return (
    <Screen layout="task" class="mock">
      <ScreenBar
        leading={
          <Button variant="quiet" onClick={leave}>
            {leaving ? 'End mock' : 'Leave'}
          </Button>
        }
        center={
          <span class="meta mock-where" data-testid="mock-where">
            {index + 1} of {total}
          </span>
        }
        trailing={<Clock ms={left} low={low} board testId="mock-clock" />}
      />

      <div class="mock-body">
        <div class="mock-scroll" ref={scroller}>
          {leaving && <Banner>Leaving ends the mock with no score. Press End mock to leave.</Banner>}
          <QuestionHead question={question} number={index + 1} />
          <CaseBody question={question} state={(i) => (chosen === i ? 'selected' : 'idle')} onSelect={choose} />
          <p class="meta mock-hint">{chosen === null ? 'Pick one, or skip and come back.' : 'Press your answer again to clear it.'}</p>
        </div>
      </div>

      <Dock
        label="Mock controls"
        class="mock-dock"
        footer={
          <div class="mock-controls">
            <Button variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
              Back
            </Button>
            <Chip pressed={flagged[index]!} onClick={toggleFlag} ariaLabel="Flag this question">
              Flag
            </Chip>
            <Button arrow onClick={next}>
              {index === total - 1 ? 'Finish' : chosen === null ? 'Skip' : 'Next'}
            </Button>
          </div>
        }
      >
        <div class="mock-navrow">
          <QuestionNav layout="strip" answered={answered} flagged={flagged} current={index} onSelect={go} />
          <Button variant="secondary" onClick={openFinish}>
            Submit
          </Button>
        </div>
      </Dock>
    </Screen>
  );
}

/** Where a question comes from and what it trains: booklet and number for a booklet question. */
function QuestionHead({ question, number }: { question: Question; number: number }) {
  return (
    <div class="case-source">
      <p class="label">
        Question {number} <span aria-hidden="true">·</span> {SKILL_NAMES[question.skill]}
      </p>
      {question.booklet && (
        <p class="meta" data-testid="booklet-ref">
          {question.booklet.name} · {question.booklet.part ? `${question.booklet.part} · ` : ''}Question {question.booklet.number} · {question.booklet.caseTitle}
        </p>
      )}
    </div>
  );
}

/* ---------- The result ---------- */

interface ResultProps {
  result: MockRecord;
  /** The rank reached, when the mock's answers earned a promotion. */
  promotedTo: string | null;
  /** Badges the mock unlocked, e.g. the first pass. */
  badges: BadgeWin[];
  onReview(index: number): void;
  onHome(): void;
}

export function MockResult({ result, promotedTo, badges, onReview, onHome }: ResultProps) {
  const { correctCount, questionCount, percent, passed, questions } = result;
  const firstMiss = questions.findIndex((q) => !q.correct);
  const settled = useArrivalGuard();
  return (
    <Screen
      class="mock-result"
      actions={
        <>
          <Button arrow {...settled(() => onReview(Math.max(0, firstMiss)))}>
            {firstMiss >= 0 ? 'Review misses' : 'Review answers'}
          </Button>
          <Button variant="secondary" {...settled(onHome)}>
            Home
          </Button>
        </>
      }
    >
      <header class="summary-head">
        <p class="label">{LENGTH_NAMES[result.length]} mock done</p>
        <p class="score" data-testid="mock-score">
          <Flaps value={String(correctCount)} size="hero" class={cx('score-hit', correctCount === questionCount && 'score-perfect')} />
          <span class="score-of">/{questionCount}</span>
        </p>
        <p class="mock-verdict" data-testid="mock-verdict">
          <span class="mock-percent">{percent}%</span> <span aria-hidden="true">·</span> {passed ? 'passed' : `below the ${MOCK_PASS_PERCENT}% pass mark`}
        </p>
        {mockTimedOut(result) && (
          <p class="meta" data-testid="mock-timed-out">
            Time ran out. It was submitted with the answers you had.
          </p>
        )}
        <p class="meta streak-secured" data-testid="mock-day-secured">
          Today secured. A finished mock keeps your streak.
        </p>
      </header>

      {promotedTo ? (
        <Banner tone="win" kicker="Promoted" role="status" testId="level-up">
          {promotedTo}
        </Banner>
      ) : (
        passed && (
          <Banner tone="win" kicker="Mock" role="status" testId="mock-passed">
            Passed at {percent}%
          </Banner>
        )
      )}
      <NewBadges badges={badges} banner={!promotedTo && !passed} />

      <Tally variant="blocks" results={questions.map((q) => q.correct)} total={questionCount} label="Results" itemName="Question" />

      <Stats label="This mock">
        <Stat label="Time used" value={formatDuration(result.timeMs)} testId="mock-time" />
        <Stat label="Unanswered" value={formatNumber(questionCount - result.answeredCount)} />
        <Stat label="XP earned" value={`+${formatNumber(result.xp)}`} tone="accent" />
      </Stats>

      <RowList label="Every question">
        {questions.map((q, i) => (
          <Row
            key={q.questionId}
            testId={`mock-row-${i + 1}`}
            title={`${i + 1}. ${SKILL_NAMES[q.skill]}`}
            meta={answerLine(q)}
            trailing={<MarkWord result={q} />}
            onClick={() => onReview(i)}
          />
        ))}
      </RowList>
    </Screen>
  );
}

function answerLine(q: MockQuestionResult): string {
  const right = LETTERS[q.correctIndex]!;
  if (q.chosen === null) return `Unanswered · answer ${right}`;
  return q.correct ? `You ${right} · correct` : `You ${LETTERS[q.chosen]!} · answer ${right}`;
}

/** Right, wrong or blank in words, so the mark never rests on colour alone. */
function MarkWord({ result }: { result: MockQuestionResult }) {
  const word = result.correct ? 'Right' : result.chosen === null ? 'Blank' : 'Wrong';
  return <span class={cx('label', 'mock-mark', result.correct && 'mock-mark-hit', !result.correct && result.chosen !== null && 'mock-mark-miss')}>{word}</span>;
}

/* ---------- Reviewing one question after the mock ---------- */

interface ReviewProps {
  question: Question;
  result: MockQuestionResult;
  index: number;
  total: number;
  onGo(index: number): void;
  onBack(): void;
}

/** One mock question after submission: the owner's answer, the correct one, the worked solution and the shortcut. */
export function MockReview({ question, result, index, total, onGo, onBack }: ReviewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const isLast = index === total - 1;

  // Before paint, so it cannot undo a scroll made in the first frame (see ScenarioSession).
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [index]);

  const state = (i: number): OptionState => (i === result.correctIndex ? 'correct' : i === result.chosen ? 'wrong' : 'muted');
  const verdict = result.correct ? 'Correct' : result.chosen === null ? 'Unanswered' : 'Not quite';

  return (
    <Screen layout="task" class="mock mock-review">
      <ScreenBar
        leading={
          <Button variant="quiet" onClick={onBack}>
            Result
          </Button>
        }
        center={
          <span class="meta mock-where">
            Review · {index + 1} of {total}
          </span>
        }
        trailing={<MarkWord result={result} />}
      />

      <div class="mock-body">
        <div class="mock-scroll" ref={scroller}>
          <QuestionHead question={question} number={index + 1} />
          <CaseBody question={question} state={state} />
          <section class={cx('case-feedback', result.correct ? 'feedback-hit' : 'feedback-miss')} aria-label="Review">
            <ChoiceVerdict word={verdict} question={question} correctIndex={result.correctIndex} chosen={result.chosen} />
            <Solution steps={question.solution} shortcut={question.shortcut} note={question.note} />
          </section>
        </div>
      </div>

      <Dock
        label="Review"
        footer={
          <div class="mock-review-controls">
            <Button variant="secondary" disabled={index === 0} onClick={() => onGo(index - 1)}>
              Back
            </Button>
            <Button arrow onClick={() => (isLast ? onBack() : onGo(index + 1))}>
              {isLast ? 'See result' : 'Next'}
            </Button>
          </div>
        }
      />
    </Screen>
  );
}

/** "4, 7 and 9". */
function listNumbers(numbers: number[]): string {
  if (numbers.length <= 1) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}
