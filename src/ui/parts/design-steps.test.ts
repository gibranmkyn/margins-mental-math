import { describe, expect, it } from 'vitest';
import { THEME_CHROME } from '../theme';

/**
 * Guards the design system: every raw value lives in tokens.css, and the guide's colour table
 * matches it. If this fails, add or reuse a step in tokens.css instead of writing the value inline.
 */

const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const sheets = raw(import.meta.glob('../**/*.css', { query: '?raw', import: 'default', eager: true }));
const screens = raw(import.meta.glob('../screens/*.tsx', { query: '?raw', import: 'default', eager: true }));
const guide = Object.values(raw(import.meta.glob('/DESIGN.md', { query: '?raw', import: 'default', eager: true })))[0] ?? '';

const TOKENS = Object.entries(sheets).find(([path]) => path.endsWith('/tokens.css'))![1];

const RAW_VALUES: Array<[string, RegExp]> = [
  ['hex colour', /#[0-9a-f]{3,8}\b/i],
  ['rgb colour', /\brgba?\(/],
  ['px length', /\b\d+(\.\d+)?px\b/],
  ['duration', /\b\d+(\.\d+)?m?s\b/],
  ['easing curve', /cubic-bezier/],
  ['raw env() inset (use --inset-*)', /env\(/],
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The custom properties a rule block in tokens.css defines, by selector. */
function block(selector: string): Record<string, string> {
  const css = stripComments(TOKENS);
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));
}

/** Colour steps per theme. Dark is the first :root block (the default); light overrides it. */
const DARK = block(':root');
const LIGHT_OVERRIDES = block(":root[data-theme='light']");
const THEMES = { dark: DARK, light: { ...DARK, ...LIGHT_OVERRIDES } };

type Rgba = [number, number, number, number];
function colour(steps: Record<string, string>, value: string): Rgba {
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) return colour(steps, steps[alias[1]!]!);
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as Rgba;
  const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`not a colour: ${value}`);
}

/** A step's colour as seen on the page: washes are composited over --ink. */
function seen(steps: Record<string, string>, name: string, over = '--ink'): Rgba {
  const [r, g, b, a] = colour(steps, steps[name]!);
  if (a === 1) return [r, g, b, 1];
  const base = seen(steps, over);
  return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
}

const luminance = ([r, g, b]: Rgba) => {
  const [lr, lg, lb] = [r, g, b].map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
};
const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/**
 * What sits on what, and the WCAG 2.2 AA minimum: 4.5 for text, 3 for large text and meaningful graphics.
 * Applies to both themes; the accent is checked as text, as a fill under its ink and as a bar on a track.
 */
const PAIRINGS: Array<[fg: string, bg: string, min: number, where: string]> = [
  ['--text', '--ink', 4.5, 'body text on the page'],
  ['--text', '--panel', 4.5, 'body text on a sheet'],
  ['--text', '--raise', 4.5, 'the shortcut callout, pressed rows'],
  ['--muted', '--ink', 4.5, 'labels and meta on the page'],
  ['--muted', '--panel', 4.5, 'labels and meta on a sheet'],
  ['--muted', '--raise', 4.5, 'option letters on their key'],
  ['--faint', '--ink', 3, 'large text and glyphs'],
  ['--accent', '--ink', 4.5, 'the accent as text: XP, streak, hero score, option tag'],
  ['--accent', '--panel', 4.5, 'the accent as text on a sheet'],
  ['--accent', '--raise', 4.5, 'a pressed key turning the accent'],
  ['--accent-ink', '--accent', 4.5, 'legacy: text on an accent fill'],
  ['--lit-ink', '--lit', 4.5, 'text on a lit fill: primary button, stamp, seal, option key'],
  ['--lit-outline', '--bar', 3, 'the edge of lit segments against the empty ones'],
  ['--bar-neutral', '--bar', 3, 'neutral coverage on its bar'],
  ['--lit-outline', '--ink', 3, 'the edge of a lit fill against the page (ink outline in light, the fill itself in dark)'],
  ['--board-text', '--board', 4.5, 'words on the board'],
  ['--board-num', '--board', 4.5, 'lit numerals on the board'],
  ['--board-muted', '--board', 4.5, 'labels on the board'],
  ['--board-miss', '--board', 4.5, 'a miss on the board'],
  ['--sel-text', '--sel', 4.5, 'a chosen option'],
  ['--text', '--unlit', 3, 'the current tally mark beside unanswered ones'],
  ['--text', '--accent-wash', 4.5, 'the correct answer over its highlighter stroke'],
  ['--miss', '--ink', 4.5, 'a struck-through wrong entry'],
  ['--miss', '--panel', 4.5, 'a miss on a sheet'],
  ['--text', '--miss-wash', 4.5, 'a wrong option over its wash'],
  ['--ink', '--miss', 4.5, 'the wrong option’s letter on its key'],
  ['--ink', '--text', 4.5, 'a pressed chip, the chosen option’s key'],
  ['--chart-1-edge', '--ink', 3, 'the edge of the asked-about series against the page'],
  ['--chart-1-line', '--ink', 3, 'the asked-about series as a line'],
  ['--chart-2', '--ink', 3, 'chart series 2'],
  ['--chart-3', '--ink', 3, 'chart series 3'],
  ['--chart-4', '--ink', 3, 'chart series 4'],
  // Value labels inside bars and slices (src/ui/chart: on-light labels use --ink, on-dark use --text).
  ['--chart-1-ink', '--chart-1', 4.5, 'a label on the asked-about series'],
  ['--ink', '--chart-2', 4.5, 'a label on series 2'],
  ['--ink', '--chart-3', 4.5, 'a label on series 3'],
  ['--text', '--chart-4', 4.5, 'a label on series 4'],
];

