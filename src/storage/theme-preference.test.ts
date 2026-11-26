import { describe, expect, it } from 'vitest';
import { createThemePreference, THEME_KEY } from './theme-preference';
import type { KeyValueStore } from './progress-store';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

describe('theme preference', () => {
  it('follows the system until the owner chooses', () => {
    expect(createThemePreference(memoryStore()).load()).toBe('system');
  });

  it('keeps the owner’s choice across visits', () => {
    const store = memoryStore();
    createThemePreference(store).save('light');
    expect(createThemePreference(store).load()).toBe('light');
    createThemePreference(store).save('dark');
    expect(createThemePreference(store).load()).toBe('dark');
    createThemePreference(store).save('system');
    expect(createThemePreference(store).load()).toBe('system');
  });

  it('stores the choice as a plain word, apart from the progress document', () => {
    const store = memoryStore();
    createThemePreference(store).save('light');
    expect(store.data).toEqual({ [THEME_KEY]: 'light' });
  });

  it('treats an unknown stored value as system', () => {
    expect(createThemePreference(memoryStore({ [THEME_KEY]: 'sepia' })).load()).toBe('system');
  });

  it('never throws when storage is blocked, and remembers the choice for this visit', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const preference = createThemePreference(blocked);
    expect(preference.load()).toBe('system');
    preference.save('dark');
    expect(preference.load()).toBe('dark');
  });
});
