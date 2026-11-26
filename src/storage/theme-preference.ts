import type { KeyValueStore } from './progress-store';

/**
 * The owner's appearance choice. A plain word under its own key, apart from the progress
 * document, so index.html can read it before first paint without parsing progress.
 */
export const THEME_KEY = 'margins.theme';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export interface ThemePreference {
  load(): ThemeChoice;
  save(choice: ThemeChoice): void;
}

const isChoice = (value: unknown): value is ThemeChoice => THEME_CHOICES.includes(value as ThemeChoice);

/** Never throws: blocked storage keeps the choice in memory for this visit. */
export function createThemePreference(store: KeyValueStore | undefined = safeLocalStorage()): ThemePreference {
  let memory: string | null = null;
  return {
    load() {
      let value = memory;
      try {
        if (store) value = store.getItem(THEME_KEY) ?? memory;
      } catch {
        // Blocked: use what this visit chose.
      }
      return isChoice(value) ? value : 'system';
    },
    save(choice) {
      memory = choice;
      try {
        store?.setItem(THEME_KEY, choice);
      } catch {
        // Storage full or blocked: keep the choice for this visit.
      }
    },
  };
}

function safeLocalStorage(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
