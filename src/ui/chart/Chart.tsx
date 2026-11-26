import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ChartBlock } from '../../engine/question';
import { Figure } from '../parts';
import './chart.css';
import { drawChart } from './layout';
import type { Dash, LegendItem, Mark, MarkerShape, Paint } from './layout';

let instances = 0;

/**
 * The chart renderer: a chart description drawn as SVG at the width it is
 * given, at 1:1 so labels keep their size on a narrow phone, framed by the
 * Figure part. Title, units and the key are HTML so they wrap; the plot is SVG.
 * Text never goes under 12px: a chart that cannot fit its labels at that size is drawn
 * wider than its frame and scrolls sideways inside the figure, with a fade and a line saying so.
 */
export function Chart({ block, own = false }: { block: ChartBlock; /** The owner's own numbers (Trends), not a question: no instruction on how to read values. */ own?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const id = useMemo(() => `chart-${++instances}`, []);

  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const drawing = useMemo(() => (width > 0 ? drawChart(block, width) : null), [block, width]);
  const [more, setMore] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((now) => (now.left === left && now.right === right ? now : { left, right }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    return () => el.removeEventListener('scroll', measure);
  }, [drawing]);
  const hatch = `${id}-hatch`;

  return (
    <Figure title={block.title} {...(block.note ? { note: block.note } : {})}>
      <div class="chart" data-chart={block.chart}>
        <p class="chart-unit">
          {block.unit}
          {!block.labelled && !own && <span> · estimate from the gridlines</span>}
        </p>
        {drawing && drawing.legend.length > 0 && (
          <ul class="chart-legend" aria-label="Key">
            {drawing.legend.map((item) => (
              <li key={item.name}>
                <Swatch item={item} hatch={hatch} />
                {item.name}
              </li>
            ))}
          </ul>
        )}
        <div class={more.right ? 'chart-frame chart-more-right' : 'chart-frame'}>
        <div class="chart-canvas" ref={holder} tabIndex={more.left || more.right ? 0 : undefined}>
          {drawing && (
            <svg
              width={drawing.width}
              height={drawing.height}
              viewBox={`0 0 ${drawing.width} ${drawing.height}`}
              role="img"
              aria-label={`${block.title}, ${block.unit}`}
            >
              <defs>
                <HatchPattern id={hatch} />
                <HatchPattern id={`${hatch}-accent`} accent />
              </defs>
              {drawing.marks.map((mark, i) => (
                <MarkShape key={i} mark={mark} hatch={hatch} />
              ))}
            </svg>
          )}
        </div>
        </div>
        {(more.left || more.right) && (
          <p class="meta chart-hint" data-testid="chart-hint">
            {more.right ? 'More of the chart: swipe it.' : 'Swipe back for the start of the chart.'}
          </p>
        )}
      </div>
    </Figure>
  );
}

/**
 * Diagonal light lines on the page colour: a fourth series, or a waterfall decrease, that differs by texture,
 * not hue. The accent version (an asked-about decrease) runs ink lines over the accent fill.
 */
function HatchPattern({ id, accent = false }: { id: string; accent?: boolean }) {
  const kind = accent ? 'paint-accent-hatch' : 'paint-hatch';
  return (
    <pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={6} height={6} class={`${kind}-ground`} />
      <line x1={0} y1={0} x2={0} y2={6} class={`${kind}-line`} stroke-width={accent ? 2 : 3.5} />
    </pattern>
  );
}

function fillOf(paint: Paint, hatch: string): { class: string; fill?: string } {
  if (paint === 'hatch') return { class: 'paint-hatch', fill: `url(#${hatch})` };
  if (paint === 'accent-hatch') return { class: 'paint-accent-hatch', fill: `url(#${hatch}-accent)` };
  return { class: `paint-${paint}` };
}

const DASH_ARRAY: Record<Dash, string | undefined> = { solid: undefined, dash: '7 4', dot: '1.5 4', dashdot: '8 3 2 3' };

function MarkShape({ mark, hatch }: { mark: Mark; hatch: string }) {
  switch (mark.kind) {
    case 'rect':
      return <rect x={mark.x} y={mark.y} width={Math.max(0, mark.w)} height={Math.max(0, mark.h)} {...fillOf(mark.paint, hatch)} />;
    case 'slice':
      return <path d={mark.d} {...fillOf(mark.paint, hatch)} class={`${fillOf(mark.paint, hatch).class} chart-slice`} stroke-width={2} />;
    case 'rule':
      return (
        <line
          x1={mark.x1}
          y1={mark.y1}
          x2={mark.x2}
          y2={mark.y2}
          class={`rule-${mark.tone}`}
          stroke-width={mark.tone === 'base' ? 1.5 : 1}
          stroke-dasharray={mark.tone === 'reference' ? '5 3' : mark.tone === 'connector' ? '2 2' : undefined}
          shape-rendering={mark.tone === 'leader' ? undefined : 'crispEdges'}
        />
      );
    case 'line':
      return (
        <polyline
          points={mark.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
          class={`stroke-${mark.paint === 'hatch' ? 'light' : mark.paint}`}
          fill="none"
          stroke-width={mark.bold ? 3 : 2.25}
          stroke-dasharray={DASH_ARRAY[mark.dash]}
          stroke-linejoin="round"
          stroke-linecap={mark.dash === 'dot' ? 'round' : 'butt'}
        />
      );
    case 'marker':
      return <Marker x={mark.x} y={mark.y} shape={mark.shape} paint={mark.paint} />;
    case 'text':
      return (
        <text
          x={mark.x}
          y={mark.y}
          text-anchor={mark.anchor}
          font-size={mark.size}
          font-weight={mark.weight === 'bold' ? 650 : 450}
          class={`ink-${mark.tone}`}
          stroke-width={mark.tone === 'halo' ? 3.5 : undefined}
        >
          {mark.text}
        </text>
      );
  }
}

function Marker({ x, y, shape, paint, r = 4 }: { x: number; y: number; shape: MarkerShape; paint: Paint; r?: number }) {
  const cls = `paint-${paint === 'hatch' ? 'light' : paint} chart-marker`;
  switch (shape) {
    case 'circle':
      return <circle cx={x} cy={y} r={r} class={cls} stroke-width={1.5} />;
    case 'square':
      return <rect x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} class={cls} stroke-width={1.5} />;
    case 'triangle':
      return <path d={`M ${x} ${y - r * 1.15} L ${x + r * 1.1} ${y + r * 0.8} L ${x - r * 1.1} ${y + r * 0.8} Z`} class={cls} stroke-width={1.5} />;
    case 'diamond':
      return <path d={`M ${x} ${y - r * 1.25} L ${x + r * 1.1} ${y} L ${x} ${y + r * 1.25} L ${x - r * 1.1} ${y} Z`} class={cls} stroke-width={1.5} />;
  }
}

/** A key entry drawn exactly as the series is: same fill or hatching, or the same dash and marker. */
function Swatch({ item, hatch }: { item: LegendItem; hatch: string }) {
  if (item.dash && item.shape) {
    return (
      <svg class="chart-swatch chart-swatch-line" width={26} height={14} viewBox="0 0 26 14" aria-hidden="true">
        <line x1={1} y1={7} x2={25} y2={7} class={`stroke-${item.paint === 'hatch' ? 'light' : item.paint}`} stroke-width={2.25} stroke-dasharray={DASH_ARRAY[item.dash]} />
        <Marker x={13} y={7} shape={item.shape} paint={item.paint} r={3.5} />
      </svg>
    );
  }
  return (
    <svg class="chart-swatch" width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <defs>
        <HatchPattern id={`${hatch}-key`} />
        <HatchPattern id={`${hatch}-key-accent`} accent />
      </defs>
      <rect width={14} height={14} {...fillOf(item.paint, `${hatch}-key`)} />
    </svg>
  );
}
