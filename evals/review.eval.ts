import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { ChartBlock, ContextBlock } from '../src/engine/question';
import { bookletNamesIn, bookletWording, fingerprint, phrases } from '../src/engine/question/authored-verify';
import { drawChart } from '../src/ui/chart/layout';
import type { Dash, LegendItem, Mark, MarkerShape, Paint } from '../src/ui/chart/layout';
import { SKILL_NAMES } from '../src/ui/format';
import { bookletIndex, candidates, fingerprintText, JUDGES, OWNER, sources } from './lib';
import type { Candidate } from './lib';

/**
 * The owner's review page: every candidate as a practice question, with its eval results
 * and a three-way mark and note kept in the browser. `npm run eval:review` (which runs
 * `eval:candidates` first, so judges' latest verdicts are in) writes evals/report/review.html.
 *
 * Its default view, "One per family", shows one waiting variant of each family past four variants
 * that the owner has not reviewed (evals/README.md, "Family: owner sample"; since 26 November 2026
 * a missing review warns and no longer blocks). "All questions" shows every candidate. Marks are
 * kept per candidate, so both views share them.
 *
 * The page is published to a hosted service, so it carries no booklet text, booklet names, case
 * titles or exhibit content: only candidates, their source ids and eval results (the test below
 * checks it). It is a page fragment (no doctype, html, head or body): the publishing tool wraps
 * it and sets a CSP. Charts are the app's own drawings (drawChart in src/ui/chart/layout.ts),
 * turned into SVG here exactly as Chart.tsx draws them, at a phone width and a laptop width.
 */

// ---------- Eval results, as evals/candidates.eval.ts writes them ----------

const GATES = ['structure', 'calculation', 'traps', 'chart drawn', 'originality', 'blind solve'] as const;

interface Row {
  id: string;
  modelledOn: string;
  gates: Record<string, string[]>;
  fidelity: string[];
  variety: string[];
  judged: Record<string, { fail: boolean; why?: string }>;
  ready: boolean;
  admit: boolean;
}

const reportFiles = import.meta.glob<Row[]>('./report/candidates.json', { eager: true, import: 'default' });
const rows: Row[] = Object.values(reportFiles)[0] ?? [];
const rowOf = new Map(rows.map((r) => [r.id, r]));

// ---------- Families, as evals/candidates.eval.ts writes them, and the round lists' keyed claims ----------

/** One source's family in evals/report/batch.json. */
interface FamilyRow {
  source: string;
  waiting: string[];
  admitted: string[];
  ownerReviewed: string[];
}
const batchFiles = import.meta.glob<{ families?: FamilyRow[] }>('./report/batch.json', { eager: true, import: 'default' });
const familyRows: FamilyRow[] = Object.values(batchFiles)[0]?.families ?? [];

/** Past this many variants a family needs a waiting variant reviewed by the owner (MAX_VARIANTS_PER_SOURCE in candidates.eval.ts). */
const BASE_CAP = 4;

interface RoundVariant {
  id: string;
  keys?: string;
  industry?: string;
}
interface RoundSource {
  id: string;
  keyedClaim?: { claims: Record<string, string> };
  admitted?: RoundVariant[];
  waiting?: RoundVariant[];
  new?: RoundVariant[];
}
const roundFiles = import.meta.glob<{ groups?: Array<{ sources?: RoundSource[] }> }>('./round-*-sources.json', { eager: true, import: 'default' });
/** Per statement source whose keyed claim moves: the kind of claim each of its options makes, by letter. */
const claimsOf = new Map<string, Record<string, string>>();
/** The claim each variant keys, admitted or waiting, as the round list declares it (`claimPlans` in candidates.eval.ts). */
const keysOf = new Map<string, string>();
/** The setting the round list gives each admitted variant ("oven maker (wiring)"): authored, so safe to show. */
const settingOf = new Map<string, string>();
for (const round of Object.values(roundFiles)) {
  for (const s of (round.groups ?? []).flatMap((g) => g.sources ?? [])) {
    if (s.keyedClaim && !claimsOf.has(s.id)) claimsOf.set(s.id, s.keyedClaim.claims);
    for (const v of [...(s.admitted ?? []), ...(s.waiting ?? []), ...(s.new ?? [])]) {
      if (v.keys !== undefined) keysOf.set(v.id, v.keys);
      if (v.industry !== undefined) settingOf.set(v.id, v.industry);
    }
  }
}

/** The claim the source's own answer makes: the one every admitted variant of most of these families keys. */
function usualClaim(source: string): string | undefined {
  const claims = claimsOf.get(source);
  const q = sources.get(source);
  if (!claims || !q || q.answer.kind !== 'choice') return undefined;
  return claims['ABCDE'[q.answer.correctIndex] ?? ''];
}

/** A variant of a keyed-claim family whose true statement is not the source's claim: the new kind in round 3. */
function movedClaim(c: Candidate): boolean {
  const usual = usualClaim(c.modelledOn);
  const keys = keysOf.get(c.id);
  return usual !== undefined && keys !== undefined && keys !== usual;
}

const familyOf = new Map(familyRows.map((f) => [f.source, f]));
const familySize = (f: FamilyRow) => f.waiting.length + f.admitted.length;

/** Families past four with no owner review (a warning since 26 November 2026, no longer a block): waiting variants, none reviewed, more than four in all. */
const needReview = familyRows.filter((f) => f.waiting.length > 0 && f.ownerReviewed.length === 0 && familySize(f) > BASE_CAP);
const needSources = new Set(needReview.map((f) => f.source));

/**
 * The one variant the default view shows per family, chosen deterministically: in a statement family whose keyed claim
 * moves, the first (by id) whose claim moved, since those are the new kind and the owner's check of them is the one no
 * code makes; otherwise the first by id.
 */
const picks = new Set(
  needReview.flatMap((f) => {
    const waiting = candidates.filter((c) => c.modelledOn === f.source).sort((a, b) => (a.id < b.id ? -1 : 1));
    const pick = waiting.find(movedClaim) ?? waiting[0];
    return pick ? [pick.id] : [];
  }),
);

/** What is new about this candidate's family in this round, in a line, for a family past four. */
function familyNote(c: Candidate): { note: string; settings: string } | undefined {
  const f = familyOf.get(c.modelledOn);
  if (!f || familySize(f) <= BASE_CAP) return undefined;
  const n = f.admitted.length;
  const inApp = `${n} variant${n === 1 ? '' : 's'} already in the app`;
  let note: string;
  if (claimsOf.has(c.modelledOn) && usualClaim(c.modelledOn) !== undefined) {
    const keys = keysOf.get(c.id);
    const shared = f.admitted.filter((id) => keysOf.get(id) === keys).length;
    if (!movedClaim(c)) note = `In this family other new variants make a different statement the true one; this one keeps the source's usual one, as ${shared} of the ${inApp} do.`;
    else if (shared === 0) note = `In this family the true statement is a different one than in the ${inApp}.`;
    else note = `In this family the true statement here is not the source's usual one; ${shared} of the ${inApp} share it.`;
  } else {
    note = `This family grows past four variants (${n} in the app, ${f.waiting.length} waiting). Each answer comes from the variant's own numbers, so siblings share a method, not an answer: check this one does not read like a repeat of them.`;
  }
  const named = f.admitted.flatMap((id) => settingOf.get(id) ?? []);
  const rest = n - named.length;
  const settings =
    named.length === 0 ? '' : `Siblings in the app are set in: ${named.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}. A repeated industry or story is worth a note.`;
  return { note, settings };
}

// ---------- Small helpers ----------

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
/** Coordinates to a tenth of a pixel: the drawing is at 1:1, so finer is invisible and only adds bytes. */
const n2 = (v: number) => String(Math.round(v * 10) / 10);

