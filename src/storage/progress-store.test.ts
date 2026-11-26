import { describe, expect, it } from 'vitest';
import { applyEvent, emptyEarlier, initialProgress, PROGRESS_VERSION, spotCheckSeen } from '../engine/progress';
import { listAuthoredQuestions, listBookletQuestions } from '../engine/question';
import { createProgressStore, STORAGE_KEY, STORAGE_QUOTA_CHARS } from './progress-store';

function storeWith(doc: object) {
  const memory = new Map([[STORAGE_KEY, JSON.stringify(doc)]]);
  return createProgressStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) });
}

describe('progress store migration', () => {
  it('upgrades a v3 document, keeping its history and starting with no sprints', () => {
    const v3 = { version: 3, xp: 120, dailyGoal: 100, answers: [], sessions: [] };
    const memory = new Map([[STORAGE_KEY, JSON.stringify(v3)]]);
    const store = createProgressStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) });
    // XP is worked out again from the history, which here is empty.
    expect(store.load().progress).toMatchObject({ version: PROGRESS_VERSION, xp: 0, sprints: [], badges: [], retries: [], mocks: [] });
  });

  it('upgrades a v4 document, reading back from each answer\'s speed bonus whether it met the target time', () => {
    const answer = (sessionId: string, tier: number, correct: boolean, xp: number) => ({
      sessionId, questionId: 'q', skill: 'addition', tier, source: 'generated', correct, timeMs: 5000, xp, answeredAt: '2026-11-20T09:00:00.000Z',
    });
    // Old rule: 10 XP per tier, +10% of that per earlier correct answer in the run, +50% inside the target time.
    const answers = [
      answer('s', 1, true, 15), // first in run, fast: 10 + 5
      answer('t', 2, true, 20), // another session, slow: 20
      answer('s', 1, true, 11), // second in run, slow: 10 + 1
      answer('s', 1, true, 17), // third in run, fast: 10 + 2 + 5
      answer('s', 1, false, 0), // wrong
      answer('s', 3, true, 30), // run restarted, slow: 30
      answer('t', 2, true, 32), // second in its run, fast: 20 + 2 + 10
    ];
    const v4 = { version: 4, xp: 125, dailyGoal: 100, answers, sessions: [], sprints: [] };
    const memory = new Map([[STORAGE_KEY, JSON.stringify(v4)]]);
    const store = createProgressStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) });
    const loaded = store.load().progress;
    expect(loaded.version).toBe(PROGRESS_VERSION);
    expect(loaded.answers.map((a) => a.metTarget)).toEqual([true, false, false, true, false, false, true]);
  });

  it('upgrades a v6 document, scheduling a retry for every question missed so far', () => {
    const answer = (questionId: string, skill: string, source: string, correct: boolean, answeredAt: string) => ({
      sessionId: 's', questionId, skill, tier: 1, source, correct, timeMs: 5000, metTarget: false, xp: 0, answeredAt,
    });
    const answers = [
      answer('multiplication-t1-42', 'multiplication', 'generated', false, '2026-11-20T09:00:00.000Z'),
      answer('addition-t1-7', 'addition', 'generated', true, '2026-11-20T09:01:00.000Z'),
      answer('pst1-q05', 'percentages-in-context', 'booklet', false, '2026-11-20T09:02:00.000Z'),
      answer('pst1-q05', 'percentages-in-context', 'booklet', true, '2026-11-21T09:00:00.000Z'),
    ];
    const v6 = { version: 6, xp: 0, dailyGoal: 100, answers, sessions: [], sprints: [], badges: [] };
    const memory = new Map([[STORAGE_KEY, JSON.stringify(v6)]]);
    const store = createProgressStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) });
    const loaded = store.load().progress;
    expect(loaded.version).toBe(PROGRESS_VERSION);
    expect(loaded.answers).toHaveLength(4);
    expect(loaded.retries.map((r) => [r.id, r.stage])).toEqual([
      ['multiplication-t1-42', 'next'],
      ['pst1-q05', 'final'],
    ]);
  });

  it('upgrades a v7 document, keeping its history, badges and retries and starting with no mocks', () => {
    const retry = { id: 'pst1-q05', skill: 'percentages-in-context', tier: 2, source: 'booklet', questionId: 'pst1-q05', stage: 'next', dueAt: '2026-11-24T12:00:00.000Z', returns: 0 };
    const v7 = {
      version: 7, xp: 340, dailyGoal: 150, answers: [], sessions: [],
      sprints: [{ skill: 'addition', score: 9, attempted: 11, finishedAt: '2026-11-24T12:00:00.000Z' }],
      badges: [{ id: 'streak-3', unlockedAt: '2026-11-24T12:00:00.000Z' }],
      retries: [retry],
    };
    expect(storeWith(v7).load().progress).toMatchObject({
      version: PROGRESS_VERSION, xp: 9, dailyGoal: 150, sprints: [{ score: 9, xp: 9 }], badges: [{ id: 'streak-3' }], retries: [retry], mocks: [],
    });
  });
});

