import { useEffect, useRef, useState } from 'preact/hooks';

interface DataTableProps {
  title?: string;
  headers: string[];
  rows: string[][];
  /** The first column names each row (a region, a product). Default true. */
  rowHeaders?: boolean;
}

/** Matches cells that are figures ("$1.2m", "-4%", "1,250", "12.5x") so they align right. */
const FIGURE = /^[−\-+]?[$€£]?[\d.,]+\s?(%|x|k|m|bn|pp)?$/i;

/**
 * Scenario data as a table. Wide tables scroll sideways inside the question, never the page:
 * the title stays put above, the first column stays pinned at the left so figures keep their row
 * names, and while columns are hidden a fade at that edge and a line under the table say so.
 */
export function DataTable({ title, headers, rows, rowHeaders = true }: DataTableProps) {
  const numeric = headers.map(
    (_, col) => !(rowHeaders && col === 0) && rows.length > 0 && rows.every((row) => FIGURE.test((row[col] ?? '').trim())),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((now) => (now.left === left && now.right === right ? now : { left, right }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [headers, rows]);
  const cls = ['table-wrap', more.left && 'table-more-left', more.right && 'table-more-right'].filter(Boolean).join(' ');
  return (
    <div class={cls}>
      {title && (
        <p class="table-title" aria-hidden="true">
          {title}
        </p>
      )}
      <div class="table-scroll" role="region" aria-label={title ?? 'Table'} tabIndex={0} ref={scroller}>
        <table class={rowHeaders ? 'table table-pinned' : 'table'}>
          {title && <caption class="sr-only">{title}</caption>}
        <thead>
          <tr>
            {headers.map((header, col) => (
              <th key={col} scope="col" class={numeric[col] ? 'num' : undefined}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, col) =>
                rowHeaders && col === 0 ? (
                  <th key={col} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={col} class={numeric[col] ? 'num' : undefined}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      {(more.left || more.right) && (
        <p class="meta table-hint" data-testid="table-hint">
          {more.right ? 'More columns: swipe the table.' : 'Swipe back for the first columns.'}
        </p>
      )}
    </div>
  );
}
