import type { KeyValueStore } from './progress-store';

/** Sound on or off, a plain word under its own key apart from the progress document. Resetting progress leaves it alone. */
export const SOUND_KEY = 'margins.sound';

export interface SoundPreference {
  /** On unless the owner switched it off. */
  load(): boolean;
  save(on: boolean): void;
}

/** Never throws: blocked storage keeps the choice in memory for this visit. */
export function createSoundPreference(store: KeyValueStore | undefined = safeLocalStorage()): SoundPreference {
  let memory: string | null = null;
  return {
    load() {
      let value = memory;
      try {
        if (store) value = store.getItem(SOUND_KEY) ?? memory;
      } catch {
        // Blocked: use what this visit chose.
      }
      return value !== 'off';
    },
    save(on) {
      memory = on ? 'on' : 'off';
      try {
        store?.setItem(SOUND_KEY, memory);
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
