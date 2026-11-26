import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Chips side by side, one of which is pressed. Two to five fit one row; `wrap` makes rows of five (symbols);
 * `scroll` keeps one row of named chips that scrolls sideways, the pressed chip kept in view.
 */
export function ChipGroup({ label, wrap = false, scroll = false, children }: { label: string; wrap?: boolean; scroll?: boolean; children: ComponentChildren }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the row moves, never the page: centre the pressed chip by the row's own scroll position.
    const el = row.current;
    const pressed = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (scroll && el && pressed) el.scrollLeft = pressed.offsetLeft - el.offsetLeft - (el.clientWidth - pressed.offsetWidth) / 2;
  });
  return (
    <div class={scroll ? 'chip-group chip-group-scroll' : wrap ? 'chip-group chip-group-wrap' : 'chip-group'} role="group" aria-label={label} ref={row}>
      {children}
    </div>
  );
}

interface ChipProps {
  pressed: boolean;
  onClick(): void;
  /** Give one when the visible text is a symbol ("×") or a bare number. */
  ariaLabel?: string;
  children: ComponentChildren;
}

/** One choice from a few: a skill, a tier, sound on or off. Not for navigation. */
export function Chip({ pressed, onClick, ariaLabel, children }: ChipProps) {
  return (
    <button type="button" class="chip" aria-pressed={pressed} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  );
}
