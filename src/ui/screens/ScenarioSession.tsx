import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Happening } from '../../engine/progress';
import type { ContextBlock, Mark, Question } from '../../engine/question';
import { Chart } from '../chart/Chart';
import { SKILL_NAMES } from '../format';
import type { Ref } from 'preact';
import { Button, Dock, DataTable, OptionCard, OptionList, PaceBar, Screen, ScreenBar, Tally } from '../parts';
import type { OptionState } from '../parts';
import { RetryMark, Solution, XpLine } from './Session';

export interface ChoiceFeedback {
  chosen: number;
  mark: Mark;
  xp: Extract<Happening, { kind: 'xp-earned' }> | null;
  /** The rank this answer promoted to, if it crossed one. */
  promotedTo?: string | null;
}

interface Props {
  question: Question;
  /** The question brings back an earlier miss. */
  retry?: boolean;
  /** Part of a spot check: the skill stays unnamed until the answer is in, and one question needs no tally. */
  spotCheck?: boolean;
  index: number;
  total: number;
  /** Results so far, one per answered question. */
  results: boolean[];
  feedback: ChoiceFeedback | null;
  onAnswer(index: number): void;
  onNext(): void;
  onLeave(): void;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ScenarioSession({ question, retry = false, spotCheck = false, index, total, results, feedback, onAnswer, onNext, onLeave }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const options = question.answer.kind === 'choice' ? question.answer.options : [];
  const isLast = index === total - 1;

  // A layout effect, so a new question starts at the top before it is painted. A passive effect ran after the
  // first paint and could throw a scroll the owner (or a check) had already made back to the top.
  useLayoutEffect(() => {
    setSelected(null);
    scroller.current?.scrollTo({ top: 0 });
  }, [question.id]);

  // After answering, bring the prompt to the top so the chosen and correct options show together above the verdict.
  useEffect(() => {
    if (feedback) promptRef.current?.scrollIntoView({ block: 'start', behavior: prefersMotion() ? 'smooth' : 'auto' });
  }, [feedback]);

  const submit = () => {
    if (selected !== null && !feedback) onAnswer(selected);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (feedback) onNext();
        else submit();
        return;
      }
      if (feedback) return;
      const pick = optionFromKey(event.key, options.length);
      if (pick !== null) setSelected(pick);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const docked = dockedOptions(question);
  // A single question is not dressed as a list: no tally, no "1/1".
  const single = spotCheck && total === 1;
  return (
    <Screen layout="task" class="scenario">
      <ScreenBar
        leading={
          <Button variant="quiet" onClick={onLeave}>
            Leave
          </Button>
        }
        center={
          single ? (
            <span class="meta" data-testid="spot-check-bar">
              Spot check · 1 question
            </span>
          ) : (
            <Tally results={results} total={total} current={index} label={`Question ${index + 1} of ${total}`} />
          )
        }
        {...(single ? {} : { trailing: `${index + 1}/${total}` })}
      />

      <div class="scenario-body">
        <div class="scenario-pace">
          <PaceBar key={question.id} durationMs={question.targetTimeMs} stopped={feedback !== null} />
        </div>

        <div class="scenario-scroll" ref={scroller}>
          {spotCheck ? (
            // The skill is the first hint to the method, so a spot check keeps it back until the answer is in (a booklet retry too).
            <p class="label" data-testid="question-label">
              {retry && <RetryMark />}
              Spot check <span aria-hidden="true">·</span> {feedback ? SKILL_NAMES[question.skill] : 'pick one'}
            </p>
          ) : question.booklet ? (
            <div class="case-source" data-testid="booklet-ref">
              <p class="label">
                {retry && <RetryMark />}
                {question.booklet.name} <span aria-hidden="true">·</span>{' '}
                {question.booklet.part && (
                  <>
                    {question.booklet.part} <span aria-hidden="true">·</span>{' '}
                  </>
                )}
                Question {question.booklet.number}
              </p>
              <p class="meta">
                {question.booklet.caseTitle} · {SKILL_NAMES[question.skill]}
              </p>
            </div>
          ) : (
            <p class="label">
              {retry && <RetryMark />}
              {SKILL_NAMES[question.skill]} <span aria-hidden="true">·</span> pick one
            </p>
          )}

          <CaseBody
            question={question}
            promptRef={promptRef}
            state={(i) => optionState(i, selected, feedback)}
            options={docked ? 'elsewhere' : 'inline'}
            {...(feedback ? {} : { onSelect: setSelected })}
          />

          {feedback && (
            <section class={`case-feedback ${feedback.mark.correct ? 'feedback-hit' : 'feedback-miss'}`} aria-label="Feedback">
              <ChoiceVerdict word={feedback.mark.correct ? 'Correct' : 'Not quite'} question={question} correctIndex={feedback.mark.expected} role="status" />
              <XpLine xp={feedback.xp} promotedTo={feedback.promotedTo} />
              <Solution steps={question.solution} shortcut={question.shortcut} note={question.note} />
            </section>
          )}
        </div>
      </div>

      <Dock
        label="Answer"
        {...(docked ? { class: 'scenario-dock' } : {})}
        footer={
          feedback ? (
            <Button key="next" arrow onClick={onNext}>
              {isLast ? 'See summary' : 'Next question'}
            </Button>
          ) : (
            <Button key="submit" disabled={selected === null} onClick={submit}>
              Submit
            </Button>
          )
        }
      >
        {docked && (
          <div class="scenario-options">
            <CaseOptions question={question} state={(i) => optionState(i, selected, feedback)} {...(feedback ? {} : { onSelect: setSelected })} />
          </div>
        )}
      </Dock>
    </Screen>
  );
}

/** How an option looks: chosen before answering; afterwards the correct one, the wrong pick if any, the rest muted. */
function optionState(i: number, selected: number | null, feedback: ChoiceFeedback | null): OptionState {
  if (!feedback) return selected === i ? 'selected' : 'idle';
  if (i === feedback.mark.expected) return 'correct';
  if (i === feedback.chosen) return 'wrong';
  return 'muted';
}

interface CaseBodyProps {
  question: Question;
  /** How each option looks. */
  state(index: number): OptionState;
  /** Choosing an option; omit once the question is marked. */
  onSelect?(index: number): void;
  promptRef?: Ref<HTMLParagraphElement>;
  /** `elsewhere` when the screen docks the options under the thumb (see `dockedOptions`) and renders `CaseOptions` itself. */
  options?: 'inline' | 'elsewhere';
}

/** A multiple-choice question's body: its context blocks, the prompt, and the options. Shared by scenario sessions and mocks. */
export function CaseBody({ question, state, onSelect, promptRef, options = 'inline' }: CaseBodyProps) {
  return (
    <>
      <div class="case">
        {question.context.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
      <p class="case-prompt" data-testid="prompt" {...(promptRef ? { ref: promptRef } : {})}>
        {question.prompt}
      </p>
      {options === 'inline' && <CaseOptions question={question} state={state} {...(onSelect ? { onSelect } : {})} />}
    </>
  );
}

/** Options short enough to sit two to a row in the dock on the narrowest phone, with their figures still at reading size. */
const DOCK_MAX_CHARS = 8;

/**
 * Whether a question's options are docked above Submit instead of following the question in the scroll.
 * Short figures are: the chart or table and the question scroll above them while the four answers stay
 * under the thumb, so a value can be re-read without scrolling back and forth. Sentences stay in the flow.
 */
export function dockedOptions(question: Question): boolean {
  return question.answer.kind === 'choice' && question.answer.options.length <= 4 && longestOption(question) <= DOCK_MAX_CHARS;
}

/** The options of a multiple-choice question. */
export function CaseOptions({ question, state, onSelect }: Pick<CaseBodyProps, 'question' | 'state' | 'onSelect'>) {
  const options = question.answer.kind === 'choice' ? question.answer.options : [];
  return (
    <OptionList label="Options" compact={compactOptions(question)} chars={longestOption(question)}>
      {options.map((option, i) => (
        <OptionCard key={i} letter={LETTERS[i]!} state={state(i)} {...(onSelect ? { onSelect: () => onSelect(i) } : {})}>
          {option}
        </OptionCard>
      ))}
    </OptionList>
  );
}

interface ChoiceVerdictProps {
  /** "Correct", "Not quite", "Unanswered". */
  word: string;
  question: Question;
  correctIndex: number;
  /** The wrong option chosen, said before the answer (mock review). */
  chosen?: number | null;
  role?: 'status';
}

/** The verdict after a multiple-choice question: the word, then the right letter and option. */
export function ChoiceVerdict({ word, question, correctIndex, chosen = null, role }: ChoiceVerdictProps) {
  const options = question.answer.kind === 'choice' ? question.answer.options : [];
  return (
    <p class="verdict" role={role}>
      <span class="verdict-word">{word}</span>
      <span class="verdict-answer">
        {chosen !== null && chosen !== correctIndex && <>You chose {LETTERS[chosen]}. </>}
        Answer <strong data-testid="correct-value">{LETTERS[correctIndex]}</strong>: {options[correctIndex]}
      </span>
    </p>
  );
}

/** The option a key picks: its letter (A, B, ...) or its number (1, 2, ...); null for any other key. */
export function optionFromKey(key: string, count: number): number | null {
  const letter = LETTERS.indexOf(key.toUpperCase());
  const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  const pick = letter >= 0 ? letter : digit;
  return pick >= 0 && pick < count ? pick : null;
}

export function Block({ block }: { block: ContextBlock }) {
  switch (block.type) {
    case 'chart':
      return <Chart block={block} />;
    case 'paragraph':
      return <p class="case-para">{block.text}</p>;
    case 'list':
      return (
        <ul class="case-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'table':
      return <DataTable {...(block.title ? { title: block.title } : {})} headers={block.headers} rows={block.rows} />;
  }
}

/** Short figures go two to a row in the numeral face, sized to the longest; sentences stay one to a row. */
const COMPACT_MAX_CHARS = 11;

export function longestOption(question: Question): number {
  return question.answer.kind === 'choice' ? Math.max(...question.answer.options.map((o) => o.length)) : Infinity;
}

export function compactOptions(question: Question): boolean {
  return longestOption(question) <= COMPACT_MAX_CHARS;
}

function prefersMotion(): boolean {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
