import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './progress-store';
import { createSoundPreference, SOUND_KEY } from './sound-preference';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('sound preference', () => {
  it('is on until the owner switches it off', () => {
    expect(createSoundPreference(memoryStore()).load()).toBe(true);
  });

  it('keeps the choice across visits', () => {
    const store = memoryStore();
    createSoundPreference(store).save(false);
    expect(store.data[SOUND_KEY]).toBe('off');
    expect(createSoundPreference(store).load()).toBe(false);
    createSoundPreference(store).save(true);
    expect(createSoundPreference(store).load()).toBe(true);
  });

  it('keeps the choice for the visit when storage is blocked', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const pref = createSoundPreference(blocked);
    pref.save(false);
    expect(pref.load()).toBe(false);
  });
});
