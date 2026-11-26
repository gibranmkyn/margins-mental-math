import type { ComponentChildren } from 'preact';

interface FigureProps {
  title: string;
  /** Units, source or "Not to scale": a muted line under the chart. */
  note?: string;
  /** The drawn chart (an SVG from the chart renderer). */
  children: ComponentChildren;
}

/** Frames a chart: title above, note below, the drawing full width. Chart colours: --chart-1 to --chart-4. */
export function Figure({ title, note, children }: FigureProps) {
  return (
    <figure class="figure">
      <figcaption class="figure-title">{title}</figcaption>
      <div class="figure-body">{children}</div>
      {note !== undefined && <p class="figure-note">{note}</p>}
    </figure>
  );
}