/** A key-value store in memory, as localStorage behaves, optionally refusing new keys (full) or every write (blocked). */
function memoryStore(entries: Record<string, string> = {}, { full = false, blocked = false } = {}) {
  const memory = new Map(Object.entries(entries));
  return {
    memory,
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (blocked) throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' });
      if (full && !memory.has(k)) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      memory.set(k, v);
    },
    removeItem: (k: string) => void memory.delete(k),
    get length() {
      return memory.size;
    },
    key: (i: number) => [...memory.keys()][i] ?? null,
  };
}

const backups = (memory: Map<string, string>) => [...memory.keys()].filter((k) => k.startsWith(`${STORAGE_KEY}.backup-`));

const NOW = new Date('2026-11-25T08:00:00.000Z');

describe('progress store migration to v9', () => {
  it('gives every answer and session of a v8 document its local day, read from its timestamp', () => {
    const when = new Date(2026, 10, 24, 23, 30); // local time
    const answer = { sessionId: 's', questionId: 'addition-t1-1', skill: 'addition', tier: 1, source: 'generated', correct: true, timeMs: 4000, metTarget: true, xp: 15, answeredAt: when.toISOString() };
    const session = { id: 's', kind: 'drill', skill: 'addition', finishedAt: when.toISOString(), questionCount: 1, correctCount: 1, timeMs: 4000, xp: 15 };
    const v8 = { version: 8, xp: 15, dailyGoal: 100, answers: [answer], sessions: [session], sprints: [], badges: [], retries: [], mocks: [] };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v8) })).load();
    expect(notice).toBeNull();
    expect(progress.version).toBe(PROGRESS_VERSION);
    expect(progress.answers[0]!.day).toBe('2026-11-24');
    expect(progress.sessions[0]!.day).toBe('2026-11-24');
  });
});

describe('progress store migration to v10', () => {
  it('works every XP figure out again from the history, so a mock scored by the old rules keeps no inflated XP', () => {
    const at = new Date(2026, 10, 24, 9, 0).toISOString();
    const drill = (n: number, correct: boolean) => ({
      sessionId: 's1', questionId: `compound-growth-t1-${n}`, skill: 'compound-growth', tier: 1, source: 'generated', correct, timeMs: 25_000, metTarget: false, xp: correct ? 10 : 0, answeredAt: at, day: '2026-11-24',
    });
    const mockAnswer = (n: number) => ({
      sessionId: 'm1', questionId: `bcg-q0${n}`, skill: 'percentages-in-context', tier: 2, source: 'booklet', correct: true, timeMs: 100_000, metTarget: false, xp: 93, answeredAt: at, day: '2026-11-24',
    });
    const answers = [drill(1, true), drill(2, true), drill(3, false), mockAnswer(1), mockAnswer(2)];
    const v9 = {
      version: 9, xp: 2361, dailyGoal: 100, answers,
      sessions: [{ id: 's1', kind: 'drill', skill: 'compound-growth', finishedAt: at, day: '2026-11-24', questionCount: 3, correctCount: 2, timeMs: 75_000, xp: 21 }],
      sprints: [{ skill: 'addition', score: 12, attempted: 14, finishedAt: at }],
      badges: [], retries: [],
      mocks: [{ id: 'm1', length: 'short', finishedAt: at, questionCount: 10, correctCount: 2, answeredCount: 2, percent: 20, passed: false, timeMs: 600_000, xp: 186, questions: [] }],
    };
    const { progress } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v9) })).load();
    expect(progress.version).toBe(PROGRESS_VERSION);
    // Compound growth tier 1 has a 20-second target: 10 XP, then 11 with the combo; the miss earns nothing.
    expect(progress.answers.map((a) => a.xp)).toEqual([10, 11, 0, 45, 45]);
    expect(progress.sessions[0]!.xp).toBe(21);
    // A failed short mock pays each correct answer for its 2 minutes at three quarters: 45.
    expect(progress.mocks[0]!.xp).toBe(90);
    expect(progress.sprints[0]).toMatchObject({ xp: 12, day: '2026-11-24' });
    expect(progress.xp).toBe(10 + 11 + 45 + 45 + 12);
  });
});

