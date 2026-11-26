import { compactProgress, DEFAULT_DAILY_GOAL, emptyEarlier, initialProgress, localDay, PROGRESS_VERSION, rescoreXp, retriesAfterAnswer } from '../engine/progress';
import type { AnswerRecord, Earlier, Progress, Retry } from '../engine/progress';
import { listAuthoredQuestions } from '../engine/question';

export const STORAGE_KEY = 'margins.progress';

/** What the store needs from localStorage; listing and removing keys are only for backups and the space check. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem' | 'key' | 'length'>>;

/** Characters an origin may keep in localStorage before writes fail: about 5 MB in Safari and Chrome. */
export const STORAGE_QUOTA_CHARS = 5_000_000;
/** Above this share of the quota, Home warns before anything is lost. */
const NEARLY_FULL = 0.8;
const BACKUP_PREFIX = `${STORAGE_KEY}.backup-`;

/** Whether progress is being saved, for Home to say when it is not, or soon will not be. */
export type StoreHealth =
  | { kind: 'ok' }
  /** The browser refuses to store anything (private mode, blocked site data): nothing survives closing the app. */
  | { kind: 'blocked' }
  /** A save failed for lack of space: new progress is not being kept. */
  | { kind: 'full' }
  /** Saving works, but the space is mostly used (largely by backups). */
  | { kind: 'nearly-full'; percent: number };

/** A kept copy of the progress document, made when it could not be read as it was or before it was replaced. */
export interface BackupInfo {
  key: string;
  /** ISO timestamp the copy was made. */
  savedAt: string;
  /** This version of the app can open it. */
  readable: boolean;
}

/**
 * Upgrades from each older version to the next. When the document changes
 * shape, bump PROGRESS_VERSION and add the step from the previous version here.
 */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 had no XP: earlier answers keep none, and the owner starts from zero.
  1: (doc) => ({
    ...doc,
    xp: 0,
    answers: Array.isArray(doc.answers) ? doc.answers.map((a) => ({ ...(a as object), xp: 0 })) : doc.answers,
    sessions: Array.isArray(doc.sessions) ? doc.sessions.map((s) => ({ ...(s as object), xp: 0 })) : doc.sessions,
  }),
  // v2 had no daily goal: it starts at the default.
  2: (doc) => ({ ...doc, dailyGoal: 100 }),
  // v3 had no sprints: none yet, so no personal bests.
  3: (doc) => ({ ...doc, sprints: [] }),
  // v4 answers did not say whether the target time was met: read it back from the speed bonus in their XP.
  4: (doc) => ({ ...doc, answers: Array.isArray(doc.answers) ? withMetTarget(doc.answers as V4Answer[]) : doc.answers }),
  // v5 had no badges: none stored; earned milestones unlock on the next event.
  5: (doc) => ({ ...doc, badges: [] }),
  // v6 had no retries: every question missed so far is scheduled, replaying the answer history in order.
  6: (doc) => ({ ...doc, retries: Array.isArray(doc.answers) ? retriesFromHistory(doc.answers as AnswerRecord[]) : [] }),
  // v7 had no mocks: none sat yet. (An early build wrote v7 with mocks and no retries: keep its mocks.)
  7: (doc) => ({ ...doc, mocks: Array.isArray(doc.mocks) ? doc.mocks : [] }),
  // v8 did not keep the local day of answers and sessions: read it from their timestamps in the phone's zone now.
  8: (doc) => ({
    ...doc,
    answers: Array.isArray(doc.answers) ? doc.answers.map((a) => withDay(a, 'answeredAt')) : doc.answers,
    sessions: Array.isArray(doc.sessions) ? doc.sessions.map((s) => withDay(s, 'finishedAt')) : doc.sessions,
  }),
  // v9 paid a mock's answers like a drill's, three times over, and sprints nothing: every XP figure is worked
  // out again from the history under the v10 economy (rescoreXp, applied in readDocument once the shape is repaired).
  9: (doc) => doc,
  // v10 kept every answer, session and sprint in full: nothing is rolled up yet. Load then rolls up anything
  // older than KEEP_DAYS (compactProgress), so a long history shrinks at once.
  10: (doc) => ({ ...doc, earlier: emptyEarlier() }),
  // v11 rolled up only the fixed questions answered correctly, not every authored question answered. The trail of
  // authored questions starts from those, in their order, as seen and correct; older wrong answers never corrected
  // are not known and count as unseen.
  11: (doc) => ({ ...doc, earlier: withAuthoredTrail(doc.earlier) }),
};

