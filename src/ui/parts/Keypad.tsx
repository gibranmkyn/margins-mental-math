import { useEffect, useRef } from 'preact/hooks';
import type { Key } from '../../engine/question';
import { KEYPAD_KEY } from '../entry';
import { Button } from './Button';

/**
 * Calculator order. The right-hand column holds delete and the magnitude shorthand;
 * the sign key sits left of 0, where a slip shows on the board and one press undoes it.
 * There is no percent key: the board shows the answer's unit after the caret.
 */
const ROWS: Key[][] = [
  ['7', '8', '9', 'delete'],
  ['4', '5', '6', 'k'],
  ['1', '2', '3', 'm'],
  ['negate', '0', '.', 'bn'],
];

const LABELS: Partial<Record<Key, string>> = {
  '.': 'Decimal point',
  delete: 'Delete',
  negate: 'Minus sign',
  k: 'Thousand (k)',
  m: 'Million (m)',
  bn: 'Billion (bn)',
};

const FUNCTION_KEYS = new Set<Key>(['.', 'delete', 'negate', 'k', 'm', 'bn']);

/** The one button under the keys. The screen names it and picks its style: lit Submit, or an outlined alternative. */
export interface KeypadAction {
  label: string;
  onPress(): void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

interface Props {
  onKey(key: Key): void;
  action: KeypadAction;
}

/** Typed answers. Lives in a Dock; full-bleed so the keys reach the screen edges. */
export function Keypad({ onKey, action }: Props) {
  // Keys type as the thumb lands, so a thumb that slides off before lifting still types.
  // The click that follows the same press is skipped; a click with no press (a hardware key, a screen reader) types.
  const pressed = useRef<{ key: Key; button: HTMLButtonElement } | null>(null);
  const onPointerDown = (key: Key) => (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    pressed.current = { key, button: event.currentTarget as HTMLButtonElement };
    onKey(key);
  };
  const onClick = (key: Key) => (event: MouseEvent) => {
    const typed = pressed.current?.key === key && event.detail !== 0;
    pressed.current = null;
    if (!typed) onKey(key);
  };
  // A press that is cancelled, or lifted off its key, brings no click: forget it, so a later click is not swallowed.
  useEffect(() => {
    const forget = () => {
      pressed.current = null;
    };
    const lifted = (event: PointerEvent) => {
      const press = pressed.current;
      if (!press) return;
      const { left, right, top, bottom } = press.button.getBoundingClientRect();
      const inside = event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;
      if (!inside) forget();
    };
    window.addEventListener('pointercancel', forget, true);
    window.addEventListener('pointerup', lifted, true);
    return () => {
      window.removeEventListener('pointercancel', forget, true);
      window.removeEventListener('pointerup', lifted, true);
    };
  }, []);

  return (
    <div class="keypad">
      <div class="keypad-grid" role="group" aria-label="Keypad">
        {ROWS.flat().map((key) => (
          <button
            key={key}
            type="button"
            class={`key${FUNCTION_KEYS.has(key) ? ' key-fn' : ''}${key === 'delete' ? ' key-delete' : ''}`}
            aria-label={LABELS[key] ?? key}
            {...{ [KEYPAD_KEY]: key }}
            onPointerDown={onPointerDown(key)}
            onClick={onClick(key)}
          >
            {key === 'delete' ? <DeleteGlyph /> : key === 'negate' ? '±' : key}
          </button>
        ))}
      </div>
      {/* The action keeps its own row and fires on release: a slip onto it can still be slid off. */}
      <div class="keypad-actions">
        <Button variant={action.variant ?? 'primary'} disabled={action.disabled} onClick={action.onPress}>
          {action.label}
        </Button>
      </div>
    </div>
  );
}

function DeleteGlyph() {
  return (
    <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true">
      <path d="M9 1H27V19H9L1 10Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />
      <path d="M14 6L22 14M22 6L14 14" stroke="currentColor" stroke-width="2" />
    </svg>
  );
}