describe('progress store migration to v11, and old history rolled up on load', () => {
  const answerOn = (day: string, n: number) => ({
    sessionId: `s-${day}`, questionId: `addition-t1-${n}`, skill: 'addition', tier: 1, source: 'generated', correct: n % 3 !== 0,
    timeMs: 4000 + n, metTarget: true, targetMs: 8000, xp: n % 3 !== 0 ? 6 : 0, answeredAt: `${day}T09:00:00.000Z`, day,
  });

  it('starts a v10 document with nothing rolled up yet', () => {
    const v10 = { version: 10, xp: 0, dailyGoal: 100, answers: [], sessions: [], sprints: [], badges: [], retries: [], mocks: [] };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v10) }), { now: () => NOW }).load();
    expect(notice).toBeNull();
    expect(progress.version).toBe(PROGRESS_VERSION);
    expect(progress.earlier).toMatchObject({ answered: 0, through: null });
  });

  it('rolls answers older than 30 days into totals on load, keeping the counts and the recent answers', () => {
    const answers = [answerOn('2026-09-01', 1), answerOn('2026-09-01', 2), answerOn('2026-09-02', 3), answerOn('2026-11-20', 4), answerOn('2026-11-24', 5)];
    const v10 = { version: 10, xp: 18, dailyGoal: 100, answers, sessions: [], sprints: [], badges: [], retries: [], mocks: [] };
    const { progress } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v10) }), { now: () => NOW }).load();
    expect(progress.answers.map((a) => a.day)).toEqual(['2026-11-20', '2026-11-24']);
    expect(progress.earlier).toMatchObject({ answered: 3, correct: 2, xp: 12 });
    expect(progress.xp).toBe(18);
  });

  it('replaces a broken roll-up with an empty one and says the document was repaired', () => {
    const doc = { ...initialProgress(), earlier: { answered: 'lots' } };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(doc) }), { now: () => NOW }).load();
    expect(notice).toMatchObject({ kind: 'repaired' });
    expect(progress.earlier.answered).toBe(0);
  });
});

describe('progress store migration to v12', () => {
  const authored = listAuthoredQuestions().filter((q) => q.tier >= 2);
  // A booklet question's id; only the id matters here, so a stand-in serves when the booklet files are absent.
  const booklet = listBookletQuestions()[0]?.id ?? 'pst1-q05';
  const v11 = (earlier: object) => ({ version: 11, xp: 0, dailyGoal: 100, answers: [], sessions: [], sprints: [], badges: [], retries: [], mocks: [], earlier });

  it('starts the authored trail from the authored questions rolled up as answered correctly, in their order', () => {
    const correctFixed = [authored[3]!.id, booklet, authored[1]!.id].sort();
    const { authoredTrail: _, ...empty } = emptyEarlier();
    const earlier = { ...empty, through: '2026-09-30', answered: 40, correct: 30, correctFixed };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v11(earlier)) }), { now: () => NOW }).load();
    expect(notice).toBeNull();
    expect(progress.version).toBe(12);
    expect(progress.earlier).toEqual({ ...earlier, authoredTrail: correctFixed.filter((id) => id !== booklet).map((id) => [id, true]) });
    expect(spotCheckSeen(progress)).toEqual({ seen: 2, total: authored.length });
  });

  it('starts an empty trail when nothing was rolled up', () => {
    const { authoredTrail: _, ...earlier } = emptyEarlier();
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v11(earlier)) }), { now: () => NOW }).load();
    expect(notice).toBeNull();
    expect(progress.earlier.authoredTrail).toEqual([]);
  });

  it('treats a current roll-up without the trail as broken, and repairs it', () => {
    const { authoredTrail: _, ...earlier } = emptyEarlier();
    const doc = { ...initialProgress(), earlier };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(doc) }), { now: () => NOW }).load();
    expect(notice).toMatchObject({ kind: 'repaired' });
    expect(progress.earlier).toEqual(emptyEarlier());
  });
});