/** A v11 roll-up with its authored trail started from the authored ids among the questions it kept as answered correctly. */
function withAuthoredTrail(earlier: unknown): unknown {
  if (!isRecord(earlier) || !Array.isArray(earlier.correctFixed)) return earlier;
  const authored = new Set(listAuthoredQuestions().map((q) => q.id));
  return { ...earlier, authoredTrail: earlier.correctFixed.filter((id) => authored.has(id)).map((id) => [id, true]) };
}

/** The version whose XP figures stand as stored; any older document has its XP worked out again from its history. */
const XP_ECONOMY_VERSION = 10;

/** A record with its local day, read from one of its timestamps; left alone if it is not a record. */
function withDay(record: unknown, timestamp: string): unknown {
  if (!isRecord(record) || typeof record.day === 'string' || typeof record[timestamp] !== 'string') return record;
  return { ...record, day: localDay(new Date(record[timestamp] as string)) };
}

function retriesFromHistory(answers: AnswerRecord[]): Retry[] {
  return answers.reduce<Retry[]>(
    (retries, a) =>
      retriesAfterAnswer(retries, { id: a.questionId, skill: a.skill, tier: a.tier, source: a.source }, a.correct, new Date(a.answeredAt)),
    [],
  );
}

interface V4Answer {
  sessionId: string;
  tier: number;
  correct: boolean;
  xp: number;
}

/**
 * Up to v4, a correct answer earned 10 XP per tier, plus 10% of that per earlier
 * correct answer in its run (at most five), plus half of it for beating the
 * target time. Whatever XP is left after base and combo was the speed bonus.
 * Wrong answers earned nothing either way, so they are recorded as slow.
 */
function withMetTarget(answers: V4Answer[]): Array<V4Answer & { metTarget: boolean }> {
  const runs = new Map<string, number>();
  return answers.map((answer) => {
    const run = answer.correct ? (runs.get(answer.sessionId) ?? 0) + 1 : 0;
    runs.set(answer.sessionId, run);
    const base = 10 * answer.tier;
    const combo = Math.round(base * 0.1 * Math.min(Math.max(run - 1, 0), 5));
    return { ...answer, metTarget: answer.correct && answer.xp - base - combo > 0 };
  });
}

/**
 * What the owner should be told about the stored document, on Home. A document the
 * app could not read is never written over: its text is first kept, byte for byte,
 * under `backupKey`. When even that fails, `backupKey` is null and nothing is saved
 * this visit, so the original stays where it was.
 */
export type StoreNotice =
  /** Written by a newer version of the app. */
  | { kind: 'newer'; version: number; backupKey: string | null }
  /** Not JSON, not a progress document, or a version with no way to upgrade it. */
  | { kind: 'unreadable'; backupKey: string | null }
  /** Readable, but parts were missing or broken: those were reset, the rest kept. */
  | { kind: 'repaired'; backupKey: string | null };

export interface Loaded {
  progress: Progress;
  notice: StoreNotice | null;
}

