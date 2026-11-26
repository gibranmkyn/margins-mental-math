/**
 * Says on <html data-input> whether the owner is touching or typing, so the focus ring can follow the
 * keyboard only. Safari draws :focus-visible on a button focused by script (the Next button after an
 * answer) even when the answer was given by touch; parts.css hides the ring while data-input is "touch".
 */
export function startInputMode(doc: Document = document): void {
  const set = (mode: 'touch' | 'keys') => {
    if (doc.documentElement.dataset.input !== mode) doc.documentElement.dataset.input = mode;
  };
  doc.addEventListener('pointerdown', (event) => set(event.pointerType === 'mouse' ? 'keys' : 'touch'), { capture: true, passive: true });
  doc.addEventListener('touchstart', () => set('touch'), { capture: true, passive: true });
  doc.addEventListener('keydown', (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) set('keys');
  }, { capture: true });
}
