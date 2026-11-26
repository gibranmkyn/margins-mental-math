import { libraryTotals } from '../../engine/progress';
import type { BookletStatus } from '../../engine/progress';
import { formatNumber } from '../format';
import { Button, Row, RowList, Screen } from '../parts';

interface Props {
  booklets: BookletStatus[];
  /** The booklet the primary action picks up, if any is unfinished. */
  next: BookletStatus | undefined;
  onOpen(bookletId: string): void;
  onHome(): void;
}

/** The owner's booklets, each with questions answered correctly out of the total. Opening one continues it. Home offers it only when there are booklets. */
export function Library({ booklets, next, onOpen, onHome }: Props) {
  const { correct, total, waiting } = libraryTotals(booklets);
  return (
    <Screen
      class="library"
      actions={
        <>
          {next && (
            <>
              <p class="next-meta" data-testid="library-next">
                <strong>{next.name}</strong>
                <span class="meta">{formatNumber(next.total - next.correct)} still to get right</span>
              </p>
              <Button arrow onClick={() => onOpen(next.id)}>
                Continue booklet
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onHome}>
            Home
          </Button>
        </>
      }
    >
      <header class="library-head">
        <p class="label">Library</p>
        <h1 class="library-title">Your booklets</h1>
        <p class="library-count" data-testid="library-count">
          <span class="library-number">{formatNumber(correct)}</span>
          <span class="meta">of {formatNumber(total)} correct</span>
        </p>
        {waiting > 0 && <p class="meta">{formatNumber(waiting)} more join when their charts are redrawn.</p>}
      </header>

      <RowList label="Booklets">
        {booklets.map((b) => (
          <Row
            key={b.id}
            testId={`booklet-${b.id}`}
            title={b.name}
            meta={b.finished ? `Finished · ${b.correct} of ${b.total}` : `${b.correct} of ${b.total} correct`}
            trailing={<span class="library-pct">{b.percent}%</span>}
            coverage={b.percent}
            coverageLabel={`${b.name} coverage`}
            onClick={() => onOpen(b.id)}
          />
        ))}
      </RowList>
    </Screen>
  );
}
