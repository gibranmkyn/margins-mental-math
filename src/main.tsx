import './fonts.css';
import './ui/styles.css';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { createProgressStore } from './storage/progress-store';
import { initialProgress } from './engine/progress';
import { App } from './ui/App';
import { CrashBoundary } from './ui/screens/Trouble';
import { createUpdateGate } from './ui/updates';
import { startInputMode } from './ui/input-mode';
import { startTheme } from './ui/theme';

// A new version never reloads the page mid-session, mid-sprint or mid-mock: it waits for Home, or the next launch.
const updates = createUpdateGate({
  activate: () => void applyUpdate(true),
  reload: () => location.reload(),
});
const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh: () => updates.updateWaiting(),
  onNeedReload: () => updates.reloadNeeded(),
});

// Light or dark: the stored choice, else the phone's appearance, followed live (index.html painted it first).
startTheme();
startInputMode();

// iOS Safari only shows :active press states when a touch listener exists; this makes presses visible instantly.
document.addEventListener('touchstart', () => {}, { passive: true });

const store = createProgressStore();

/** From the crash screen: keep what is stored, erase progress, start again. */
function resetAfterCrash() {
  store.backup();
  store.save(initialProgress());
  location.reload();
}

render(
  <CrashBoundary onReset={resetAfterCrash}>
    <App store={store} onIdle={updates.setIdle} />
  </CrashBoundary>,
  document.getElementById('app')!,
);
