import { useEffect, useState } from 'preact/hooks';
import type { Happening } from '../../engine/progress';
import { pressKey, readEntry } from '../../engine/question';
import type { DrillQuestion, Key, Mark } from '../../engine/question';
import { useTypingKeys } from '../entry';
import { formatFigure, markingLabel, toleranceNote, SKILL_NAMES } from '../format';
import { Banner, Button, Callout, cx, Dock, Keypad, PaceBar, Screen, ScreenBar, Tally } from '../parts';

export interface Feedback {
  typed: number;
  mark: Mark;
  xp: Extract<Happening, { kind: 'xp-earned' }> | null;
  /** The rank this answer promoted to, if it crossed one. */
  promotedTo?: string | null;
}

interface Props {
  question: DrillQuestion;
  /** The drill brings back an earlier miss. */
  retry?: boolean;
  index: number;
  total: number;
  /** Results so far, one per answered question. */
  results: boolean[];
  feedback: Feedback | null;
  onAnswer(value: number): void;
  onNext(): void;
  onLeave(): void;
}

export function Session({ question, retry = false, index, total, results, feedback, onAnswer, onNext, onLeave }: Props) {
  // What is typed belongs to one drill: a new drill starts empty on its very first frame, never showing the last answer.
  const [typed, setTyped] = useState({ id: question.id, text: '' });
  const entry = typed.id === question.id ? typed.text : '';
  const setEntry = (next: (current: string) => string) => setTyped((t) => ({ id: question.id, text: next(t.id === question.id ? t.text : '') }));
  const value = readEntry(entry)?.value ?? null;
  const isLast = index === total - 1;

  const submit = () => {
    if (value !== null && !feedback) onAnswer(value);
  };

  useTypingKeys(!feedback, (key) => setEntry((current) => pressKey(current, key)), submit);

  // After answering, Enter moves on.
  useEffect(() => {
    if (!feedback) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      onNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Screen layout="task" class={cx('session', feedback && 'session-feedback')}>
      <ScreenBar
        leading={
          <Button variant="quiet" onClick={onLeave}>
            Leave
          </Button>
        }
        center={<Tally results={results} total={total} current={index} label={`Drill ${index + 1} of ${total}`} />}
        trailing={`${index + 1}/${total}`}
      />

      <section class="stage" aria-live="polite">
        <PaceBar key={question.id} durationMs={question.targetTimeMs} stopped={feedback !== null} testId="pace-bar" />
        <p class="label stage-label" data-testid="marking">
          {retry && <RetryMark />}
          {SKILL_NAMES[question.skill]} <span aria-hidden="true">·</span> {markingLabel(question.answer.marking, question.answer.unit)}
        </p>
        <p class="prompt" data-testid="prompt" style={{ '--chars': question.prompt.length }}>
          {question.prompt}
        </p>
        <p
          class={cx('entry', feedback && (feedback.mark.correct ? 'entry-hit' : 'entry-miss'))}
          data-testid="entry"
          style={feedback && !feedback.mark.correct ? { '--chars': boardChars(feedback, question.answer.unit) } : undefined}
        >
          <span class="entry-eq" aria-hidden="true">
            =
          </span>
          {feedback && !feedback.mark.correct ? (
            <>
              <span class="entry-typed">
                <span class="entry-tag">You typed</span>
                <span class="entry-value">{formatFigure(feedback.typed) + question.answer.unit}</span>
              </span>
              <span class="entry-answer" data-testid="board-answer">
                <span class="entry-tag">Answer</span>
                <span class="entry-right">
                  {formatFigure(feedback.mark.expected)}
                  {question.answer.unit}
                </span>
              </span>
            </>
          ) : (
            <span class="entry-value">{feedback ? formatFigure(feedback.typed) + question.answer.unit : entry.replace('-', '−')}</span>
          )}
          {!feedback && <span class="caret" aria-hidden="true" />}
          {!feedback && question.answer.unit && <span class="entry-unit">{question.answer.unit}</span>}
        </p>
      </section>

      {feedback ? (
        <FeedbackPanel question={question} feedback={feedback} isLast={isLast} onNext={onNext} />
      ) : (
        <Dock label="Answer">
          <Keypad
            onKey={(key: Key) => setEntry((current) => pressKey(current, key))}
            action={{ label: 'Submit', onPress: submit, disabled: value === null }}
          />
        </Dock>
      )}
    </Screen>
  );
}

/** Characters the miss board must fit on one line: both figures with their units, and a gap between them. */
function boardChars(feedback: Feedback, unit: string): number {
  return formatFigure(feedback.typed).length + formatFigure(feedback.mark.expected).length + unit.length * 2 + 2;
}

export function xpWhy(xp: NonNullable<Feedback['xp']>): string {
  const parts = ['base'];
  if (xp.speedBonus > 0) parts.push(`+${xp.speedBonus} speed`);
  if (xp.comboBonus > 0) parts.push(`+${xp.comboBonus} combo x${xp.combo}`);
  return parts.length === 1 ? `+${xp.base} base` : `+${xp.base} base ${parts.slice(1).join(' ')}`;
}

/** XP for one answer, with how it was made up. Shared by drill and scenario feedback. */
export function XpLine({ xp, promotedTo = null }: { xp: Feedback['xp']; promotedTo?: string | null | undefined }) {
  if (!xp) return null;
  return (
    <>
      <p class="xp-line" data-testid="xp-line">
        <strong class={cx('xp-amount', xp.xp === 0 && 'xp-none')}>{xp.xp > 0 ? `+${xp.xp} XP` : '0 XP'}</strong>
        <span class="meta">{xp.xp > 0 ? xpWhy(xp) : 'wrong answers earn nothing and reset the combo'}</span>
      </p>
      {promotedTo && (
        <Banner tone="win" kicker="Promoted" testId="answer-level-up">
          {promotedTo}
        </Banner>
      )}
    </>
  );
}

/** The shortcut, then the worked solution, then any note on the answer. The shortcut leads so it is on screen without scrolling at Safari height. Shared by drill and scenario feedback and the mock review. */
export function Solution({ steps, shortcut, note }: { steps: string[]; shortcut: string; note?: string | undefined }) {
  return (
    <>
      {shortcut && (
        <>
          <h2 class="feedback-head">Shortcut</h2>
          <Callout>{shortcut}</Callout>
        </>
      )}
      <h2 class="feedback-head">Worked solution</h2>
      <ol class="steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {note && (
        <>
          <h2 class="feedback-head">Note</h2>
          <p class="meta solution-note" data-testid="solution-note">
            {note}
          </p>
        </>
      )}
    </>
  );
}