/** A source by its id only ("pst1-q06"): the booklet's name and case title stay off the published page. */
function sourceLabel(id: string): string {
  return id;
}

function skillName(skill: string): string {
  return (SKILL_NAMES as Record<string, string>)[skill] ?? skill;
}

/** A deterministic shuffle (mulberry32), then siblings (same source) pulled apart so none sit side by side. */
function mixedOrder(items: Candidate[]): Candidate[] {
  let s = parseInt(fingerprintText('margins candidate review'), 16);
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out: Candidate[] = [];
  while (pool.length > 0) {
    const last = out[out.length - 1]?.modelledOn;
    const next = Math.max(
      0,
      pool.findIndex((c) => c.modelledOn !== last),
    );
    out.push(pool.splice(next, 1)[0]!);
  }
  return out;
}

// ---------- Charts: the app's drawing, as SVG text (mirrors src/ui/chart/Chart.tsx) ----------

const NARROW = 358;
const WIDE = 640;
const DASH_ARRAY: Record<Dash, string | undefined> = { solid: undefined, dash: '7 4', dot: '1.5 4', dashdot: '8 3 2 3' };

const attrs = (pairs: Record<string, string | number | undefined>) =>
  Object.entries(pairs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n2(v) : esc(v!)}"`)
    .join('');