export interface ProgressStore {
  load(): Loaded;
  save(progress: Progress): void;
  /** Keep the stored text under a backup key, e.g. before a reset from the error screen. Returns the key, or null if it could not be kept. */
  backup(): string | null;
  /**
   * Called with the progress another tab or window saves, so this one builds on it
   * rather than overwriting it. Returns a function that stops watching.
   */
  watch(onChange: (progress: Progress) => void): () => void;
  /** Whether progress is being saved: blocked, full, nearly full, or fine. */
  health(): StoreHealth;
  /** Every backup kept on this device, newest first. */
  backups(): BackupInfo[];
  /** How many backups are kept, without opening them. */
  backupCount(): number;
  /**
   * Put a backup back as the progress, first keeping the progress it replaces as a backup
   * of its own. Returns the restored progress, or null (changing nothing) if the backup
   * cannot be opened by this version or the current progress could not be kept.
   */
  restore(key: string): Progress | null;
  /** Remove every backup, freeing their space. Progress itself is untouched. */
  deleteBackups(): void;
}

export interface StoreOptions {
  /** The clock that names backups; defaults to the real one. */
  now?: () => Date;
  /** Where another tab's saves are announced (`storage` events); defaults to the window. */
  events?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/** Loads, migrates and saves the progress document. Never throws: a broken store degrades to memory. */
export function createProgressStore(store: KeyValueStore | undefined = safeLocalStorage(), options: StoreOptions = {}): ProgressStore {
  const now = options.now ?? (() => new Date());
  const events = options.events ?? (typeof window === 'undefined' ? undefined : window);
  let memory: string | null = null;
  /** Set when a document could not be read or backed up: saves stay in memory so it is never written over. */
  let locked = false;
  /** Why the last write failed, until one succeeds; undefined while nothing has been written. */
  let failure: 'blocked' | 'full' | null | undefined;
  const attempt = (key: string, value: string): boolean => {
    try {
      if (!store) throw Object.assign(new Error('No storage'), { name: 'SecurityError' });
      store.setItem(key, value);
      failure = null;
      return true;
    } catch (error) {
      failure = isQuotaError(error) ? 'full' : 'blocked';
      return false;
    }
  };
  const keys = (): string[] => {
    if (!store || typeof store.key !== 'function' || typeof store.length !== 'number') return [];
    try {
      return Array.from({ length: store.length }, (_, i) => store.key!(i)).filter((k): k is string => k !== null);
    } catch {
      return [];
    }
  };
  const read = () => {
    if (locked) return memory;
    try {
      return store ? store.getItem(STORAGE_KEY) : memory;
    } catch {
      return memory;
    }
  };
  const write = (value: string) => {
    memory = value;
    if (locked) return;
    // Storage full or blocked: keep going in memory for this visit; health() says so.
    attempt(STORAGE_KEY, value);
  };
  /** Keep `text` under a fresh backup key; null if it could not be written and read back. */
  const keep = (text: string): string | null => {
    if (!store) return null;
    const key = `${BACKUP_PREFIX}${now().toISOString()}`;
    try {
      store.setItem(key, text);
      return store.getItem(key) === text ? key : null;
    } catch {
      return null;
    }
  };

  return {
    load() {
      const text = read();
      if (!text) return { progress: initialProgress(), notice: null };
      const outcome = readDocument(text);
      // Old history rolls up into what the app derives from it, so the document stays small for good.
      if (outcome.kind === 'ok' || outcome.kind === 'repaired') outcome.progress = compactProgress(outcome.progress, now());
      if (outcome.kind === 'ok') return { progress: outcome.progress, notice: null };
      const backupKey = keep(text);
      if (backupKey === null) {
        // Nowhere safe to put it: leave the original alone and play this visit from memory.
        locked = true;
        memory = null;
      }
      if (outcome.kind === 'repaired') return { progress: outcome.progress, notice: { kind: 'repaired', backupKey } };
      const notice: StoreNotice = outcome.kind === 'newer' ? { kind: 'newer', version: outcome.version, backupKey } : { kind: 'unreadable', backupKey };
      return { progress: initialProgress(), notice };
    },
    save(progress) {
      write(JSON.stringify(progress));
    },
    backup() {
      const text = read();
      return text ? keep(text) : null;
    },
    health() {
      if (!store) return { kind: 'blocked' };
      if (failure === undefined) {
        // Nothing written yet this visit: try a tiny write, so a blocked store shows before the first answer is lost.
        const probe = `${STORAGE_KEY}.probe`;
        if (attempt(probe, '1')) {
          try {
            store.removeItem?.(probe);
          } catch {
            // Leaving one byte behind is harmless.
          }
        }
      }
      if (failure) return { kind: failure };
      let used = 0;
      for (const key of keys()) used += key.length + (safeGet(store, key)?.length ?? 0);
      const share = used / STORAGE_QUOTA_CHARS;
      return share >= NEARLY_FULL ? { kind: 'nearly-full', percent: Math.min(100, Math.round(share * 100)) } : { kind: 'ok' };
    },
    backups() {
      return keys()
        .filter((key) => key.startsWith(BACKUP_PREFIX))
        .map((key) => {
          const text = safeGet(store, key);
          const outcome = text === null ? null : readDocument(text);
          return { key, savedAt: key.slice(BACKUP_PREFIX.length), readable: outcome !== null && (outcome.kind === 'ok' || outcome.kind === 'repaired') };
        })
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
    },
    backupCount() {
      return keys().filter((key) => key.startsWith(BACKUP_PREFIX)).length;
    },
    restore(key) {
      if (locked || !key.startsWith(BACKUP_PREFIX)) return null;
      const text = safeGet(store, key);
      if (text === null) return null;
      const outcome = readDocument(text);
      if (outcome.kind !== 'ok' && outcome.kind !== 'repaired') return null;
      const current = read();
      if (current && keep(current) === null) return null;
      const progress = compactProgress(outcome.progress, now());
      const value = JSON.stringify(progress);
      memory = value;
      if (!attempt(STORAGE_KEY, value)) return null;
      return progress;
    },
    deleteBackups() {
      for (const key of keys()) {
        if (!key.startsWith(BACKUP_PREFIX)) continue;
        try {
          store?.removeItem?.(key);
        } catch {
          // Blocked: nothing to free.
        }
      }
    },
    watch(onChange) {
      const listener = (event: Event) => {
        const { key, newValue } = event as StorageEvent;
        if (locked || key !== STORAGE_KEY || !newValue) return;
        const outcome = readDocument(newValue);
        if (outcome.kind === 'newer') {
          // A newer app saved it: from here on this tab keeps to memory, so it never writes over it.
          locked = true;
          return;
        }
        if (outcome.kind === 'ok' || outcome.kind === 'repaired') {
          memory = newValue;
          onChange(outcome.progress);
        }
      };
      events?.addEventListener('storage', listener);
      return () => events?.removeEventListener('storage', listener);
    },
  };
}

type Read =
  | { kind: 'ok'; progress: Progress }
  | { kind: 'repaired'; progress: Progress }
  | { kind: 'newer'; version: number }
  | { kind: 'unreadable' };

function readDocument(text: string): Read {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!isRecord(raw) || typeof raw.version !== 'number' || !Number.isInteger(raw.version)) return { kind: 'unreadable' };
  if (raw.version > PROGRESS_VERSION) return { kind: 'newer', version: raw.version };
  let doc = raw;
  for (let version = raw.version; version < PROGRESS_VERSION; version++) {
    const step = migrations[version];
    if (!step) return { kind: 'unreadable' };
    doc = { ...step(doc), version: version + 1 };
  }
  const { progress, changed } = repair(doc);
  return { kind: changed ? 'repaired' : 'ok', progress: raw.version < XP_ECONOMY_VERSION ? rescoreXp(progress) : progress };
}