describe('progress store: a document it cannot read is never lost', () => {
  const newer = JSON.stringify({ version: PROGRESS_VERSION + 1, xp: 4321, dailyGoal: 100, answers: [{ questionId: 'q' }], sessions: [] });

  it('keeps a newer document byte for byte under a backup key, says so, and only then starts fresh', () => {
    const kv = memoryStore({ [STORAGE_KEY]: newer });
    const store = createProgressStore(kv, { now: () => NOW });
    const { progress, notice } = store.load();
    expect(progress.xp).toBe(0);
    expect(notice).toMatchObject({ kind: 'newer', version: PROGRESS_VERSION + 1 });
    const [key] = backups(kv.memory);
    expect(notice?.backupKey).toBe(key);
    expect(kv.memory.get(key!)).toBe(newer);

    // The next save starts fresh, and the original is still there.
    store.save({ ...progress, xp: 15 });
    expect(JSON.parse(kv.memory.get(STORAGE_KEY)!).xp).toBe(15);
    expect(kv.memory.get(key!)).toBe(newer);
  });

  it('keeps text that is not JSON under a backup key', () => {
    const kv = memoryStore({ [STORAGE_KEY]: '{"version": 8, "xp": 12' });
    const { notice } = createProgressStore(kv, { now: () => NOW }).load();
    expect(notice).toMatchObject({ kind: 'unreadable' });
    expect(kv.memory.get(notice!.backupKey!)).toBe('{"version": 8, "xp": 12');
  });

  it('keeps a document with a version it has no migration for under a backup key', () => {
    const odd = JSON.stringify({ version: 0, answers: [], sessions: [] });
    const kv = memoryStore({ [STORAGE_KEY]: odd });
    const { notice } = createProgressStore(kv, { now: () => NOW }).load();
    expect(notice).toMatchObject({ kind: 'unreadable' });
    expect(kv.memory.get(notice!.backupKey!)).toBe(odd);
  });

  it('when the backup cannot be written, never writes over the original: this visit runs in memory', () => {
    const kv = memoryStore({ [STORAGE_KEY]: newer }, { full: true });
    const store = createProgressStore(kv, { now: () => NOW });
    const { progress, notice } = store.load();
    expect(notice).toMatchObject({ kind: 'newer', backupKey: null });
    store.save({ ...progress, xp: 15 });
    expect(kv.memory.get(STORAGE_KEY)).toBe(newer);
    expect(store.load().progress.xp).toBe(15);
  });

  it('loads a readable document with no notice and no backup', () => {
    const kv = memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) });
    expect(createProgressStore(kv).load().notice).toBeNull();
    expect(backups(kv.memory)).toEqual([]);
  });

  it('a fresh start (nothing stored) has no notice', () => {
    expect(createProgressStore(memoryStore()).load()).toMatchObject({ notice: null, progress: initialProgress() });
  });
});

