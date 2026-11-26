---
name: Margins
description: Case math, daily. A scoreboard: black board, lit numerals, one amber.
colors:
  ink: "#12100b"
  panel: "#1a1710"
  raise: "#262218"
  line: "#3d3727"
  text: "#f7f5ef"
  muted: "#aaa392"
  faint: "#7f7969"
  accent: "#ffbe1a"
  miss: "#ff6b5b"
  board: "#070604"
  board-num: "#ffbe1a"
  lit: "#ffbe1a"
  lit-ink: "#15120a"
  lit-edge: "#9a6f00"
colors-light:
  ink: "#ffffff"
  panel: "#f6f5f1"
  raise: "#eceae4"
  line: "#cfcdc5"
  text: "#121110"
  muted: "#5d5a52"
  faint: "#8a877d"
  accent: "#121110"
  miss: "#c2261a"
  board: "#121110"
  board-num: "#ffbe1a"
  lit: "#ffb800"
  lit-ink: "#121110"
  lit-edge: "#121110"
typography:
  numerals:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontWeight: 800
    fontFeature: "tnum"
  words:
    fontFamily: "Hanken Grotesk Variable, Avenir Next, system-ui, sans-serif"
  label:
    fontFamily: "Big Shoulders Variable"
    fontSize: "0.9375rem"
    letterSpacing: "0.08em"
rounded:
  tile: "3px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
  "8": "48px"
---

# Design System: Margins

Read this before adding or changing a screen. Values live in `src/ui/parts/tokens.css`; parts live in `src/ui/parts/`. See every part in every state and both themes with `npm run dev`, then open `/specimen.html`.

**Design target: the owner's iPhone 14 Pro** (393×852, Dynamic Island, safe area 59px top and 34px bottom), in Safari (393×660 visible) and installed standalone. It must feel perfect there. 320×568 and 375×667 are floor checks: nothing may break or hide.

## 1. The idea: "Scoreboard"

Margins looks like a match-day scoreboard and the results column of a sports page. Numbers are set very large in a condensed, heavy numeral face. The number that matters right now (what you are typing, your score) is **lit amber on a black board band**. Controls are tiles that press down. There is one accent, amber, and one colour for misses.

Signature details, in order of importance:
1. **The board.** A full-width black band carrying lit amber numerals. It is black in both themes, so the typed answer looks the same at noon and at midnight.
2. **The numeral face.** Big Shoulders, heavy, for every figure of 20px and up and for uppercase labels and titles.
3. **Segments.** Progress bars, the pace bar and the tally are rows of segments that light up, like an LED strip. Filled segments are always the strong ones: amber on a dark strip in dark; amber with an ink edge on pale empty segments in light (ink for neutral coverage). A test checks a meter can never read backwards.
4. **Tiles that press.** Keys, options and the primary button sit on a hard ledge and move down into it. No soft shadows.

## 2. Colour

Three families (see the head of `tokens.css`):

| Family | Steps | What it is |
|---|---|---|
| Page | `--ink` `--panel` `--raise` `--line` `--text` `--muted` `--faint` | The surface and what is written on it |
| Board | `--board` `--board-text` `--board-num` `--board-muted` `--board-miss` | The black band; identical in both themes |
| Lit | `--lit` `--lit-ink` `--lit-edge` `--lit-outline` `--unlit` `--bar` | Amber as a **fill**: the one action, hits, progress, seals |

`--accent` is amber as **text or a line on the page** (XP earned, focus ring, selection outline). `--miss` is for wrong answers only.

**Dark** (default when the phone is dark): a floodlit board at night. Page neutrals are near-black tinted toward the amber; amber is both text and fill.

**Light**: the results page. True white, black bands, grey tiles with ink ledges. Amber cannot be read on white, so on the page `--accent` becomes ink and every lit fill gets an ink outline. Amber text only ever appears on the board.