describe('design steps', () => {
  it('finds the stylesheets and screens it guards', () => {
    expect(Object.keys(sheets).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(screens).length).toBeGreaterThanOrEqual(3);
    // Vitest blanks CSS unless `css: true` is set in vitest.config.ts; an empty sheet would pass vacuously.
    for (const css of Object.values(sheets)) expect(css.length).toBeGreaterThan(0);
  });

  for (const [path, css] of Object.entries(sheets)) {
    if (path.endsWith('/tokens.css')) continue;
    it(`${path} uses named steps only and reads device insets through tokens`, () => {
      const body = stripComments(css);
      for (const [what, pattern] of RAW_VALUES) {
        const hit = body.match(pattern);
        expect(hit?.[0], `${what} in ${path}: move it to tokens.css`).toBeUndefined();
      }
    });
  }

  for (const [path, source] of Object.entries(screens)) {
    it(`${path} has no inline colours or pixel sizes`, () => {
      expect(source.match(/#[0-9a-f]{6}\b|\b\d+px\b/i)?.[0]).toBeUndefined();
    });
  }

  for (const [path, source] of Object.entries(screens)) {
    it(`${path} never summons the system keyboard`, () => {
      expect(source.match(/<input|<textarea|contentEditable/i)?.[0], 'answers come from the on-screen Keypad').toBeUndefined();
    });
  }

  it('every colour step has a dark and a light value', () => {
    const colours = Object.keys(DARK).filter((name) => /^(#|rgb)/.test(DARK[name]!) || /^var\(--/.test(DARK[name]!));
    expect(colours.length).toBeGreaterThan(10);
    for (const name of colours) {
      // An alias (--chart-1: var(--accent)) follows its target into either theme.
      if (DARK[name]!.startsWith('var(')) continue;
      expect(LIGHT_OVERRIDES[name], `${name} needs a light value in :root[data-theme='light']`).toBeDefined();
    }
    for (const name of Object.keys(LIGHT_OVERRIDES)) expect(DARK[name], `${name} is light-only`).toBeDefined();
    expect(DARK['color-scheme']).toBeUndefined(); // declared, but not a custom property
    expect(stripComments(TOKENS)).toMatch(/:root\[data-theme='light'\] \{[^}]*color-scheme: light;/);
  });

  for (const [theme, steps] of Object.entries(THEMES)) {
    describe(`${theme} theme contrast`, () => {
      for (const [fg, bg, min, where] of PAIRINGS) {
        it(`${fg} on ${bg} is at least ${min}:1 (${where})`, () => {
          const ratio = contrast(seen(steps, fg), seen(steps, bg));
          expect(Number(ratio.toFixed(2)), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
        });
      }
    });

    it(`${theme} browser chrome uses the ${theme} page colour`, () => {
      expect(THEME_CHROME[theme as keyof typeof THEME_CHROME].themeColor.toLowerCase()).toBe(steps['--ink']!.toLowerCase());
    });
  }

  // A meter must never read backwards: what is filled stands out from the page more than what is empty.
  for (const [theme, steps] of Object.entries(THEMES)) {
    it(`${theme} meters: filled segments contrast with the page more than empty ones`, () => {
      const page = seen(steps, '--ink');
      const empty = contrast(seen(steps, '--bar'), page);
      const lit = Math.max(contrast(seen(steps, '--lit'), page), contrast(seen(steps, '--lit-outline'), page));
      const neutral = contrast(seen(steps, '--bar-neutral'), page);
      expect(lit, `${theme}: lit fill against the page`).toBeGreaterThan(empty * 2);
      expect(neutral, `${theme}: neutral fill against the page`).toBeGreaterThan(empty * 2);
      expect(lit, `${theme}: lit fill is a meaningful graphic`).toBeGreaterThanOrEqual(3);
      expect(neutral, `${theme}: neutral fill is a meaningful graphic`).toBeGreaterThanOrEqual(3);
      // The same holds for the tally: a hit against an unanswered mark.
      expect(lit).toBeGreaterThan(contrast(seen(steps, '--unlit'), page) * 2);
    });
  }

  it('DESIGN.md light colours match tokens.css', () => {
    const block = guide.match(/^colors-light:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
    const listed = [...block.matchAll(/^ {2}([\w-]+): "(#[0-9a-f]{6})"/gim)];
    expect(listed.length).toBeGreaterThan(5);
    for (const [, name, value] of listed) {
      expect(LIGHT_OVERRIDES[`--${name}`]?.toLowerCase(), `light --${name}`).toBe(value!.toLowerCase());
    }
  });

  it('DESIGN.md colours match tokens.css', () => {
    const block = guide.match(/^colors:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
    const listed = [...block.matchAll(/^ {2}([\w-]+): "(#[0-9a-f]{6})"/gim)];
    expect(listed.length).toBeGreaterThan(5);
    for (const [, name, value] of listed) {
      const defined = TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
      expect(defined?.toLowerCase(), `--${name}`).toBe(value!.toLowerCase());
    }
  });
});