describe('progress store: a current-version document with missing or broken parts is repaired', () => {
  it('fills in missing collections, so the first answer does not crash', () => {
    const partial = JSON.stringify({ version: PROGRESS_VERSION, answers: [], sessions: [] });
    const kv = memoryStore({ [STORAGE_KEY]: partial });
    const { progress, notice } = createProgressStore(kv, { now: () => NOW }).load();
    expect(progress).toMatchObject({ xp: 0, dailyGoal: 100, sprints: [], badges: [], retries: [], mocks: [] });
    expect(notice).toMatchObject({ kind: 'repaired' });
    expect(kv.memory.get(notice!.backupKey!)).toBe(partial);
    const question = { id: 'addition-t1-1', skill: 'addition', tier: 1, source: 'generated', targetTimeMs: 5000, answer: { kind: 'numeric' } };
    expect(() =>
      applyEvent(progress, { type: 'answer-recorded', sessionId: 's', question: question as never, correct: true, timeMs: 3000 }, NOW),
    ).not.toThrow();
  });

  it('drops entries that are not records of the right shape, keeping the rest', () => {
    const good = { sessionId: 's', questionId: 'addition-t1-1', skill: 'addition', tier: 1, source: 'generated', correct: true, timeMs: 4000, metTarget: true, xp: 15, answeredAt: '2026-11-24T08:00:00.000Z' };
    const doc = { ...initialProgress(), xp: 15, answers: [good, null, { questionId: 3 }], badges: ['streak-3', { id: 'streak-3', unlockedAt: '2026-11-24T08:00:00.000Z' }] };
    const { progress, notice } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(doc) }), { now: () => NOW }).load();
    expect(progress.answers).toEqual([good]);
    expect(progress.badges).toEqual([{ id: 'streak-3', unlockedAt: '2026-11-24T08:00:00.000Z' }]);
    expect(notice).toMatchObject({ kind: 'repaired' });
  });

  it('keeps the mocks of a v7 document written by a build that had mocks but no retries', () => {
    const mock = { id: 'm-1', length: 'short', finishedAt: '2026-11-24T08:00:00.000Z', questionCount: 10, correctCount: 7, answeredCount: 10, percent: 70, passed: true, timeMs: 600000, xp: 0, questions: [] };
    const v7 = { version: 7, xp: 0, dailyGoal: 100, answers: [], sessions: [], sprints: [], badges: [], mocks: [mock] };
    const { progress } = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(v7) }), { now: () => NOW }).load();
    expect(progress.mocks).toEqual([mock]);
    expect(progress.retries).toEqual([]);
  });
});

describe('progress store: another tab saving', () => {
  const storageEvent = (key: string | null, newValue: string | null) => Object.assign(new Event('storage'), { key, newValue });

  it('hands over the progress another tab saved, so this tab builds on it instead of overwriting it', () => {
    const kv = memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) });
    const events = new EventTarget();
    const store = createProgressStore(kv, { events });
    const seen: number[] = [];
    store.watch((progress) => seen.push(progress.xp));
    const other = JSON.stringify({ ...initialProgress(), xp: 45 });
    kv.memory.set(STORAGE_KEY, other);
    events.dispatchEvent(storageEvent(STORAGE_KEY, other));
    expect(seen).toEqual([45]);
  });

  it('ignores other keys, and stops when unwatched', () => {
    const kv = memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) });
    const events = new EventTarget();
    const store = createProgressStore(kv, { events });
    const seen: number[] = [];
    const stop = store.watch((progress) => seen.push(progress.xp));
    events.dispatchEvent(storageEvent('margins.theme', 'dark'));
    stop();
    events.dispatchEvent(storageEvent(STORAGE_KEY, JSON.stringify({ ...initialProgress(), xp: 9 })));
    expect(seen).toEqual([]);
  });

  it('ignores a document from another tab that it cannot read, rather than replacing good progress with nothing', () => {
    const kv = memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) });
    const events = new EventTarget();
    const store = createProgressStore(kv, { events });
    const seen: number[] = [];
    store.watch((progress) => seen.push(progress.xp));
    events.dispatchEvent(storageEvent(STORAGE_KEY, null));
    events.dispatchEvent(storageEvent(STORAGE_KEY, '{"version":'));
    expect(seen).toEqual([]);
  });

  it('once a newer version of the app has saved from another tab, never writes over it from this one', () => {
    const kv = memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) });
    const events = new EventTarget();
    const store = createProgressStore(kv, { events });
    store.watch(() => {});
    const newer = JSON.stringify({ version: PROGRESS_VERSION + 1, xp: 1 });
    kv.memory.set(STORAGE_KEY, newer);
    events.dispatchEvent(storageEvent(STORAGE_KEY, newer));
    store.save({ ...initialProgress(), xp: 30 });
    expect(kv.memory.get(STORAGE_KEY)).toBe(newer);
  });
});