/** Each record kind and the fields the app reads from it, so a broken entry is dropped rather than crashing a screen. */
const SHAPES: Record<'answers' | 'sessions' | 'sprints' | 'badges' | 'retries' | 'mocks', Record<string, 'string' | 'number' | 'boolean' | 'array'>> = {
  answers: { sessionId: 'string', questionId: 'string', skill: 'string', tier: 'number', correct: 'boolean', timeMs: 'number', xp: 'number', answeredAt: 'string' },
  sessions: { id: 'string', skill: 'string', finishedAt: 'string', questionCount: 'number', correctCount: 'number', timeMs: 'number', xp: 'number' },
  sprints: { skill: 'string', score: 'number', attempted: 'number', finishedAt: 'string' },
  badges: { id: 'string', unlockedAt: 'string' },
  retries: { id: 'string', questionId: 'string', skill: 'string', tier: 'number', source: 'string', stage: 'string', dueAt: 'string', returns: 'number' },
  mocks: { id: 'string', length: 'string', finishedAt: 'string', percent: 'number', passed: 'boolean', questions: 'array' },
};

function hasShape(entry: unknown, shape: Record<string, string>): boolean {
  if (!isRecord(entry)) return false;
  return Object.entries(shape).every(([field, type]) => (type === 'array' ? Array.isArray(entry[field]) : typeof entry[field] === type));
}

