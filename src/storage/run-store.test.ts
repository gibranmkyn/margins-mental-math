import { describe, expect, it } from 'vitest';
import { chooseMock, chooseNextSession, initialProgress } from '../engine/progress';
import type { MockInProgress, SessionInProgress } from '../engine/progress';
import { createRandom } from '../engine/question';
import { createRunStore, RUN_KEY } from './run-store';

const START = new Date('2026-11-25T08:00:00Z');

function memory(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

function mockRun(): MockInProgress {
  // A full mock: booklet questions with redrawn charts, generated and authored questions.
  const plan = chooseMock(initialProgress(), 'full', START, createRandom(7));
  return {
    kind: 'mock',
    plan,
    startedAt: START.getTime(),
    index: 5,
    choices: plan.questions.map((_, i) => (i % 3 === 0 ? 2 : null)),
    flagged: plan.questions.map((_, i) => i === 4),
    spentMs: plan.questions.map((_, i) => i * 1000),
  };
}

describe('the run store: a mock or session in progress survives a reload', () => {
  it('gives back a saved mock exactly, questions and all', () => {
    const kv = memory();
    const run = mockRun();
    createRunStore(kv).save(run);
    expect(createRunStore(kv).load()).toEqual(run);
  });

  it('gives back a saved session', () => {
    const kv = memory();
    const plan = chooseNextSession(initialProgress(), START, createRandom(3), { skill: 'break-even-payback' });
    const run: SessionInProgress = { kind: 'session', plan, results: [true], levelUps: [], badges: [], savedAt: START.getTime() };
    createRunStore(kv).save(run);
    expect(createRunStore(kv).load()).toEqual(run);
  });

  it('has nothing once cleared', () => {
    const kv = memory();
    const store = createRunStore(kv);
    store.save(mockRun());
    store.clear();
    expect(store.load()).toBeNull();
    expect(kv.map.has(RUN_KEY)).toBe(false);
  });

  it('treats unreadable or wrongly shaped text as nothing in progress', () => {
    for (const text of ['{"kind":"mock"', '{"kind":"mock","plan":{}}', '{"kind":"sprint"}', '[]', 'null']) {
      expect(createRunStore(memory({ [RUN_KEY]: text })).load()).toBeNull();
    }
  });

  it('never throws when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    const store = createRunStore(blocked);
    expect(() => store.save(mockRun())).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(store.load()).toBeNull();
  });
});
