import { BADGES } from '../../engine/progress';
import type { Totals } from '../../engine/progress';
import { formatNumber } from '../format';
import { Badge, BadgeGrid, Button, Screen, Stat, Stats } from '../parts';

interface Props {
  totals: Totals;
  longestStreak: number;
  /** Ids of the badges earned. */
  earned: string[];
  onSettings(): void;
  onHome(): void;
}

/** Lifetime totals and every badge, earned or still locked. */
export function Profile({ totals, longestStreak, earned, onSettings, onHome }: Props) {
  const { accuracy } = totals;
  const have = new Set(earned);
  const count = BADGES.filter((b) => have.has(b.id)).length;
  return (
    <Screen
      class="profile"
      actions={
        <>
          <Button variant="secondary" onClick={onSettings}>
            Settings
          </Button>
          <Button variant="secondary" onClick={onHome}>
            Home
          </Button>
        </>
      }
    >
      <header class="profile-head">
        <p class="label">Profile</p>
        <h1 class="profile-title">Badges</h1>
        <p class="library-count" data-testid="badge-count">
          <span class="library-number">{count}</span>
          <span class="meta">of {BADGES.length} earned</span>
        </p>
      </header>

      <BadgeGrid label="Badges">
        {BADGES.map((b) => (
          <Badge key={b.id} mark={b.mark} name={b.name} earned={have.has(b.id)} how={b.how} />
        ))}
      </BadgeGrid>

      <Stats label="Lifetime">
        <Stat label="Answered" value={formatNumber(totals.answered)} />
        <Stat label="Accuracy" value={accuracy === null ? '—' : `${accuracy}%`} />
        <Stat label="Longest streak" value={`${formatNumber(longestStreak)}d`} />
      </Stats>
    </Screen>
  );
}
