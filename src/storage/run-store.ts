import type { RunInProgress } from '../engine/progress';

/** A mock or session in progress, apart from the progress document: it changes on every tap and is gone once finished. */
export const RUN_KEY = 'margins.run';

export type RunKeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface RunStore {
  /** The run in progress, or null when there is none or it cannot be read. */
  load(): RunInProgress | null;
  save(run: RunInProgress): void;
  clear(): void;
}

/** Never throws: blocked or full storage just means a reload cannot resume. */
export function createRunStore(store: RunKeyValueStore | undefined = safeLocalStorage()): RunStore {
  return {
    load() {
      try {
        const text = store?.getItem(RUN_KEY);
        if (!text) return null;
        const run: unknown = JSON.parse(text);
        return isRun(run) ? run : null;
      } catch {
        return null;
      }
    },
    save(run) {
      try {
        store?.setItem(RUN_KEY, JSON.stringify(run));
      } catch {
        // Full or blocked: the run goes on, it just cannot be resumed after a reload.
      }
    },
    clear() {
      try {
        store?.removeItem(RUN_KEY);
      } catch {
        // Blocked: nothing was saved either.
      }
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isList = (value: unknown, length: number) => Array.isArray(value) && value.length === length;

/** Enough of a run's shape to resume it without crashing a screen. */
function isRun(run: unknown): run is RunInProgress {
  if (!isRecord(run) || !isRecord(run.plan) || typeof run.plan.id !== 'string' || !Array.isArray(run.plan.questions)) return false;
  const questions = run.plan.questions.length;
  if (questions === 0 || !run.plan.questions.every((q) => isRecord(q) && typeof q.id === 'string' && isRecord(q.answer))) return false;
  if (run.kind === 'mock') {
    return (
      typeof run.startedAt === 'number' &&
      typeof run.plan.timeLimitMs === 'number' &&
      typeof run.index === 'number' &&
      isList(run.choices, questions) &&
      isList(run.flagged, questions) &&
      isList(run.spentMs, questions)
    );
  }
  if (run.kind === 'session') {
    return typeof run.savedAt === 'number' && Array.isArray(run.results) && Array.isArray(run.levelUps) && Array.isArray(run.badges);
  }
  return false;
}

function safeLocalStorage(): RunKeyValueStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