describe('progress store: whether progress is being saved', () => {
  it('is fine with room to spare', () => {
    const store = createProgressStore(memoryStore({ [STORAGE_KEY]: JSON.stringify(initialProgress()) }));
    store.load();
    expect(store.health()).toEqual({ kind: 'ok' });
  });

  it('says so when the browser blocks saving', () => {
    const store = createProgressStore(memoryStore({}, { blocked: true }));
    store.load();
    store.save({ ...initialProgress(), xp: 5 });
    expect(store.health()).toEqual({ kind: 'blocked' });
  });

  it('says so when there is no storage at all', () => {
    const store = createProgressStore(undefined);
    store.load();
    expect(store.health()).toEqual({ kind: 'blocked' });
  });

  it('says so when storage is full and a save failed', () => {
    const store = createProgressStore(memoryStore({}, { full: true }));
    store.load();
    store.save({ ...initialProgress(), xp: 5 });
    expect(store.health()).toEqual({ kind: 'full' });
  });

  it('warns when storage is nearly full, before anything is lost', () => {
    const big = 'x'.repeat(Math.ceil(STORAGE_QUOTA_CHARS * 0.85));
    const store = createProgressStore(memoryStore({ [`${STORAGE_KEY}.backup-2026-11-01T00:00:00.000Z`]: big }));
    store.load();
    expect(store.health()).toMatchObject({ kind: 'nearly-full' });
  });

  it('is fine again once a save goes through', () => {
    const kv = memoryStore({}, { full: true });
    const store = createProgressStore(kv);
    store.load();
    store.save({ ...initialProgress(), xp: 5 });
    kv.memory.set(STORAGE_KEY, '{}'); // the key now exists, so a full store accepts the write
    store.save({ ...initialProgress(), xp: 6 });
    expect(store.health()).toEqual({ kind: 'ok' });
  });
});

describe('progress store: backups', () => {
  const doc = (xp: number) => JSON.stringify({ ...initialProgress(), xp });
  const key = (iso: string) => `${STORAGE_KEY}.backup-${iso}`;

  it('lists none when there are none', () => {
    const store = createProgressStore(memoryStore({ [STORAGE_KEY]: doc(0) }));
    expect(store.backups()).toEqual([]);
    expect(store.backupCount()).toBe(0);
  });

  it('lists every backup, newest first, with when it was made and whether this version can open it', () => {
    const kv = memoryStore({
      [STORAGE_KEY]: doc(0),
      [key('2026-11-20T08:00:00.000Z')]: doc(40),
      [key('2026-11-24T08:00:00.000Z')]: JSON.stringify({ version: PROGRESS_VERSION + 1 }),
      [key('2026-11-22T08:00:00.000Z')]: 'not json',
    });
    expect(createProgressStore(kv).backupCount()).toBe(3);
    expect(createProgressStore(kv).backups()).toEqual([
      { key: key('2026-11-24T08:00:00.000Z'), savedAt: '2026-11-24T08:00:00.000Z', readable: false },
      { key: key('2026-11-22T08:00:00.000Z'), savedAt: '2026-11-22T08:00:00.000Z', readable: false },
      { key: key('2026-11-20T08:00:00.000Z'), savedAt: '2026-11-20T08:00:00.000Z', readable: true },
    ]);
  });

  it('restores a backup this version can open, keeping the progress it replaces as a backup of its own', () => {
    const kv = memoryStore({ [STORAGE_KEY]: doc(7), [key('2026-11-20T08:00:00.000Z')]: doc(40) });
    const store = createProgressStore(kv, { now: () => NOW });
    store.load();
    const restored = store.restore(key('2026-11-20T08:00:00.000Z'));
    expect(restored?.xp).toBe(40);
    expect(JSON.parse(kv.memory.get(STORAGE_KEY)!).xp).toBe(40);
    expect(JSON.parse(kv.memory.get(key(NOW.toISOString()))!).xp).toBe(7);
    expect(store.load().progress.xp).toBe(40);
  });

  it('refuses to restore a backup it cannot open, and changes nothing', () => {
    const kv = memoryStore({ [STORAGE_KEY]: doc(7), [key('2026-11-20T08:00:00.000Z')]: 'not json' });
    const store = createProgressStore(kv, { now: () => NOW });
    store.load();
    expect(store.restore(key('2026-11-20T08:00:00.000Z'))).toBeNull();
    expect(JSON.parse(kv.memory.get(STORAGE_KEY)!).xp).toBe(7);
  });

  it('deletes every backup on request, leaving progress alone', () => {
    const kv = memoryStore({ [STORAGE_KEY]: doc(7), [key('2026-11-20T08:00:00.000Z')]: doc(40), [key('2026-11-21T08:00:00.000Z')]: doc(41) });
    const store = createProgressStore(kv);
    store.deleteBackups();
    expect(store.backups()).toEqual([]);
    expect(JSON.parse(kv.memory.get(STORAGE_KEY)!).xp).toBe(7);
  });
});
