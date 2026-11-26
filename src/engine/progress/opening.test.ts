import { describe, expect, it } from 'vitest';
import { applyEvent, initialProgress } from './index';
import type { MockRecord, Progress } from './index';

const NOW = new Date(2026, 10, 25, 9, 0);

const passedMock = (n: number): MockRecord => ({
  id: `m${n}`, length: 'short', finishedAt: new Date(2026, 10, 1 + n).toISOString(), questionCount: 10, correctCount: 8, answeredCount: 10,
  percent: 80, passed: true, timeMs: 900_000, xp: 0, questions: [],
});

describe('opening the app', () => {
  it('unlocks badges already earned in the history (say, a migrated document), without waiting for the next answer', () => {
    const migrated: Progress = { ...initialProgress(), mocks: [passedMock(1), passedMock(2)] };
    const { progress, happened } = applyEvent(migrated, { type: 'app-opened' }, NOW);
    expect(progress.badges.map((b) => b.id)).toEqual(['mock-pass']);
    expect(happened).toEqual([expect.objectContaining({ kind: 'badge-unlocked', id: 'mock-pass' })]);
  });

  it('changes nothing when there is nothing new to unlock', () => {
    const p = initialProgress();
    const { progress, happened } = applyEvent(p, { type: 'app-opened' }, NOW);
    expect(progress).toBe(p);
    expect(happened).toEqual([]);
  });
});