Rules:
- **Fill with `--lit`, write with `--accent`.** Never `background: var(--accent)`, never `color: var(--lit)` on the page.
- **One lit button per screen.** Amber means "do this" or "you did it". Never decoration, never an inactive state.
- **Red is a wrong answer and nothing else**: not warnings, low time or destructive actions. On the board use `--board-miss`.
- **Right and wrong are shown twice**: colour plus a tag, strike-through or shape.
- **Charts**: `--chart-1` (amber) marks the series the question asks about. In light it is true amber with an ink edge (`--chart-1-edge`) and ink labels (`--chart-1-ink`), like every lit fill; a thin line or marker cannot carry an edge, so lines use `--chart-1-line` (deep amber in light). `--chart-2` to `--chart-4` are neutrals. Four series at most; label bars and lines directly. Series never differ by colour alone: fills step through tones with hatching for a fourth, lines take dashes and marker shapes, and any key draws each entry exactly as its series. Charts read by estimate use `--chart-grid-strong`, with `--chart-knock` cutting the gridlines through the bars. Cumulative bars join each top to the next bar with a dotted connector. Waterfalls run across, one row per bar: totals in `--chart-2`, increases in `--chart-3`, decreases hatched, every step printed with its sign, and a key for the two kinds of step; the asked-about bar is keyed by its name, and as a decrease it stays hatched (ink lines on the accent). Booklet exhibits keep their original form: scatters plot named points with square markers and dashed reference lines, each name kept inside the plot and off the reference lines (a joined scatter draws a curve or a step line); a second measure reads off a right-hand axis; bars may run across, with negative parts stacking left or down from zero; figures printed above the bars sit in named rows; a printed figure is never smaller than 12px (too big for its part, it moves beside or under it, on its own side of the zero line, which is drawn as the base line), and an empty part prints nothing; brackets under the axis group runs of bars (each group in its own tone, keyed); a 100% stack whose figures are amounts draws them as shares of each bar but prints the amounts. Crowded category names step every second one down a row rather than drop out (only long runs of numbers thin out); crowded side-by-side figures lift every second series a line higher.
- Contrast for every pairing the parts use is checked in both themes by `design-steps.test.ts` (WCAG AA). Add a pairing there when a part puts a step on a new ground.

The app follows the phone's appearance by default; the owner can pin light or dark (`src/ui/theme.ts`, stored, applied before first paint).

## 3. Type

| Role | Face | Step |
|---|---|---|
| Hero number (score, sprint count) | `--num` 900 | `--type-num-hero` |
| Drill prompt / typed answer | `--num` 800 | `--type-num-lg` / `--type-num-md` (the answer is at least as big as the prompt) |
| Titles, verdict, button labels | `--num` 800-900, uppercase, `--tracking-caps` | `--type-xl` to `--type-3xl` |
| Figures in rows, tables, panel heads | `--num` 700 | `--type-num` |
| Label (`.label`): the one uppercase voice | `--num` 700, `--tracking-label`, muted | `--type-label` |
| Body, scenarios, steps, option sentences | `--word` | `--type-md`, `--type-lg`; max 65ch |
| Meta (`.meta`) | `--word`, muted | `--type-sm` |

- **`--num` is never used below 20px.** Small figures (meta lines, chart text) are `--word` with tabular figures, which is on everywhere.
- Never tighten the numeral face (`--tracking-display` is the floor); it is already condensed.
- Section headings inside sheets are labels; page titles are uppercase numeral face. Body copy is sentence case.
- `--mono` and `--display` remain as legacy aliases of `--word`. Do not use them in new CSS.

## 4. Shape, depth, motion

- One radius: `--radius` (3px). Flat; depth is tone (`--ink` page, `--panel` sheet, `--raise` tile) and the **ledge**: a hard offset under the primary button (`--ledge`) and under tiles (`--ledge-key`) that the control presses into.
- No soft shadows, glows, glass, gradients as decoration, or side-stripe borders.
- Motion shows state only: presses `--dur-press`, state changes `--dur-quick`, sheets `--dur-base`, the score `--dur-slow`, exponential ease-out, no bounce. Decorative motion sits inside `prefers-reduced-motion: no-preference`. The pace bar is the one functional animation.

## 5. Parts

Import from `src/ui/parts`. Screens compose parts and never restyle them; if a part cannot do what a screen needs, extend the part.