function hatchPattern(id: string, accent = false): string {
  const kind = accent ? 'paint-accent-hatch' : 'paint-hatch';
  return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="${kind}-ground"/><line x1="0" y1="0" x2="0" y2="6" class="${kind}-line" stroke-width="${accent ? 2 : 3.5}"/></pattern>`;
}

function fillOf(paint: Paint, hatch: string): { class: string; fill?: string } {
  if (paint === 'hatch') return { class: 'paint-hatch', fill: `url(#${hatch})` };
  if (paint === 'accent-hatch') return { class: 'paint-accent-hatch', fill: `url(#${hatch}-accent)` };
  return { class: `paint-${paint}` };
}

function marker(x: number, y: number, shape: MarkerShape, paint: Paint, r = 4): string {
  const cls = `paint-${paint === 'hatch' ? 'light' : paint} chart-marker`;
  switch (shape) {
    case 'circle':
      return `<circle${attrs({ cx: x, cy: y, r, class: cls, 'stroke-width': 1.5 })}/>`;
    case 'square':
      return `<rect${attrs({ x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, class: cls, 'stroke-width': 1.5 })}/>`;
    case 'triangle':
      return `<path${attrs({ d: `M ${n2(x)} ${n2(y - r * 1.15)} L ${n2(x + r * 1.1)} ${n2(y + r * 0.8)} L ${n2(x - r * 1.1)} ${n2(y + r * 0.8)} Z`, class: cls, 'stroke-width': 1.5 })}/>`;
    case 'diamond':
      return `<path${attrs({ d: `M ${n2(x)} ${n2(y - r * 1.25)} L ${n2(x + r * 1.1)} ${n2(y)} L ${n2(x)} ${n2(y + r * 1.25)} L ${n2(x - r * 1.1)} ${n2(y)} Z`, class: cls, 'stroke-width': 1.5 })}/>`;
  }
}

function markSvg(mark: Mark, hatch: string): string {
  switch (mark.kind) {
    case 'rect':
      return `<rect${attrs({ x: mark.x, y: mark.y, width: Math.max(0, mark.w), height: Math.max(0, mark.h), ...fillOf(mark.paint, hatch) })}/>`;
    case 'slice': {
      const f = fillOf(mark.paint, hatch);
      return `<path${attrs({ d: mark.d, fill: f.fill, class: `${f.class} chart-slice`, 'stroke-width': 2 })}/>`;
    }
    case 'rule':
      return `<line${attrs({
        x1: mark.x1,
        y1: mark.y1,
        x2: mark.x2,
        y2: mark.y2,
        class: `rule-${mark.tone}`,
        // Stroke width 1 and crisp edges (all but leaders) are set in the stylesheet.
        'stroke-width': mark.tone === 'base' ? 1.5 : undefined,
        'stroke-dasharray': mark.tone === 'reference' ? '5 3' : mark.tone === 'connector' ? '2 2' : undefined,
      })}/>`;
    case 'line':
      return `<polyline${attrs({
        points: mark.points.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '),
        class: `stroke-${mark.paint === 'hatch' ? 'light' : mark.paint}`,
        fill: 'none',
        'stroke-width': mark.bold ? 3 : 2.25,
        'stroke-dasharray': DASH_ARRAY[mark.dash],
        'stroke-linecap': mark.dash === 'dot' ? 'round' : undefined,
      })}/>`;
    case 'marker':
      return marker(mark.x, mark.y, mark.shape, mark.paint);
    case 'text':
      return `<text${attrs({
        x: mark.x,
        y: mark.y,
        // Size 12 and weight 450 are inherited from the svg (stylesheet); only departures are written.
        'text-anchor': mark.anchor === 'start' ? undefined : mark.anchor,
        'font-size': mark.size === 12 ? undefined : mark.size,
        'font-weight': mark.weight === 'bold' ? 650 : undefined,
        class: `ink-${mark.tone}`,
        'stroke-width': mark.tone === 'halo' ? 3.5 : undefined,
      })}>${esc(mark.text)}</text>`;
  }
}

function swatch(item: LegendItem, hatch: string): string {
  if (item.dash && item.shape) {
    return `<svg class="chart-swatch chart-swatch-line" width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><line x1="1" y1="7" x2="25" y2="7" class="stroke-${item.paint === 'hatch' ? 'light' : item.paint}" stroke-width="2.25"${attrs({ 'stroke-dasharray': DASH_ARRAY[item.dash] })}/>${marker(13, 7, item.shape, item.paint, 3.5)}</svg>`;
  }
  const defs = item.paint === 'hatch' ? hatchPattern(`${hatch}-key`) : item.paint === 'accent-hatch' ? hatchPattern(`${hatch}-key-accent`, true) : '';
  return `<svg class="chart-swatch" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}<rect width="14" height="14"${attrs(fillOf(item.paint, `${hatch}-key`))}/></svg>`;
}

let chartCount = 0;

function chartHtml(block: ChartBlock): string {
  const id = `chart-${++chartCount}`;
  const svgAt = (width: number, which: string) => {
    const drawing = drawChart(block, width);
    const hatch = `${id}-${which}-hatch`;
    const paints = new Set(drawing.marks.flatMap((m) => ('paint' in m ? [m.paint] : [])));
    const defs = (paints.has('hatch') ? hatchPattern(hatch) : '') + (paints.has('accent-hatch') ? hatchPattern(`${hatch}-accent`, true) : '');
    return {
      drawing,
      html: `<div class="chart-canvas chart-${which}" tabindex="0" role="region" aria-label="${esc(block.title)}, chart"><svg width="${drawing.width}" height="${drawing.height}" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="${esc(`${block.title}, ${block.unit}`)}">${defs ? `<defs>${defs}</defs>` : ''}${drawing.marks.map((m) => markSvg(m, hatch)).join('')}</svg></div>`,
    };
  };
  const narrow = svgAt(NARROW, 'narrow');
  const wide = svgAt(WIDE, 'wide');
  const legend = narrow.drawing.legend;
  return `<figure class="figure"><figcaption class="figure-title">${esc(block.title)}</figcaption><div class="chart"><p class="chart-unit">${esc(block.unit)}${block.labelled ? '' : '<span> · estimate from the gridlines</span>'}</p>${
    legend.length > 0 ? `<ul class="chart-legend" aria-label="Key">${legend.map((item, i) => `<li>${swatch(item, `${id}-key${i}`)}${esc(item.name)}</li>`).join('')}</ul>` : ''
  }${narrow.html}${wide.html}</div>${block.note !== undefined ? `<p class="figure-note">${esc(block.note)}</p>` : ''}</figure>`;
}

// ---------- Context blocks, as the app shows them (ScenarioSession.tsx Block, DataTable) ----------

const FIGURE = /^[−\-+]?[$€£]?[\d.,]+\s?(%|x|k|m|bn|pp)?$/i;

function tableHtml(block: Extract<ContextBlock, { type: 'table' }>): string {
  const numeric = block.headers.map((_, col) => col !== 0 && block.rows.length > 0 && block.rows.every((row) => FIGURE.test((row[col] ?? '').trim())));
  const cls = (col: number) => (numeric[col] ? ' class="num"' : '');
  return `<div class="table-wrap">${block.title ? `<p class="table-title">${esc(block.title)}</p>` : ''}<div class="table-scroll" role="region" aria-label="${esc(block.title ?? 'Table')}" tabindex="0"><table class="table"><thead><tr>${block.headers
    .map((h, col) => `<th scope="col"${cls(col)}>${esc(h)}</th>`)
    .join('')}</tr></thead><tbody>${block.rows
    .map((row) => `<tr>${row.map((cell, col) => (col === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td${cls(col)}>${esc(cell)}</td>`)).join('')}</tr>`)
    .join('')}</tbody></table></div></div>`;
}

function blockHtml(block: ContextBlock): string {
  switch (block.type) {
    case 'chart':
      return chartHtml(block);
    case 'paragraph':
      return `<p class="case-para">${esc(block.text)}</p>`;
    case 'list':
      return `<ul class="case-list">${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
    case 'table':
      return tableHtml(block);
  }
}

// ---------- Eval status per candidate ----------

type Tone = 'good' | 'warn' | 'bad' | 'none';
const tag = (tone: Tone, text: string) => `<span class="tag tag-${tone}">${esc(text)}</span>`;

interface Status {
  html: string;
  summary: string;
  failed: boolean;
}

function blindSolve(problems: string[]): { tone: Tone; text: string } {
  const p = problems[0];
  if (!p) return { tone: 'good', text: 'agrees with the key' };
  if (p.endsWith('never independently checked')) return { tone: 'none', text: 'not solved yet' };
  if (p.includes('changed since its check')) return { tone: 'warn', text: 'changed since it was solved; needs a new solve' };
  const chose = /checker chose (\d+), bank says (\d+)/.exec(p);
  if (chose) return { tone: 'bad', text: `solver chose ${LETTERS[Number(chose[1])]}, key says ${LETTERS[Number(chose[2])]}` };
  return { tone: 'bad', text: p.replace(/^[^:]+: /, '') };
}

function statusOf(c: Candidate): Status {
  const row = rowOf.get(c.id);
  if (!row) return { html: '<p class="meta">Not scored: run <code>npm run eval:candidates</code>, then regenerate this page.</p>', summary: 'not scored yet', failed: false };
  const items: string[] = [];
  const strip = (p: string) => p.replace(new RegExp(`^${c.id.replace(/[-]/g, '\\-')}(?: chart \\d+)?: `), '');
  const gateFails = GATES.filter((g) => g !== 'blind solve' && (row.gates[g]?.length ?? 0) > 0);
  if (gateFails.length === 0) items.push(`<li><span class="check-name">gates</span>${tag('good', 'all pass')}<p class="why">structure, calculation, traps, chart drawn, originality</p></li>`);
  else for (const g of GATES) {
    if (g === 'blind solve') continue;
    const problems = row.gates[g] ?? [];
    items.push(
      `<li><span class="check-name">${g}</span>${problems.length === 0 ? tag('good', 'pass') : tag('bad', 'fail')}${problems.length > 0 ? `<ul class="why">${problems.map((p) => `<li>${esc(strip(p))}</li>`).join('')}</ul>` : ''}</li>`,
    );
  }
  const solve = blindSolve(row.gates['blind solve'] ?? []);
  items.push(`<li><span class="check-name">blind solve</span>${tag(solve.tone, solve.text)}</li>`);
  for (const [name, problems] of [
    ['fidelity to source', row.fidelity],
    ['variety', row.variety],
  ] as const) {
    items.push(
      `<li><span class="check-name">${name}</span>${problems.length === 0 ? tag('good', 'pass') : tag('bad', 'findings')}${problems.length > 0 ? `<ul class="why">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</li>`,
    );
  }
  const failedJudges: string[] = [];
  for (const judge of [...JUDGES, OWNER]) {
    const v = row.judged[judge];
    if (!v && judge === OWNER) continue;
    if (v?.fail) failedJudges.push(judge);
    items.push(
      `<li><span class="check-name">${judge === OWNER ? 'owner (saved)' : `judge: ${judge}`}</span>${!v ? tag('none', 'not judged yet') : v.fail ? tag('bad', 'fail') : tag('good', 'pass')}${v?.fail && v.why ? `<p class="why">${esc(v.why)}</p>` : ''}</li>`,
    );
  }
  const judged = JUDGES.filter((j) => row.judged[j]).length;
  const passed = JUDGES.filter((j) => row.judged[j] && !row.judged[j].fail).length;
  const failed = gateFails.length > 0 || solve.tone === 'bad' || row.fidelity.length > 0 || row.variety.length > 0 || failedJudges.length > 0;
  const summary = [
    gateFails.length === 0 ? 'gates pass' : `gate failed: ${gateFails.join(', ')}`,
    `blind solve ${solve.tone === 'good' ? 'agrees' : solve.tone === 'none' ? 'not yet' : solve.tone === 'warn' ? 'out of date' : 'disagrees'}`,
    judged === 0 ? 'not judged yet' : `judges ${passed} of ${judged} passed${failedJudges.length > 0 ? ` (failed: ${failedJudges.join(', ')})` : ''}`,
    ...(row.fidelity.length + row.variety.length > 0 ? ['fidelity or variety findings'] : []),
  ].join(' · ');
  const verdict = row.admit
    ? tag('good', 'admissible')
    : !row.ready
      ? tag('bad', 'not ready')
      : failedJudges.length > 0 || solve.tone === 'bad'
        ? tag('bad', 'ready, not admitted: failed a check')
        : tag('warn', 'ready, awaiting solve or judges');
  return { html: `<p class="checks-verdict">${verdict}</p><ul class="checks-list">${items.join('')}</ul>`, summary, failed };
}

// ---------- One candidate ----------

/**
 * For a variant whose keyed claim moved: which statement is keyed and which claim it is declared to make, the claim the
 * source's own answer makes, and the slips this variant declares (one of them makes that usual claim look true). Which
 * claim a statement makes is a matter of meaning that no code settles (evals/README.md, "The keyed claim"), so every
 * declared slip is listed rather than one picked by wording.
 */
function keyedClaimHtml(c: Candidate): string {
  if (!movedClaim(c)) return '';
  const keys = keysOf.get(c.id)!;
  const usual = usualClaim(c.modelledOn)!;
  const f = familyOf.get(c.modelledOn);
  const n = f?.admitted.length ?? 0;
  const onUsual = f ? f.admitted.filter((id) => keysOf.get(id) === usual).length : 0;
  const slips = (c.traps ?? []).map((t) => {
    const i = c.options.indexOf(t.option);
    return `<li>${esc(t.slip)} <span class="slip-lands">→ ${i >= 0 ? `${LETTERS[i]}. ` : ''}${esc(t.option)}</span></li>`;
  });
  return `<div class="callout keyed"><p class="label">Check the keyed claim</p>
<p>True here: <strong>${LETTERS[c.correctIndex]}</strong>. ${esc(c.options[c.correctIndex] ?? '')}<br>Declared as the claim “${esc(keys)}”.</p>
<p>The source's own true statement makes the claim “${esc(usual)}”${n > 0 && onUsual > 0 ? `, as ${onUsual} of the ${n} variant${n === 1 ? '' : 's'} already in the app do` : ''}. Here that claim should be false, with a slip that makes it look true. The slips this variant declares:</p>
<ul class="slips">${slips.join('') || '<li>none declared</li>'}</ul>
<p class="meta">No automatic check can tell which claim a statement makes. If the true statement is not the claim named above, or the usual claim is in fact true here, mark Something off.</p></div>`;
}

function candidateHtml(original: Candidate): string {
  // The owner's verdict carries the candidate's own fingerprint; the page shows it with any booklet wording withheld.
  let print = '';
  try {
    print = fingerprint(original);
  } catch {
    print = '';
  }
  const c = shown(original);
  const id = c.id;
  const status = statusOf(c);
  const fam = familyNote(c);
  const options = c.options
    .map(
      (o, i) =>
        `<button type="button" class="opt" id="opt-${id}-${i}" data-i="${i}"><span class="opt-key" aria-hidden="true">${LETTERS[i]}</span><span class="opt-text">${esc(o)}</span><span class="opt-tag" hidden></span></button>`,
    )
    .join('');
  const marks = (
    [
      ['real', 'Reads real'],
      ['off', 'Something off'],
      ['reject', 'Reject'],
    ] as const
  )
    .map(
      ([value, label]) =>
        `<input type="radio" class="mark-input" name="mark-${id}" id="mark-${id}-${value}" value="${value}"><label for="mark-${id}-${value}" class="mark-label">${label}</label>`,
    )
    .join('');
  return `<article class="q" id="q-${id}" data-id="${id}" data-source="${esc(c.modelledOn)}" data-skill="${esc(c.skill)}" data-correct="${c.correctIndex}" data-failed="${status.failed ? 1 : 0}" data-fp="${print}"${picks.has(id) ? ' data-pick="1"' : ''}${needSources.has(c.modelledOn) ? ' data-needs="1"' : ''}>
<p class="q-meta"><span class="q-id">${esc(id)}</span><span>${esc(skillName(c.skill))}</span><span>Tier ${c.tier}</span><span>modelled on ${esc(sourceLabel(c.modelledOn))}</span></p>
${fam ? `<div class="q-new"><p><span class="label">New in this family</span> ${esc(fam.note)}</p>${fam.settings ? `<p class="meta">${esc(fam.settings)}</p>` : ''}</div>` : ''}
<div class="case">${c.context.map(blockHtml).join('')}</div>
<p class="case-prompt">${esc(c.prompt)}</p>
<div class="options" role="group" aria-label="Options">${options}</div>
<p class="answer-actions"><button type="button" class="quiet show-answer" id="show-${id}">Show answer</button><button type="button" class="quiet clear-answer" id="clear-${id}" hidden>Clear my answer</button></p>
<div class="feedback" id="feedback-${id}" hidden>
<p class="verdict" role="status"></p>
${c.shortcut ? `<div class="callout"><p class="label">Shortcut</p><p>${esc(c.shortcut)}</p></div>` : ''}
<p class="label">Worked solution</p>
<ol class="steps">${c.solution.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
${keyedClaimHtml(c)}
</div>
<details class="checks"><summary><span class="label">Checks</span> <span class="checks-summary${status.failed ? ' is-failed' : ''}">${esc(status.summary)}</span></summary>${status.html}</details>
<fieldset class="review"><legend class="label">Your review</legend><div class="marks">${marks}</div><label class="note-label" for="note-${id}">Note</label><input type="text" class="note" id="note-${id}" autocomplete="off" placeholder="One line: what reads off, or why it is fine"></fieldset>
</article>`;
}

// ---------- The page ----------

function scorecardHtml(): string {
  if (rows.length === 0) return '<p class="meta">No eval results found: run <code>npm run eval:candidates</code>, then regenerate.</p>';
  const total = rows.length;
  const pass = (failed: (r: Row) => boolean) => rows.filter((r) => !failed(r)).length;
  const lines: Array<[string, string]> = [
    ...GATES.filter((g) => g !== 'blind solve').map((g): [string, string] => [`Gate: ${g}`, `${pass((r) => (r.gates[g]?.length ?? 0) > 0)} of ${total}`]),
    ['Blind solve agrees', `${pass((r) => (r.gates['blind solve']?.length ?? 0) > 0)} of ${total}`],
    ['Fidelity to source', `${pass((r) => r.fidelity.length > 0)} of ${total}`],
    ['Variety', `${pass((r) => r.variety.length > 0)} of ${total}`],
    ...JUDGES.map((j): [string, string] => {
      const judged = rows.filter((r) => r.judged[j]);
      return [`Judge: ${j}`, judged.length === 0 ? 'not run yet' : `${judged.filter((r) => !r.judged[j]!.fail).length} of ${judged.length} judged passed`];
    }),
  ];
  const ready = rows.filter((r) => r.ready).length;
  const admit = rows.filter((r) => r.admit).length;
  return `<dl class="stats"><div><dt>Candidates</dt><dd>${total}</dd></div><div><dt>Ready</dt><dd>${ready}</dd></div><div><dt>Admissible</dt><dd>${admit}</dd></div></dl>
<table class="score"><tbody>${lines.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

function pageHtml(ordered: Candidate[]): string {
  const sourceIds = [...new Set(candidates.map((c) => c.modelledOn))].sort();
  const skills = [...new Set(candidates.map((c) => c.skill))].sort((a, b) => skillName(a).localeCompare(skillName(b)));
  const groupHeads = sourceIds
    .map((s) => `<h2 class="group-head" id="group-${esc(s)}" data-source="${esc(s)}" hidden>Modelled on ${esc(sourceLabel(s))}</h2>`)
    .join('\n');
  const generated = new Date().toISOString().slice(0, 10);
  const families = needReview.length;
  const lede =
    families > 0
      ? `${families} families of authored questions are waiting for you: each grows past four variants and none of its new questions has been reviewed. A review is not required before they join the app, but it is the only check of whether a family reads alike. The default view, <strong>One per family</strong>, shows one waiting question from each.`
      : `No family is waiting for your review. All ${candidates.length} waiting questions are below.`;
  return `<title>Margins Candidate Review</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
<style>${CSS}</style>
<div class="page">
<header class="intro">
<h1>Candidate review</h1>
<p class="lede">${lede}</p>
<p>Tap an option to answer; the right answer, the shortcut and the worked solution appear after. Then mark the question <strong>Reads real</strong>, <strong>Something off</strong> or <strong>Reject</strong>, with a one-line note when something is off. Marks stay in this browser and are the same in every view.</p>
<p>When you are done, press <strong>Copy my notes</strong> and paste the block back to Claude: a question marked Something off or Reject is held back.</p>
<p class="meta">Each question is modelled on one booklet question: same structure, exhibit, difficulty and traps, with a new company, wording and numbers. All ${candidates.length} waiting questions are under View, with filters and a grouping by source.</p>
<details class="scorecard"><summary><span class="label">Eval scorecard</span></summary>${scorecardHtml()}<p class="meta">Generated ${generated} from evals/report/candidates.json. A candidate is ready when every gate but the blind solve passes and it has no fidelity or variety finding; admissible when, in addition, the blind solve agrees and all four judges pass it.</p></details>
<section class="controls" aria-label="Filters">
<div class="control"><label class="label" for="view">View</label><select id="view">${families > 0 ? `<option value="family" selected>One per family (${families})</option>` : ''}<option value="all">All questions (${candidates.length})</option></select></div>
<div class="control"><label class="label" for="filter-show">Show</label><select id="filter-show"><option value="all">All questions</option><option value="unmarked">Not marked yet</option><option value="flagged">Marked off or reject</option><option value="failed">Failed any check</option></select></div>
<div class="control"><label class="label" for="filter-skill">Skill</label><select id="filter-skill"><option value="all">All skills</option>${skills.map((s) => `<option value="${esc(s)}">${esc(skillName(s))}</option>`).join('')}</select></div>
<div class="control"><label class="label" for="order">Order</label><select id="order"><option value="mixed">Mixed</option><option value="source">Grouped by source</option></select></div>
</section>
</header>
<div class="bar" role="region" aria-label="Progress">
<p class="bar-count" id="count" aria-live="polite" data-families="${families}"><span class="bar-main" id="count-main">${families > 0 ? `0 of ${families} families reviewed` : `Marked 0 of ${candidates.length}`}</span><span class="bar-sub" id="count-sub"></span></p>
<button type="button" class="primary" id="copy">Copy my notes</button>
</div>
<div class="copy-panel" id="copy-panel" hidden>
<p id="copy-status" role="status"></p>
<div id="copy-fallback" hidden><label class="label" for="copy-text">Your notes as JSON: select all and copy</label><textarea id="copy-text" rows="8" readonly></textarea></div>
</div>
<p class="meta showing" id="showing"></p>
<main id="list">
${groupHeads}
${ordered.map(candidateHtml).join('\n')}
</main>
<p class="meta empty" id="empty" hidden>No questions match these filters.</p>
</div>
<script>${SCRIPT}</script>
`;
}

// ---------- Style: one token block, everything derived from it ----------

const CSS = `
:root {
  --bg: #ffffff;
  --surface: #f6f5f1;
  --rule: #cfcdc5;
  --text: #121110;
  --muted: #5d5a52;
  --lit: #ffb800;
  --good: #23703f;
  --warn: #8a5800;
  --bad: #c2261a;
  --on-lit: var(--text);
  --lit-edge: var(--text);
  --word: 'Hanken Grotesk', 'Hanken Grotesk Variable', 'Avenir Next', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --num: 'Big Shoulders Display', 'Big Shoulders Variable', 'Arial Narrow', 'Helvetica Neue', sans-serif;
  --radius: 3px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #12100b;
    --surface: #1d1a12;
    --rule: #3d3727;
    --text: #f7f5ef;
    --muted: #aaa392;
    --lit: #ffbe1a;
    --good: #7cc795;
    --warn: #ffbe1a;
    --bad: #ff6b5b;
    --on-lit: var(--bg);
    --lit-edge: var(--lit);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #12100b;
  --surface: #1d1a12;
  --rule: #3d3727;
  --text: #f7f5ef;
  --muted: #aaa392;
  --lit: #ffbe1a;
  --good: #7cc795;
  --warn: #ffbe1a;
  --bad: #ff6b5b;
  --on-lit: var(--bg);
  --lit-edge: var(--lit);
  color-scheme: dark;
}
:root {
  --chart-1: var(--lit);
  --chart-1-ink: var(--on-lit);
  --chart-1-edge: var(--lit-edge);
  --chart-1-line: var(--warn);
  --chart-2: var(--text);
  --chart-3: color-mix(in srgb, var(--text) 68%, var(--bg));
  --chart-4: color-mix(in srgb, var(--text) 42%, var(--bg));
  --chart-grid: var(--rule);
  --chart-grid-strong: color-mix(in srgb, var(--text) 45%, var(--bg));
  --right-wash: color-mix(in srgb, var(--lit) 30%, var(--bg));
  --wrong-wash: color-mix(in srgb, var(--bad) 10%, var(--bg));
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--word); font-size: 17px; line-height: 1.5; font-variant-numeric: tabular-nums; -webkit-text-size-adjust: 100%; }
.page { max-width: 752px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 96px; }
h1, h2, p, ul, ol, dl, dd, figure { margin: 0; }
h1 { font-family: var(--num); font-weight: 800; font-size: 34px; line-height: 1.05; letter-spacing: 0.02em; text-transform: uppercase; }
.intro { display: grid; gap: 12px; padding-bottom: 20px; }
.intro p { max-width: 65ch; }
.lede { font-size: 19px; }
code { font-size: 0.9em; }
.label { font-family: var(--word); font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.meta { font-size: 14px; color: var(--muted); }
.scorecard { padding-top: 12px; border-top: 1px solid var(--rule); margin-top: 8px; }
.scorecard summary { cursor: pointer; min-height: 32px; }
.scorecard > :not(summary) { margin-top: 12px; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.stats div { min-width: 0; }
.stats dt { font-size: 14px; color: var(--muted); }
.stats dd { font-family: var(--num); font-weight: 800; font-size: 40px; line-height: 1; }
.score { width: 100%; border-collapse: collapse; font-size: 15px; }
.score th, .score td { padding: 6px 0; border-bottom: 1px solid var(--rule); text-align: left; font-weight: 400; vertical-align: top; }
.score td { text-align: right; padding-left: 12px; white-space: nowrap; }
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding-top: 16px; border-top: 1px solid var(--rule); margin-top: 8px; }
.control { display: grid; gap: 4px; min-width: 0; }
select, input[type="text"], textarea { font: inherit; font-size: 16px; color: var(--text); background: var(--bg); border: 1px solid var(--rule); border-radius: var(--radius); padding: 10px 12px; min-height: 44px; width: 100%; min-width: 0; }
textarea { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 13px; line-height: 1.4; resize: vertical; }
button { font: inherit; color: inherit; cursor: pointer; touch-action: manipulation; }
:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; background: var(--bg); border-block: 1px solid var(--rule); }
.bar-count { min-width: 0; font-size: 15px; line-height: 1.3; }
.bar-main { display: block; font-weight: 700; }
.bar-sub { display: block; font-size: 13px; color: var(--muted); }
.q-new { display: grid; gap: 4px; padding: 10px 12px; border-left: 3px solid var(--lit-edge); background: var(--surface); border-radius: var(--radius); max-width: 65ch; font-size: 15px; }
.q-new .label { margin-right: 6px; }
.keyed { gap: 8px; border-left: 3px solid var(--lit-edge); }
.slips { padding-left: 1.25em; display: grid; gap: 4px; }
.slip-lands { color: var(--muted); }
.primary { flex: none; min-height: 44px; padding: 8px 16px; border: 1px solid var(--lit-edge); border-radius: var(--radius); background: var(--lit); color: var(--on-lit); font-weight: 700; box-shadow: 0 3px 0 var(--lit-edge); }
.primary:active { transform: translateY(3px); box-shadow: none; }
.quiet { min-height: 44px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: var(--radius); background: transparent; color: var(--text); font-size: 15px; }
.quiet:active { background: var(--surface); }
.copy-panel { display: grid; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--rule); }
#copy-fallback { display: grid; gap: 6px; }
#copy-fallback[hidden] { display: none; }
.showing { padding-top: 12px; }
.group-head { font-family: var(--num); font-weight: 800; font-size: 24px; line-height: 1.1; text-transform: uppercase; letter-spacing: 0.02em; padding-top: 32px; }
.q { display: grid; gap: 16px; padding: 28px 0 32px; border-bottom: 1px solid var(--rule); min-width: 0; }
.q[hidden], .group-head[hidden] { display: none; }
.q-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 14px; color: var(--muted); }
.q-id { color: var(--text); font-weight: 600; }
.case { display: grid; gap: 16px; min-width: 0; }
.case-para, .case-list, .case-prompt { max-width: 65ch; }
.case-list { padding-left: 1.25em; display: grid; gap: 4px; }
.case-prompt { font-weight: 600; font-size: 18px; }
.table-wrap { display: grid; gap: 8px; min-width: 0; }
.table-title { font-weight: 700; }
.table-scroll { overflow-x: auto; overscroll-behavior-x: contain; min-width: 0; }
.table { min-width: 100%; border-collapse: collapse; font-size: 16px; white-space: nowrap; }
.table th, .table td { padding: 8px 12px; border-bottom: 1px solid var(--rule); text-align: left; }
.table thead th { white-space: normal; vertical-align: bottom; background: var(--surface); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.table tbody th { padding-left: 0; font-weight: 500; white-space: normal; min-width: 7em; }
.table thead th:first-child { padding-left: 8px; }
.table td { font-weight: 600; }
.table .num { text-align: right; }
.figure { display: grid; gap: 8px; min-width: 0; }
.figure-title { font-weight: 700; }
.figure-note { font-size: 14px; color: var(--muted); }
.chart { min-width: 0; }
.chart-unit { font-size: 13px; color: var(--muted); }
.chart-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 14px; }
.chart-legend li { display: inline-flex; align-items: center; gap: 8px; }
.chart-swatch { flex: none; }
.chart-canvas { margin-top: 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; min-width: 0; }
.chart-canvas svg { display: block; font-family: var(--word); font-size: 12px; font-weight: 450; stroke-width: 1; font-variant-numeric: tabular-nums; }
.chart-canvas polyline { stroke-linejoin: round; }
.rule-grid, .rule-grid-strong, .rule-base, .rule-knock, .rule-reference, .rule-connector { shape-rendering: crispEdges; }
.chart-wide { display: none; }
@media (min-width: 720px) { .chart-narrow { display: none; } .chart-wide { display: block; } }
.paint-accent { fill: var(--chart-1); stroke: var(--chart-1-edge); }
.paint-light { fill: var(--chart-2); }
.paint-mid { fill: var(--chart-3); }
.paint-dark { fill: var(--chart-4); }
.paint-hatch-ground { fill: var(--bg); }
.paint-hatch-line { stroke: var(--chart-2); }
.paint-hatch { stroke: var(--chart-2); stroke-width: 1; }
.paint-accent-hatch-ground { fill: var(--chart-1); }
.paint-accent-hatch-line { stroke: var(--chart-1-ink); }
.paint-accent-hatch { stroke: var(--chart-1-edge); stroke-width: 1; }
.chart-slice, .chart-marker { stroke: var(--bg); }
.chart-slice.paint-accent { stroke: var(--chart-1-edge); }
.chart-marker.paint-accent { fill: var(--chart-1-line); }
.stroke-accent { stroke: var(--chart-1-line); }
.stroke-light { stroke: var(--chart-2); }
.stroke-mid { stroke: var(--chart-3); }
.stroke-dark { stroke: var(--chart-4); }
.rule-grid { stroke: var(--chart-grid); }
.rule-grid-strong { stroke: var(--chart-grid-strong); }
.rule-base, .rule-leader, .rule-reference, .rule-connector { stroke: var(--muted); }
.rule-knock { stroke: var(--bg); opacity: 0.7; }
.ink-text, .ink-on-dark { fill: var(--text); }
.ink-muted { fill: var(--muted); }
.ink-on-light { fill: var(--bg); }
.ink-on-accent { fill: var(--chart-1-ink); }
.ink-halo { fill: var(--text); stroke: var(--bg); paint-order: stroke; stroke-linejoin: round; }
.options { display: grid; gap: 8px; }
.opt { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 12px; width: 100%; min-height: 52px; padding: 10px 12px; text-align: left; font-size: 17px; border: 1px solid var(--rule); border-radius: var(--radius); background: var(--surface); box-shadow: 0 2px 0 var(--rule); }
.opt:active { transform: translateY(2px); box-shadow: none; }
.opt-key { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--rule); border-radius: var(--radius); font-weight: 700; font-size: 15px; background: var(--bg); }
.opt-text { min-width: 0; overflow-wrap: anywhere; }
.opt-tag { grid-column: 2; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.q.is-answered .opt { cursor: default; box-shadow: none; transform: none; }
.q.is-answered .opt:not(.is-right):not(.is-wrong) { color: var(--muted); }
.opt.is-right { background: var(--right-wash); border-color: var(--text); color: var(--text); }
.opt.is-right .opt-key { background: var(--lit); color: var(--on-lit); border-color: var(--lit-edge); }
.opt.is-wrong { background: var(--wrong-wash); border-color: var(--bad); }
.opt.is-wrong .opt-text { text-decoration: line-through; text-decoration-color: var(--bad); }
.opt.is-wrong .opt-tag { color: var(--bad); }
.answer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.answer-actions [hidden] { display: none; }
.feedback { display: grid; gap: 10px; }
.feedback[hidden] { display: none; }
.verdict { font-size: 18px; }
.verdict strong { font-family: var(--num); font-weight: 800; font-size: 24px; text-transform: uppercase; letter-spacing: 0.02em; margin-right: 8px; }
.callout { display: grid; gap: 4px; padding: 12px 14px; background: var(--surface); border-radius: var(--radius); }
.steps { padding-left: 1.5em; display: grid; gap: 4px; }
.checks { border-top: 1px solid var(--rule); padding-top: 10px; }
.checks summary { cursor: pointer; min-height: 32px; font-size: 15px; }
.checks-summary { color: var(--muted); }
.checks-summary.is-failed { color: var(--text); }
.checks-verdict { margin: 10px 0 6px; }
.checks-list { list-style: none; padding: 0; display: grid; gap: 6px; font-size: 15px; }
.checks-list > li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
.check-name { min-width: 10em; }
.why { flex-basis: 100%; color: var(--muted); font-size: 14px; padding-left: 0; list-style: none; overflow-wrap: anywhere; }
.tag { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; padding: 1px 8px; border: 1px solid currentColor; border-radius: var(--radius); }
.tag-good { color: var(--good); }
.tag-warn { color: var(--warn); }
.tag-bad { color: var(--bad); }
.tag-none { color: var(--muted); border-style: dashed; }
.review { display: grid; gap: 8px; margin: 0; padding: 14px; border: 1px solid var(--rule); border-radius: var(--radius); min-width: 0; }
.review legend { padding: 0 6px; }
.marks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.mark-input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.mark-label { display: grid; place-items: center; min-height: 44px; padding: 6px 8px; text-align: center; font-size: 15px; line-height: 1.2; border: 1px solid var(--rule); border-radius: var(--radius); cursor: pointer; touch-action: manipulation; }
.mark-input:checked + .mark-label { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 700; }
.mark-input:focus-visible + .mark-label { outline: 2px solid var(--text); outline-offset: 2px; }
.note-label { font-size: 14px; color: var(--muted); }
.empty { padding-top: 24px; }
@media (prefers-reduced-motion: no-preference) {
  .opt, .primary, .mark-label { transition: background-color 120ms ease-out, transform 80ms ease-out; }
}
@media (prefers-reduced-motion: reduce) {
  .opt:active, .primary:active { transform: none; }
}
`;

// ---------- Behaviour ----------

const SCRIPT = `
(function () {
  var KEY = 'margins-candidate-review-v1';
  var LETTERS = ['A', 'B', 'C', 'D', 'E'];
  var state = {};
  try {
    var saved = window.localStorage.getItem(KEY);
    if (saved) state = JSON.parse(saved) || {};
  } catch (e) { state = {}; }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function entry(id) { return state[id] || (state[id] = {}); }

  var cards = Array.prototype.slice.call(document.querySelectorAll('.q'));
  var mixed = cards.slice();
  var list = document.getElementById('list');
  var total = cards.length;

  function showAnswer(card, chosen) {
    var id = card.dataset.id;
    var correct = Number(card.dataset.correct);
    var opts = card.querySelectorAll('.opt');
    card.classList.add('is-answered');
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var t = o.querySelector('.opt-tag');
      o.classList.remove('is-right', 'is-wrong');
      t.hidden = true;
      t.textContent = '';
      if (i === correct) {
        o.classList.add('is-right');
        t.textContent = chosen === i ? 'Right answer, your answer' : 'Right answer';
        t.hidden = false;
      } else if (i === chosen) {
        o.classList.add('is-wrong');
        t.textContent = 'Your answer';
        t.hidden = false;
      }
      o.setAttribute('aria-pressed', i === chosen ? 'true' : 'false');
    }
    var text = opts[correct] ? opts[correct].querySelector('.opt-text').textContent : '';
    var word = chosen === null ? 'Answer' : chosen === correct ? 'Right' : 'Not quite';
    var verdict = card.querySelector('.verdict');
    verdict.textContent = '';
    var strong = document.createElement('strong');
    strong.textContent = word;
    verdict.appendChild(strong);
    verdict.appendChild(document.createTextNode(' ' + (chosen !== null && chosen !== correct ? 'You chose ' + LETTERS[chosen] + '. ' : '') + 'Answer ' + LETTERS[correct] + ': ' + text));
    document.getElementById('feedback-' + id).hidden = false;
    document.getElementById('show-' + id).hidden = true;
    document.getElementById('clear-' + id).hidden = false;
  }
  function clearAnswer(card) {
    var id = card.dataset.id;
    card.classList.remove('is-answered');
    var opts = card.querySelectorAll('.opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.remove('is-right', 'is-wrong');
      opts[i].removeAttribute('aria-pressed');
      var t = opts[i].querySelector('.opt-tag');
      t.hidden = true;
      t.textContent = '';
    }
    document.getElementById('feedback-' + id).hidden = true;
    document.getElementById('show-' + id).hidden = false;
    document.getElementById('clear-' + id).hidden = true;
  }

  function markOf(id) { return state[id] && state[id].mark ? state[id].mark : null; }

  var families = Number(document.getElementById('count').dataset.families) || 0;

  function updateCount() {
    var counts = { real: 0, off: 0, reject: 0 };
    var marked = 0;
    var reviewed = {};
    cards.forEach(function (c) {
      var m = markOf(c.dataset.id);
      if (m && counts.hasOwnProperty(m)) {
        counts[m]++;
        marked++;
        // A family needing review counts as reviewed once any of its waiting variants is marked, in either view.
        if (c.dataset.needs === '1') reviewed[c.dataset.source] = true;
      }
    });
    var sub = 'Marked ' + marked + ' of ' + total + ' · real ' + counts.real + ' · off ' + counts.off + ' · reject ' + counts.reject;
    if (families > 0) {
      document.getElementById('count-main').textContent = Object.keys(reviewed).length + ' of ' + families + ' families reviewed';
      document.getElementById('count-sub').textContent = sub;
    } else {
      document.getElementById('count-main').textContent = sub;
    }
  }

  var viewSel = document.getElementById('view');
  var showSel = document.getElementById('filter-show');
  var skillSel = document.getElementById('filter-skill');
  var orderSel = document.getElementById('order');

  function applyFilters() {
    var view = viewSel.value;
    var show = showSel.value;
    var skill = skillSel.value;
    var shown = 0;
    var inView = 0;
    var visibleSources = {};
    cards.forEach(function (c) {
      var m = markOf(c.dataset.id);
      var viewed = view === 'all' || c.dataset.pick === '1';
      if (viewed) inView++;
      var ok = viewed && (skill === 'all' || c.dataset.skill === skill) &&
        (show === 'all' ||
          (show === 'unmarked' && !m) ||
          (show === 'flagged' && (m === 'off' || m === 'reject')) ||
          (show === 'failed' && c.dataset.failed === '1'));
      c.hidden = !ok;
      if (ok) { shown++; visibleSources[c.dataset.source] = true; }
    });
    var grouped = orderSel.value === 'source';
    Array.prototype.forEach.call(document.querySelectorAll('.group-head'), function (h) {
      h.hidden = !grouped || !visibleSources[h.dataset.source];
    });
    document.getElementById('showing').textContent = 'Showing ' + shown + ' of ' + inView + (view === 'family' ? ', one per family' : '');
    document.getElementById('empty').hidden = shown !== 0;
  }

  function applyOrder() {
    var grouped = orderSel.value === 'source';
    if (grouped) {
      var heads = Array.prototype.slice.call(document.querySelectorAll('.group-head'));
      heads.forEach(function (h) {
        list.appendChild(h);
        cards.filter(function (c) { return c.dataset.source === h.dataset.source; })
          .sort(function (a, b) { return a.dataset.id < b.dataset.id ? -1 : 1; })
          .forEach(function (c) { list.appendChild(c); });
      });
    } else {
      mixed.forEach(function (c) { list.appendChild(c); });
    }
    applyFilters();
  }

  cards.forEach(function (card) {
    var id = card.dataset.id;
    var s = state[id] || {};
    var opts = card.querySelectorAll('.opt');
    Array.prototype.forEach.call(opts, function (o) {
      o.addEventListener('click', function () {
        if (card.classList.contains('is-answered')) return;
        var i = Number(o.dataset.i);
        entry(id).answer = i;
        save();
        showAnswer(card, i);
      });
    });
    document.getElementById('show-' + id).addEventListener('click', function () {
      entry(id).answer = 'shown';
      save();
      showAnswer(card, null);
    });
    document.getElementById('clear-' + id).addEventListener('click', function () {
      delete entry(id).answer;
      save();
      clearAnswer(card);
      if (opts[0]) opts[0].focus();
    });
    Array.prototype.forEach.call(card.querySelectorAll('.mark-input'), function (r) {
      if (s.mark === r.value) r.checked = true;
      r.addEventListener('change', function () {
        if (!r.checked) return;
        entry(id).mark = r.value;
        save();
        updateCount();
      });
    });
    var note = document.getElementById('note-' + id);
    if (s.note) note.value = s.note;
    note.addEventListener('input', function () {
      entry(id).note = note.value;
      save();
    });
    if (typeof s.answer === 'number') showAnswer(card, s.answer);
    else if (s.answer === 'shown') showAnswer(card, null);
  });

  viewSel.addEventListener('change', applyFilters);
  showSel.addEventListener('change', applyFilters);
  skillSel.addEventListener('change', applyFilters);
  orderSel.addEventListener('change', applyOrder);

  function notesJson() {
    var out = [];
    cards.forEach(function (c) {
      var id = c.dataset.id;
      var s = state[id];
      if (!s || !s.mark) return;
      var item = { id: id, judge: 'owner', fail: s.mark !== 'real', why: (s.note || '').trim(), mark: s.mark };
      if (c.dataset.fp) item.fingerprint = c.dataset.fp;
      out.push(item);
    });
    out.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    return out;
  }

  var copyBtn = document.getElementById('copy');
  var panel = document.getElementById('copy-panel');
  var status = document.getElementById('copy-status');
  var fallback = document.getElementById('copy-fallback');
  var area = document.getElementById('copy-text');
  function showFallback(text, why) {
    panel.hidden = false;
    status.textContent = why;
    area.value = text;
    fallback.hidden = false;
    area.focus();
    area.select();
  }
  copyBtn.addEventListener('click', function () {
    var notes = notesJson();
    var text = JSON.stringify(notes, null, 1);
    var said = notes.length === 0 ? 'No marks yet, so the list is empty.' : 'Copied ' + notes.length + ' marked question' + (notes.length === 1 ? '' : 's') + '. Paste them to Claude.';
    fallback.hidden = true;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        panel.hidden = false;
        status.textContent = said;
      }, function () {
        showFallback(text, 'Could not copy automatically. Select the text below and copy it.');
      });
    } else {
      showFallback(text, 'Copying is not available here. Select the text below and copy it.');
    }
  });

  updateCount();
  applyFilters();
})();
`;

// ---------- Privacy: nothing of the booklets on the published page ----------

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * What of the booklets a piece of text carries, by the originality gate's own rule (src/engine/question/authored-verify.ts),
 * so that what the page would withhold, the gate has already failed: every booklet name, case title and test-maker's
 * name (`bookletNamesIn`), every eight-word run of a booklet question or a redrawn exhibit (titles, unit lines, notes,
 * labels; stock stems left out), and every whole booklet sentence or title of fewer than eight words that is not generic
 * (`bookletWording`). Empty when nothing.
 */
function bookletMatches(text: string): string[] {
  return [
    ...bookletNamesIn(text, bookletIndex).map((n) => `booklet name "${n}"`),
    ...bookletWording(text, bookletIndex).map((m) =>
      m.kind === 'phrase' ? `eight words shared with ${m.id}: "${m.words}"` : `whole booklet title or sentence (${m.id}): "${m.text}"`,
    ),
  ];
}

const WITHHELD = '[wording withheld: it matches booklet text]';
/** Candidate wording withheld from the page because it matches booklet text: id, the wording, and what it matched. */
const withheld: Array<{ id: string; text: string; why: string[] }> = [];

/**
 * A candidate as the page shows it: any string of its own (context, chart and table text, prompt, options, solution,
 * shortcut, trap slips) that carries booklet text is replaced by a visible marker. The fingerprint the owner's verdict
 * carries is still taken from the candidate itself. The writer should reword such a string; until then the page withholds it.
 */
function shown(c: Candidate): Candidate {
  const scrub = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const why = bookletMatches(v);
      if (why.length === 0) return v;
      withheld.push({ id: c.id, text: v, why });
      return WITHHELD;
    }
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
    return v;
  };
  // Only what the page shows: the calculation check and the like stay out of it. Trap slips show for moved-claim variants.
  return {
    ...c,
    context: scrub(c.context) as Candidate['context'],
    prompt: scrub(c.prompt) as string,
    options: scrub(c.options) as string[],
    solution: scrub(c.solution) as string[],
    shortcut: scrub(c.shortcut) as string,
    ...(c.traps && movedClaim(c) ? { traps: scrub(c.traps) as NonNullable<Candidate['traps']> } : {}),
  };
}

/** Each piece of a candidate's own text, by field: what a finding on the page is traced back to. */
function candidateTexts(c: Candidate): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const b of c.context) {
    if (b.type === 'paragraph') out.push(['context', b.text]);
    else if (b.type === 'list') for (const item of b.items) out.push(['context list', item]);
    else if (b.type === 'table') {
      if (b.title) out.push(['table title', b.title]);
      out.push(['table headers', b.headers.join(' ')]);
      for (const row of b.rows) out.push(['table row', row.join(' ')]);
    } else {
      out.push(['chart title', b.title], ['chart unit', b.unit]);
      if (b.note !== undefined) out.push(['chart note', b.note]);
    }
  }
  out.push(['prompt', c.prompt], ...c.options.map((o): [string, string] => ['option', o]), ...c.solution.map((s): [string, string] => ['solution', s]));
  if (c.shortcut) out.push(['shortcut', c.shortcut]);
  for (const t of c.traps ?? []) out.push(['trap slip', t.slip]);
  return out;
}

/** Where a finding sits: the candidate fields holding it, or the page's own wording when no candidate does. */
function holders(what: string): string {
  const at = candidates.flatMap((c) => candidateTexts(c).flatMap(([field, text]) => (bookletMatches(text).includes(what) ? [`${c.id} ${field}`] : [])));
  return at.length === 0 ? 'page text' : at.slice(0, 3).join(', ') + (at.length > 3 ? ` and ${at.length - 3} more` : '');
}

/**
 * The check on the finished page: the rules above over the whole page. Names and titles anywhere, markup included; wording
 * (eight-word runs, whole sentences and titles) within each block element and each attribute value, since a run across two
 * elements is not a sentence of the page.
 */
function privacyFindings(html: string): { counts: Record<string, number>; found: string[] } {
  const visible = html.replace(/<style>[\s\S]*?<\/style>/g, '\n').replace(/<script>[\s\S]*?<\/script>/g, '\n');
  const attributes = [...visible.matchAll(/="([^"]*)"/g)].map((m) => decode(m[1]!));
  const segments = [
    ...decode(visible.replace(/<\/?(strong|span|code|br)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '\n')).split('\n'),
    ...attributes,
  ];
  const wording = new Set(segments.flatMap((s) => bookletMatches(s).filter((m) => !m.startsWith('booklet name'))));
  const names = new Set(bookletNamesIn(decode(html), bookletIndex).map((n) => `booklet name "${n}"`));
  const found = [...wording, ...names].map((m) => `${m} (in ${holders(m)})`);
  return {
    counts: {
      'booklet, company, product and test-maker names': bookletIndex.names.size,
      'booklet names and case titles (full and without the bracket)': bookletIndex.titles.size,
      'eight-word runs of booklet questions and redrawn exhibits (stock stems left out)': bookletIndex.phrases.size,
      'whole booklet sentences and titles under eight words, not generic': bookletIndex.wholes.size,
      'eight-word runs on the page': new Set(phrases(segments)).size,
    },
    found,
  };
}

it('writes the owner review page', () => {
  const ordered = mixedOrder(candidates);
  for (let i = 1; i < ordered.length; i++) expect(ordered[i]!.modelledOn, `${ordered[i - 1]!.id} beside ${ordered[i]!.id}`).not.toBe(ordered[i - 1]!.modelledOn);
  // One pick per family needing review, each a waiting variant of that family.
  expect(picks.size).toBe(needReview.length);
  for (const id of picks) expect(needSources.has(candidates.find((c) => c.id === id)!.modelledOn), id).toBe(true);
  const html = pageHtml(ordered);
  // No booklet text, names, case titles or exhibit content on a page that is published.
  const privacy = privacyFindings(html);
  console.log(
    [
      `review.html: ${html.length} characters; ${candidates.length} questions; one per family: ${picks.size} families, ${[...picks].filter((id) => movedClaim(candidates.find((c) => c.id === id)!)).length} of them moved-claim variants.`,
      'Privacy, searched for:',
      ...Object.entries(privacy.counts).map(([k, v]) => `  ${k}: ${v}`),
      `Withheld from the page (candidate wording that matches booklet text): ${withheld.length}`,
      ...withheld.map((w) => `  ${w.id}: "${w.text.slice(0, 80)}" (${w.why.join('; ')})`),
      `Found on the finished page: ${privacy.found.length}`,
      ...privacy.found.map((f) => `  ${f}`),
    ].join('\n'),
  );
  expect(privacy.found).toEqual([]);
  // 217 questions with two drawings of every chart come to about 3 MB (100 came to 1.1 MB); the published limit is 16 MB.
  expect(html.length).toBeLessThan(6_000_000);
  mkdirSync(new URL('./report/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./report/review.html', import.meta.url), html);
});