function FeedbackPanel({ question, feedback, isLast, onNext }: { question: DrillQuestion; feedback: Feedback; isLast: boolean; onNext(): void }) {
  const { correct, expected } = feedback.mark;
  const { marking } = question.answer;
  return (
    <Dock
      sheet
      label="Feedback"
      class={correct ? 'feedback-hit' : 'feedback-miss'}
      footer={
        <Button arrow onClick={onNext} autoFocus>
          {isLast ? 'See summary' : 'Next drill'}
        </Button>
      }
    >
      <p class="verdict" role="status">
        <span class="verdict-word">{correct ? 'Correct' : 'Not quite'}</span>
        <span class="verdict-answer">
          {question.prompt} = <strong data-testid="correct-value">{formatFigure(expected)}</strong>
          {question.answer.unit}
        </span>
        {marking.mode === 'tolerance' && (
          <span class="meta" data-testid="tolerance-note">
            {toleranceNote(marking.percent, question.answer.unit)}
          </span>
        )}
      </p>
      <XpLine xp={feedback.xp} promotedTo={feedback.promotedTo} />
      <Solution steps={question.solution} shortcut={question.shortcut} />
    </Dock>
  );
}

/** Leads the stage line of a question that brings back an earlier miss. */
export function RetryMark() {
  return (
    <span class="retry-mark" data-testid="retry-mark">
      Retry
    </span>
  );
}
