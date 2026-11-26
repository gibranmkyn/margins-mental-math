import { useEffect, useRef, useState } from 'preact/hooks';
import type { BackupInfo } from '../../storage/progress-store';
import { formatNumber, formatWhen } from '../format';
import { Banner, Button, Chip, ChipGroup, Screen } from '../parts';
import type { ThemeChoice } from '../theme';

const GOALS = [50, 100, 150, 200, 300];
const THEMES: Array<{ choice: ThemeChoice; label: string }> = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];

interface Props {
  sound: boolean;
  theme: ThemeChoice;
  dailyGoal: number;
  onSound(on: boolean): void;
  onTheme(choice: ThemeChoice): void;
  onDailyGoal(goal: number): void;
  onReset(): void;
  /** Backups kept on this phone, newest first. */
  backups: BackupInfo[];
  /** Put a backup back as the progress; false when it could not be done. */
  onRestore(key: string): boolean;
  onDeleteBackups(): void;
  onHome(): void;
}

/** Sound, appearance, daily goal, and a deliberate reset. */
export function Settings({ sound, theme, dailyGoal, onSound, onTheme, onDailyGoal, onReset, backups, onRestore, onDeleteBackups, onHome }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [erased, setErased] = useState(false);
  const resetRef = useRef<HTMLElement>(null);
  // The confirmation grows below the pinned button: bring it into view.
  useEffect(() => {
    if (confirming) resetRef.current?.scrollIntoView({ block: 'center' });
  }, [confirming]);
  const goals = GOALS.includes(dailyGoal) ? GOALS : [...GOALS, dailyGoal].sort((a, b) => a - b);
  return (
    <Screen
      class="settings"
      actions={
        <Button variant="secondary" onClick={onHome}>
          Done
        </Button>
      }
    >
      <header class="profile-head">
        <p class="label">Settings</p>
        <h1 class="profile-title">Your setup</h1>
      </header>

      <section class="setting" aria-label="Sound">
        <p class="label">Sound</p>
        <ChipGroup label="Sound">
          <Chip pressed={sound} onClick={() => onSound(true)}>
            On
          </Chip>
          <Chip pressed={!sound} onClick={() => onSound(false)}>
            Off
          </Chip>
        </ChipGroup>
        <p class="meta">A short tick on every answer, and a chime for promotions, badges and bests.</p>
      </section>

      <section class="setting" aria-label="Appearance">
        <p class="label">Appearance</p>
        <ChipGroup label="Appearance">
          {THEMES.map((t) => (
            <Chip key={t.choice} pressed={theme === t.choice} onClick={() => onTheme(t.choice)}>
              {t.label}
            </Chip>
          ))}
        </ChipGroup>
        <p class="meta">System follows your phone.</p>
      </section>

      <section class="setting" aria-label="Daily goal">
        <p class="label">Daily goal</p>
        <ChipGroup label="Daily goal" wrap>
          {goals.map((g) => (
            <Chip key={g} pressed={g === dailyGoal} onClick={() => onDailyGoal(g)}>
              {String(g)}
            </Chip>
          ))}
        </ChipGroup>
        <p class="meta">{formatNumber(dailyGoal)} XP a day. It never touches your streak.</p>
      </section>

      <BackupSection backups={backups} onRestore={onRestore} onDelete={onDeleteBackups} />

      <section class="setting" aria-label="Reset" ref={resetRef}>
        <p class="label">Reset</p>
        {erased ? (
          <Banner role="status" testId="reset-done">
            All progress erased.
          </Banner>
        ) : confirming ? (
          <>
            <Banner role="status">This clears every answer, streak and badge. It cannot be undone.</Banner>
            <Button
              variant="secondary"
              destructive
              onClick={() => {
                onReset();
                setConfirming(false);
                setErased(true);
              }}
            >
              Yes, erase everything
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Keep my progress
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Reset all progress
          </Button>
        )}
      </section>
    </Screen>
  );
}

type BackupStep = { kind: 'idle' } | { kind: 'restore' } | { kind: 'delete' } | { kind: 'done'; text: string };

/**
 * Backups kept on this phone: when the newest was made, and two deliberate actions, each
 * confirmed by a second press like Reset: put the newest readable one back, or delete them all.
 */
function BackupSection({ backups, onRestore, onDelete }: { backups: BackupInfo[]; onRestore(key: string): boolean; onDelete(): void }) {
  const [step, setStep] = useState<BackupStep>({ kind: 'idle' });
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (step.kind !== 'idle') ref.current?.scrollIntoView({ block: 'center' });
  }, [step.kind]);
  const newest = backups[0];
  const restorable = backups.find((b) => b.readable);
  return (
    <section class="setting" aria-label="Backups" ref={ref} data-testid="backups">
      <p class="label">Backups</p>
      {step.kind === 'done' ? (
        <Banner role="status" testId="backup-done">
          {step.text}
        </Banner>
      ) : !newest ? (
        <p class="meta" data-testid="backup-status">
          None on this phone. A copy is kept whenever saved progress cannot be read as it was.
        </p>
      ) : (
        <p class="meta" data-testid="backup-status">
          {backups.length === 1 ? 'One backup' : `${formatNumber(backups.length)} backups`}, the newest from {formatWhen(newest.savedAt)}.
          {!newest.readable && ' It came from a newer version of Margins or is damaged, so this version cannot open it.'}
        </p>
      )}
      {step.kind === 'restore' && restorable ? (
        <>
          <Banner role="status">
            This replaces your progress with the backup from {formatWhen(restorable.savedAt)}. Your progress now is kept as a backup first.
          </Banner>
          <Button
            variant="secondary"
            onClick={() =>
              setStep({ kind: 'done', text: onRestore(restorable.key) ? `Backup from ${formatWhen(restorable.savedAt)} restored.` : 'That backup could not be restored. Nothing was changed.' })
            }
          >
            Yes, restore it
          </Button>
          <Button variant="quiet" onClick={() => setStep({ kind: 'idle' })}>
            Keep my progress
          </Button>
        </>
      ) : step.kind === 'delete' ? (
        <>
          <Banner role="status">This deletes every backup on this phone. Your progress stays as it is.</Banner>
          <Button
            variant="secondary"
            destructive
            onClick={() => {
              onDelete();
              setStep({ kind: 'done', text: 'Backups deleted.' });
            }}
          >
            Yes, delete them
          </Button>
          <Button variant="quiet" onClick={() => setStep({ kind: 'idle' })}>
            Keep them
          </Button>
        </>
      ) : (
        step.kind === 'idle' &&
        newest && (
          <>
            {restorable && (
              <Button variant="secondary" onClick={() => setStep({ kind: 'restore' })}>
                {restorable === newest ? 'Restore newest backup' : `Restore backup of ${formatWhen(restorable.savedAt)}`}
              </Button>
            )}
            <Button variant="quiet" onClick={() => setStep({ kind: 'delete' })}>
              Delete backups
            </Button>
          </>
        )
      )}
    </section>
  );
}
