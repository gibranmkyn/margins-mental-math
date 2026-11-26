import { describe, expect, it } from 'vitest';
import { createUpdateGate } from './updates';

function gate() {
  const calls: string[] = [];
  const g = createUpdateGate({ activate: () => calls.push('activate'), reload: () => calls.push('reload') });
  return { g, calls };
}

describe('applying a new version of the app', () => {
  it('never reloads while a session, sprint or mock is in progress; applies it once the owner is on Home', () => {
    const { g, calls } = gate();
    g.setIdle(false);
    g.updateWaiting();
    expect(calls).toEqual([]);
    g.setIdle(true);
    expect(calls).toEqual(['activate']);
  });

  it('applies a waiting version at once when the owner is already on Home (as at launch)', () => {
    const { g, calls } = gate();
    g.setIdle(true);
    g.updateWaiting();
    expect(calls).toEqual(['activate']);
  });

  it('when another tab activated the new version mid-session, reloads only once back on Home', () => {
    const { g, calls } = gate();
    g.setIdle(false);
    g.reloadNeeded();
    expect(calls).toEqual([]);
    g.setIdle(true);
    expect(calls).toEqual(['reload']);
  });

  it('activates once, however often the owner comes back to Home', () => {
    const { g, calls } = gate();
    g.updateWaiting();
    g.setIdle(true);
    g.setIdle(false);
    g.setIdle(true);
    expect(calls).toEqual(['activate']);
  });

  it('starts busy: nothing happens before the app says where the owner is', () => {
    const { g, calls } = gate();
    g.updateWaiting();
    g.reloadNeeded();
    expect(calls).toEqual([]);
  });
});
