import { createSoundPreference } from '../storage/sound-preference';
import type { SoundPreference } from '../storage/sound-preference';

/** The few sounds the app makes: all under 0.3 s, so none can hold up the next tap. */
export type Cue = 'hit' | 'miss' | 'celebrate';

/** Notes per cue: frequency in Hz, start offset and length in seconds. */
const CUES: Record<Cue, Array<{ hz: number; at: number; length: number }>> = {
  hit: [{ hz: 784, at: 0, length: 0.09 }],
  miss: [{ hz: 196, at: 0, length: 0.12 }],
  celebrate: [
    { hz: 523, at: 0, length: 0.08 },
    { hz: 659, at: 0.08, length: 0.08 },
    { hz: 784, at: 0.16, length: 0.12 },
  ],
};

const VOLUME = 0.12;

export interface Sound {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  play(cue: Cue): void;
}

/** Synthesised with Web Audio, so there is nothing to download. Silent when switched off or when audio is unavailable. */
export function createSound(preference: SoundPreference = createSoundPreference()): Sound {
  let on = preference.load();
  let context: AudioContext | null = null;

  const audio = (): AudioContext | null => {
    if (context) return context;
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  };

  return {
    enabled: () => on,
    setEnabled(next) {
      on = next;
      preference.save(next);
    },
    play(cue) {
      if (!on) return;
      try {
        const ctx = audio();
        if (!ctx) return;
        if (ctx.state === 'suspended') void ctx.resume();
        const start = ctx.currentTime;
        for (const note of CUES[cue]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = cue === 'miss' ? 'triangle' : 'sine';
          osc.frequency.value = note.hz;
          gain.gain.setValueAtTime(VOLUME, start + note.at);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start + note.at);
          osc.stop(start + note.at + note.length);
        }
      } catch {
        // Audio is a nicety: never let it break an answer.
      }
    },
  };
}