| Part | Use it for | Notes |
|---|---|---|
| `Screen` | Every screen, outermost | `layout="page"` scrolls with its `actions` pinned at the bottom: the lit action and at most one row of alternatives (one button, or two outlined side by side as on Home); `layout="task"` fills the viewport (bar, stage, Dock) for answering |
| `ScreenBar` | Top of a task screen | `leading` Leave, `center` Tally or title, `trailing` count or Clock |
| `Dock` | Keypad, feedback sheet, a docked action | Full-bleed; `footer` holds the button; `sheet` scrolls its body above it |
| `Button` | Actions | `primary` is the lit button (one per screen, `arrow` when it moves you on); `secondary` a real alternative (disabled fades its label); `quiet` a way out; `destructive` on the confirming press of anything that erases: a heavy ink outline and a cross, never red |
| `Panel` | A ruled section with a head line | Title left, figure right, muted `foot`. Never nest |
| `Stats` + `Stat` | Numbers and what they count | `columns` (2-4) is a board band; `list` is ruled rows; `tone="accent"` for a win, `"miss"` for wrong counts |
| `ProgressBar` | Level, daily goal (lit); coverage (`tone="neutral"`) | Segmented; `thin` in lists |
| `PaceBar` | Drain toward a target time | No digits; `key` it per question |
| `Tally` | One mark per question | `ticks` while answering (hit lit, miss a short red bar, current outlined), `blocks` on results |
| `Banner` | One line that matters now | `note` outlined; `win` flashes on a board band for level-ups, badges, bests. One per screen |
| `Callout` | The shortcut | Raised fill. Feedback screens use `Solution` and `XpLine` from `screens/Session.tsx` |
| `OptionList` + `OptionCard` | Multiple choice | Tiles. States `idle`, `selected`, `correct`, `wrong`, `muted`; marked cards carry a visible tag; omit `onSelect` once marked. `compact` puts short figures two to a row in the numeral face, sized to the longest by `chars`: use it whenever every option is 11 characters or fewer |
| `Keypad` | Typed answers | In a `Dock`; number tiles in calculator order, outlined right column (delete, drawn stronger, then k, m, bn), ± left of 0, `.` right of it. One full-width `action` below, labelled and styled by the screen (lit Submit in a session, outlined Skip in a sprint, where a right answer is taken as it is typed). Keys type on touch-down, the action on release. No % key: the board shows the answer's unit, muted, after the caret |
| `ChipGroup` + `Chip` | One choice from a few | Pressed is solid ink/white, never lit; `wrap` for rows of five symbols; `scroll` for named choices too many for a row (one row that scrolls sideways, the pressed chip kept in view). Prefer names to bare symbols |
| `RowList` + `Row` | Skills, booklets, settings | `onClick` makes the row one target with a chevron; `coverage` adds a thin neutral bar |
| `Stars` | Mastery 0-3 | Sharp four-point stars |
| `DataTable` | Scenario data | Board band head; the title sits above and the first column (row names) stays pinned while figures scroll sideways under it; while columns are hidden the table fades at that edge and a line under it says to swipe. Figures right-align in the numeral face |
| `Figure` | A chart | Title, drawing, note; chart colours from `--chart-*` |
| `Chart` (`src/ui/chart`) | Drawing a chart description: bar, stacked, 100% stacked, line, indexed line, pie, cumulative, waterfall, scatter; bars upright or across; a right-hand axis for lines | Lays out at the width it gets and draws SVG at 1:1, so labels stay 12px on a 320px phone; frames itself in `Figure`. Unit line under the title; key only when lines cannot be named at their ends, and on waterfalls for increase and decrease. Waterfalls are horizontal so long names fit; axis labels thin out before they collide. **No chart text is ever under 12px** (`MIN_TEXT`): a chart whose labels cannot fit at that size is drawn wider than its frame and scrolls sideways inside the figure, with an edge fade and a line saying so. `own` (Trends) drops the "estimate from the gridlines" instruction |
| `Clock` | Sprint and mock time | `bar` or `hero`; `low` turns the accent, never red; `board` sets it on a small board tile (white, lit amber when low): the mock's live number |
| `QuestionNav` | Jumping between mock questions | Answered filled, current outlined, `flagged` a corner mark in the text colour; `layout="strip"` keeps one row that scrolls sideways inside a Dock, the current question kept in view |
| `BadgeGrid` + `Badge` | Milestones | Number on a tilted lit seal; outline until earned, with `how` (one line on how to earn it) under the name; `fresh` stamps in |
| `Flaps` | The streak count and the session score | One black tile per digit, lit digits, both themes. `title` beside a panel title, `hero` for the score. Never for a prompt or an answer: the seam is behind the digit, but tiles still slow a number that must be read at speed |

The typed answer (`.entry` in `styles.css`) is the board on drill and sprint screens. After a miss the board shows both figures, each with a tag: what was typed, struck through in `--board-miss`, and the answer, lit. A question that brings back an earlier miss leads its stage label with the outlined `Retry` tag (`RetryMark`).

**A spot check hides the skill.** The skill is the first hint to the method, so a spot check question's stage label reads "Spot check · pick one" until the answer is in, then "Spot check · " and the skill. This holds for a booklet question brought back as a retry too: its booklet line is not shown. A one-question spot check puts "Spot check · 1 question" in the bar, with no tally and no count.

**Short options are docked.** On a scenario question whose options are all 8 characters or fewer (`dockedOptions`), the four options sit two to a row in the Dock above Submit, and the chart or table and the question scroll above them: a value can be re-read without losing the answers. Longer options follow the question in the scroll; mocks keep their navigator dock and leave options in the flow.

**Summary order.** Score, tally, then the session's stats, then celebrations and the level meter. Score, tally and stats must be on screen at rest above the pinned buttons at 393×660 and 393×852 (`verify.mjs` asserts it); the score's size follows the screen height. A spot check's summary is the same screen headed "Spot check done", with a "Test level" Panel (a neutral ProgressBar of the test-level questions seen) between the celebrations and the level meter.