/**
 * Every top-level field present and of the right kind: missing collections start
 * empty (retries are rebuilt from the answers), entries without their record's
 * shape are dropped, and a missing XP total or goal is restored. Says whether
 * anything had to change.
 */
function repair(doc: Record<string, unknown>): { progress: Progress; changed: boolean } {
  let changed = false;
  const list = (field: keyof typeof SHAPES): unknown[] => {
    const value = doc[field];
    if (!Array.isArray(value)) {
      changed = true;
      return [];
    }
    const kept = value.filter((entry) => hasShape(entry, SHAPES[field]));
    if (kept.length !== value.length) changed = true;
    return kept;
  };
  const answers = list('answers') as AnswerRecord[];
  const hadRetries = Array.isArray(doc.retries);
  const retries = hadRetries ? (list('retries') as Retry[]) : retriesFromHistory(answers);
  if (!hadRetries) changed = true;
  const progress: Progress = {
    ...initialProgress(),
    ...doc,
    version: PROGRESS_VERSION,
    answers,
    sessions: list('sessions') as Progress['sessions'],
    sprints: list('sprints') as Progress['sprints'],
    badges: list('badges') as Progress['badges'],
    retries,
    mocks: list('mocks') as Progress['mocks'],
    earlier: isEarlier(doc.earlier) ? doc.earlier : emptyEarlier(),
  };
  if (!isEarlier(doc.earlier)) changed = true;
  if (typeof doc.xp !== 'number' || !Number.isFinite(doc.xp)) {
    changed = true;
    progress.xp = answers.reduce((sum, a) => sum + a.xp, 0);
  }
  if (typeof doc.dailyGoal !== 'number' || !Number.isInteger(doc.dailyGoal) || doc.dailyGoal <= 0) {
    changed = true;
    progress.dailyGoal = DEFAULT_DAILY_GOAL;
  }
  return { progress, changed };
}

/** Enough of the rolled-up history's shape to read it without crashing a screen. */
function isEarlier(value: unknown): value is Earlier {
  if (!isRecord(value)) return false;
  const numbers = ['answered', 'correct', 'xp', 'sessions', 'perfectSessions', 'sprints'];
  const lists = ['drillDays', 'correctFixed', 'sessionDays', 'bookletTrail', 'authoredTrail'];
  return (
    numbers.every((k) => typeof value[k] === 'number') &&
    lists.every((k) => Array.isArray(value[k])) &&
    isRecord(value.mastery) &&
    isRecord(value.sprintBests) &&
    Array.isArray(value.bookletTrail)
  );
}

function safeGet(store: KeyValueStore | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** A write refused for lack of space, under any of the names browsers give it. */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) return false;
  const { name, code } = error as { name?: string; code?: number };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLocalStorage(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
