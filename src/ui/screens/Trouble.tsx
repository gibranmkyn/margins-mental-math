import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { StoreHealth, StoreNotice } from '../../storage/progress-store';
import { Banner, Button, Screen } from '../parts';

/** What Home says, once, about a stored document that could not be read as it was. */
export function noticeText(notice: StoreNotice): string {
  if (notice.backupKey === null) {
    return 'Saved progress could not be read or backed up. It is left untouched on this phone, and nothing is saved this visit.';
  }
  switch (notice.kind) {
    case 'newer':
      return 'Saved progress came from a newer version of Margins and could not be opened. A copy is kept on this phone; you are starting fresh.';
    case 'unreadable':
      return 'Saved progress could not be read. A copy is kept on this phone; you are starting fresh.';
    case 'repaired':
      return 'Some saved progress was damaged and has been repaired. A copy of the original is kept on this phone.';
  }
}

/** What Home says when progress is not being saved, or soon will not be; null when all is well. */
export function healthText(health: StoreHealth, hasBackups: boolean): string | null {
  const room = hasBackups ? ' Delete old backups in Settings to make room.' : '';
  switch (health.kind) {
    case 'ok':
      return null;
    case 'blocked':
      return 'This browser is not letting Margins save. Anything you do now is lost when the app closes.';
    case 'full':
      return `Storage on this phone is full, so new progress is not being saved.${room}`;
    case 'nearly-full':
      return `Storage for Margins is ${health.percent}% full; saving stops when it runs out.${room}`;
  }
}

interface BoundaryProps {
  /** Keep the stored text, then erase progress. */
  onReset(): void;
  children: ComponentChildren;
}

/** Catches a crash anywhere below it, so a broken screen never leaves a blank page with Reset out of reach. */
export class CrashBoundary extends Component<BoundaryProps, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    return this.state.crashed ? <Crashed onReset={this.props.onReset} /> : this.props.children;
  }
}

/** The crash screen itself. Exported so the specimen can show it. */
export function Crashed({ onReset }: { onReset(): void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Screen
      class="settings"
      actions={
        <>
          <Button arrow onClick={() => location.reload()}>
            Reload
          </Button>
          {confirming ? (
            <Button variant="secondary" destructive onClick={onReset}>
              Yes, erase everything
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Reset all progress
            </Button>
          )}
        </>
      }
    >
      <header class="profile-head">
        <p class="label">Margins</p>
        <h1 class="profile-title">Something broke</h1>
      </header>
      <p class="meta">Reload first. If it breaks again, reset: a copy of your saved progress is kept on this phone before anything is erased.</p>
      {confirming && <Banner role="status">This clears every answer, streak and badge from the app.</Banner>}
    </Screen>
  );
}