Feedback order (drill sheet, scenario, mock review): verdict and answer, XP, **Shortcut, then Worked solution**. The shortcut must be on screen without scrolling at 393×660 (`verify.mjs` asserts it). While feedback shows, the drill above keeps its own height and the sheet scrolls inside what is left. When an answer is itself a percentage, tolerance is labelled "within 3% of the answer" (`markingLabel(marking, unit)`, `toleranceNote`). An option's letter in feedback is drawn as its key, never as part of the answer; generated questions never name their entities A to E. A new screen whose point is one live number may put that number on a board band the same way; do not use the board for decoration or for more than one thing per screen.

### Celebrations and settings
A milestone is celebrated inline and briefly: `Banner tone="win"` (one per screen: level-up, else personal best, else badge) plus fresh `Badge` seals that stamp in. The stamp lives inside `prefers-reduced-motion: no-preference`; sounds (`src/ui/sound.ts`, under 0.3s, off with the Sound setting) are not motion. Settings are a `section` per choice: a `.label`, a `ChipGroup`, a muted meta line. Reset is never a modal: the first press shows a banner and a second, explicit button; it is not coral.

### Adding a screen
1. Start from `Screen` and existing parts. Check `/specimen.html` first; most screens are a title, a Panel or Stats band, a RowList and one primary Button.
2. One primary button, in `Screen actions` (page) or a `Dock` (task). A way out (`quiet` Leave or `secondary` Home) on every screen. The pinned area holds the lit action and at most one row of alternatives under it. Home's row is two outlined buttons side by side, "Spot check · 1" and "Spot check · 3" (`.spot-pair`); each label stays on one line at 320px.
3. Screen CSS goes in `src/ui/styles.css` under the screen's heading and uses steps only: `npm test` fails on any px, hex, rgb, ms or cubic-bezier outside `tokens.css`. Need a new value? Add a named step to `tokens.css` (colours need a dark and a light value) and say what it is for.
4. A new part is justified when three screens need it. Add it to `src/ui/parts`, export it from `index.ts`, show every state on the specimen, and add a row above.
5. Check both themes on an iPhone 14 Pro first (393×852 standalone, 393×660 Safari), then 375×667 and 320×568, by screenshot and by tapping through the flow with touch emulation (Playwright WebKit, `iPhone 14 Pro`).

### Phone rules (hard)
Every screen, no exceptions. The parts already do this; do not undo it.
- **Thumb zone.** The primary action is fully visible without scrolling, in the bottom third, at every size above. Page screens pass it as `Screen actions`; task screens put it in a `Dock`.
- **Long content scrolls inside the screen** (a sheet body, the scenario body, the page behind pinned actions). Answer controls never move or scroll away.
- **Targets** at least 44×44 (`--touch-min`) with a gap between them; keys and the primary button bigger.
- **No system keyboard.** Answers come from `Keypad`; never render `<input>` or `<textarea>` for an answer (`npm test` checks screens).
- **No zoom, selection or rubber-banding.** Control text at least 16px; `touch-action: manipulation`, no text selection or long-press callout on controls, `overscroll-behavior: none`: all set once in `parts.css`.
- **Portrait.** A phone turned sideways shows the rotate notice (`.rotate` in `index.html` and `parts.css`) over the app; no screen needs a landscape layout.
- **Safe areas.** Read insets only through `--inset-*` / `--safe-*` tokens (`npm test` rejects raw `env()`); content clears the Dynamic Island and the home indicator.
- **No sideways page scroll.** Wide tables scroll inside `DataTable`.
- **Focus ring for keys only.** `:focus-visible` draws the ring; `input-mode.ts` hides it while the owner is touching, because Safari also draws it on a button focused by script.
- **Readable.** Question text at least 16px; numbers large; press feedback instant (`:active` on every control).

## 6. Do and don't

**Do** make the number the largest thing on the screen, in the numeral face. **Do** keep amber to the one action, the live number and the wins. **Do** celebrate inline with `Banner tone="win"`. **Do** keep copy short and dry: "Clean sheet.", "Worth another go."

**Don't** use red for anything but a wrong answer. **Don't** write amber on white or fill with `--accent`. **Don't** add a second accent or a colour per mode. **Don't** set the numeral face under 20px or set sentences in it. **Don't** round beyond `--radius`, add soft shadows, glows, glass, gradient text or side stripes. **Don't** nest panels or wrap sections in boxed cards. **Don't** open a modal to celebrate or confirm; use a banner and a second press. **Don't** bounce, or animate on page load. Mascots, confetti and cheering copy are out.
