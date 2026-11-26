import type { Happening } from '../../engine/progress';
import { Badge, BadgeGrid, Banner } from '../parts';

/** A badge just unlocked, as the progress engine reports it. */
export type BadgeWin = Extract<Happening, { kind: 'badge-unlocked' }>;

interface Props {
  badges: BadgeWin[];
  /** Lead with a win banner. Pass false when the screen already has one (a level-up, a personal best). */
  banner: boolean;
}

/** The celebration for badges: stamped seals, and a banner when the screen has none. Nothing when no badge unlocked. */
export function NewBadges({ badges, banner }: Props) {
  if (badges.length === 0) return null;
  return (
    <>
      {banner && (
        <Banner tone="win" kicker={badges.length === 1 ? 'Badge' : 'Badges'} role="status" testId="badge-win">
          {badges.map((b) => b.name).join(', ')}
        </Banner>
      )}
      <BadgeGrid label="New badges">
        {badges.map((b) => (
          <Badge key={b.id} mark={b.mark} name={b.name} earned fresh />
        ))}
      </BadgeGrid>
    </>
  );
}
