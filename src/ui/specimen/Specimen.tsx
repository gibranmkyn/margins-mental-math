import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  Badge,
  BadgeGrid,
  Flaps,
  Banner,
  Button,
  Callout,
  Chip,
  ChipGroup,
  Clock,
  DataTable,
  Keypad,
  OptionCard,
  OptionList,
  PaceBar,
  Panel,
  ProgressBar,
  QuestionNav,
  Row,
  RowList,
  Screen,
  ScreenBar,
  Stars,
  Stat,
  Stats,
  Tally,
} from '../parts';
import type { ChartBlock } from '../../engine/question';
import { Chart } from '../chart/Chart';
import { Crashed } from '../screens/Trouble';
import { getThemeChoice, setThemeChoice } from '../theme';
import type { ThemeChoice } from '../theme';

/** Every shared part, in every state, plus the shapes of screens still to come. Dev only: /specimen.html */
export function Specimen() {
  return (
    <Screen class="specimen">
      <header class="spec-head">
        <h1 class="wordmark">Margins</h1>
        <p class="meta">Shared parts and design steps. Guide: DESIGN.md.</p>
        <ThemePicker />
      </header>
      <Colours />
      <Type />
      <Steps />
      <Spec id="screen-bar" name="Screen bar" use="Top of every task screen: a way out, where you are, what is left.">
        <ScreenBar leading={<Button variant="quiet">Leave</Button>} center={<Tally results={[true, false]} total={5} current={2} label="Drill 3 of 5" />} trailing="3/5" />
        <ScreenBar leading={<Button variant="quiet">Leave</Button>} center={<span class="meta">Short mock · 4 of 10</span>} trailing={<Clock ms={(14 * 60 + 32) * 1000} />} />
      </Spec>
      <Spec id="button" name="Button" use="Primary: the one next step, one per screen. Secondary: a real alternative. Quiet: a way out.">
        <Button arrow>Start session</Button>
        <Button disabled>Submit</Button>
        <Button variant="secondary">Home</Button>
        <div class="spec-row">
          <Button variant="quiet">Leave</Button>
          <Button variant="quiet">Skip</Button>
        </div>
      </Spec>
      <Spec id="panel" name="Panel" use="A ruled section of a page with a head line. Never nested, never boxed.">
        <Panel label="Level" title="Senior Analyst" meta="412 XP" foot="288 XP to Associate">
          <ProgressBar value={28} label="Level progress" />
        </Panel>
        <Panel label="Streak" title="12 days" meta={<span class="streak-secured">Today secured</span>} foot="Longest 19 days" />
      </Spec>
      <Spec id="stat" name="Stat" use="A number and what it counts. Columns for two to four; list for more.">
        <Stats label="Columns">
          <Stat label="Answered" value="1,284" />
          <Stat label="Accuracy" value="87%" />
          <Stat label="XP earned" value="+62" tone="accent" />
        </Stats>
        <Stats label="List" layout="list">
          <Stat label="Average per drill" value="6.4s" />
          <Stat label="Missed" value="3" tone="miss" />
        </Stats>
      </Spec>
      <Spec id="progress" name="Progress bar" use="How far through: level, daily goal (lit); coverage (neutral). Pace bar drains toward a target time.">
        <ProgressBar value={64} label="Daily goal" />
        <ProgressBar value={38} tone="neutral" label="Booklet coverage" />
        <PaceBar durationMs={60000} stopped />
      </Spec>
      <Spec id="tally" name="Tally" use="One mark per question. Ticks while answering, blocks on a result.">
        <Tally results={[true, true, false]} total={5} current={3} label="Drill 4 of 5" />
        <Tally variant="blocks" results={[true, true, false, true, true]} total={5} label="Results" itemName="Drill" />
      </Spec>
      <Spec id="banner" name="Banner and callout" use="Banner: one line that matters now; win for celebrations. Callout: the shortcut.">
        <Banner>Estimate: anything within 3% counts. Exact value shown after.</Banner>
        <Banner tone="win" kicker="Promoted">
          Associate
        </Banner>
        <Banner tone="win" kicker="New best">
          23 in 60s
        </Banner>
        <Callout>Add left to right: 81 + 50 = 131, then + 2 = 133.</Callout>
      </Spec>
      <ScenarioQuestion />
      <Spec id="data-table" name="Data table" use="Scenario data. Figures align right in the numeral face; wide tables scroll inside the question.">
        <DataTable
          title="Store economics, FY24"
          headers={['Region', 'Stores', 'Revenue', 'Margin', 'Rent', 'Staff', 'Growth']}
          rows={[
            ['North', '42', '$18.4m', '12%', '$3.1m', '$5.2m', '+4%'],
            ['South', '35', '$14.9m', '9%', '$2.4m', '$4.6m', '+7%'],
            ['West', '28', '$11.2m', '15%', '$2.0m', '$3.1m', '−2%'],
          ]}
        />
      </Spec>
      <Charts />
      <BookletExhibits />
      <Spec id="keypad" name="Keypad" use="Typed answers. In a Dock, full-bleed. Calculator order; delete and magnitude keys on the right; ± left of 0; one action alone on its row, named by the screen. No % key: the unit sits on the board after the caret. Keys type on touch-down, the action on release.">
        <div class="spec-frame">
          <Keypad onKey={() => {}} action={{ label: 'Submit', onPress: () => {} }} />
        </div>
      </Spec>
      <Chips />
      <Spec id="skills" name="Skills screen: rows and stars" use="Row: one line of a list that opens something. Stars: mastery, zero to three.">
        <RowList label="Drill skills">
          <Row title="Addition" meta="Tier 3 · 214 answered" trailing={<Stars value={3} />} onClick={() => {}} />
          <Row title="Multiplication" meta="Tier 2 · 96 answered" trailing={<Stars value={2} />} onClick={() => {}} />
          <Row title="Compound growth" meta="Tier 1 · 12 answered" trailing={<Stars value={0} />} onClick={() => {}} />
        </RowList>
        <div class="spec-row">
          <Stars value={1} large />
          <span class="meta">Large, for a skill's own page</span>
        </div>
      </Spec>
      <Spec id="library" name="Booklet library" use="Rows with a white coverage bar: progress through your own material is not a reward.">
        <RowList label="Booklets">
          <Row title="Practice booklet 1" meta="3 of 7 correct" trailing="43%" coverage={43} coverageLabel="Practice booklet 1 coverage" onClick={() => {}} />
          <Row title="Practice booklet 2" meta="Finished · 2 of 2" trailing="100%" coverage={100} coverageLabel="Practice booklet 2 coverage" onClick={() => {}} />
        </RowList>
      </Spec>
      <Spec id="sprint" name="Sprint" use="Clock (hero) for a real deadline; the count is the hero number; best beside it.">
        <ScreenBar leading={<Button variant="quiet">Stop</Button>} center={<span class="meta">Multiplication sprint</span>} trailing="Best 19" />
        <div class="spec-sprint">
          <span class="spec-sprint-count" aria-label="14 correct">
            14
          </span>
          <Clock ms={8000} size="hero" low />
        </div>
        <ProgressBar value={13} thin label="Time left" />
      </Spec>
      <Spec
        id="mock"
        name="Mock: question navigator"
        use="Jump between mock questions. Answered: filled. Current: accent outline. Flagged: corner mark. Grid for the finish view; strip (scrolls sideways inside itself) for the dock."
      >
        <QuestionNav
          answered={[true, true, false, true, false, false, false, false, false, false]}
          flagged={[false, true, false, false, false, false, true, false, false, false]}
          current={2}
          onSelect={() => {}}
        />
        <div class="spec-row">
          <Clock ms={(14 * 60 + 32) * 1000} board />
          <Clock ms={95 * 1000} board low />
        </div>
        <QuestionNav
          layout="strip"
          answered={Array.from({ length: 26 }, (_, i) => i < 9 && i !== 4)}
          flagged={Array.from({ length: 26 }, (_, i) => i === 4)}
          current={9}
          onSelect={() => {}}
        />
        <div class="spec-row">
          <Button variant="secondary" disabled>
            Back
          </Button>
          <Chip pressed onClick={() => {}} ariaLabel="Flag this question">
            Flag
          </Chip>
        </div>
        <Button arrow>Skip</Button>
        <Button variant="secondary">Submit</Button>
      </Spec>
      <Spec id="flaps" name="Flaps" use="A number on flap tiles: the streak and the session score. Black tiles, lit digits, in both themes. Never for a prompt or an answer.">
        <p class="panel-title">
          <Flaps value="12" /> days
        </p>
        <p class="score">
          <Flaps value="4" size="hero" />
          <span class="score-of">/5</span>
        </p>
      </Spec>

      <Spec id="badges" name="Badges and celebrations" use="A badge's number on a tilted lit seal; outline and how to earn it until earned. Celebrate with a win banner, never a modal.">
        <BadgeGrid label="Badges">
          <Badge mark="7" name="7-day streak" earned fresh />
          <Badge mark="100" name="100 answered" earned />
          <Badge mark="5/5" name="Perfect session" earned />
          <Badge mark="70%" name="Mock passed" earned={false} how="Score 70% or more in a mock." />
          <Badge mark="30" name="30-day streak" earned={false} how="Finish a session 30 days running." />
          <Badge mark="25" name="Sprint of 25" earned={false} how="Score 25 in a 60-second sprint." />
        </BadgeGrid>
        <Banner tone="win" kicker="Badge">
          7-day streak
        </Banner>
      </Spec>
      <Settings />
      <Troubles />
    </Screen>
  );
}

function Spec({ id, name, use, children }: { id: string; name: string; use: string; children: ComponentChildren }) {
  return (
    <section class="spec" data-specimen={id} aria-label={name}>
      <div class="spec-head">
        <h2 class="spec-name">{name}</h2>
        <p class="meta">{use}</p>
      </div>
      {children}
    </section>
  );
}

/** See every part in both themes. The app's own setting arrives with the settings screen. */
function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);
  const choose = (next: ThemeChoice) => {
    setThemeChoice(next);
    setChoice(next);
  };
  return (
    <ChipGroup label="Theme">
      {(['system', 'light', 'dark'] as const).map((option) => (
        <Chip key={option} pressed={choice === option} onClick={() => choose(option)}>
          {option[0]!.toUpperCase() + option.slice(1)}
        </Chip>
      ))}
    </ChipGroup>
  );
}

const COLOURS: Array<[string, string]> = [
  ['--ink', 'page'],
  ['--panel', 'sheets'],
  ['--raise', 'tiles, callout'],
  ['--line', 'hairlines, outlines'],
  ['--text', 'text'],
  ['--muted', 'secondary'],
  ['--faint', 'large / glyphs'],
  ['--accent', 'accent as text, line'],
  ['--lit', 'accent as fill'],
  ['--board', 'the board'],
  ['--board-num', 'lit numerals'],
  ['--bar', 'bar, unlit'],
  ['--miss', 'wrong answers only'],
  ['--chart-3', 'chart series 3'],
  ['--chart-4', 'chart series 4'],
];

function Colours() {
  return (
    <Spec id="colour" name="Colour" use="Dark: a floodlit board, amber, red. Light: white page, black bands, amber only as a fill. The board is black in both. The miss colour only for misses.">
      <div class="swatches">
        {COLOURS.map(([token, role]) => (
          <div class="swatch" key={token}>
            <span class="swatch-chip" style={{ background: `var(${token})` }} />
            <span class="meta">{token}</span>
            <span class="label">{role}</span>
          </div>
        ))}
      </div>
    </Spec>
  );
}

const TYPES: Array<[string, string, string]> = [
  ['--type-3xl', 'num', 'CORRECT'],
  ['--type-2xl', 'num', '1,284'],
  ['--type-xl', 'num', 'SENIOR ANALYST'],
  ['--type-num', 'num', '14 / 33'],
  ['--type-lg', 'word', 'Which option is closest?'],
  ['--type-md', 'word', '10% of 4,250 = 425'],
  ['--type-sm', 'word', '4 XP to Analyst'],
];

function Type() {
  return (
    <Spec id="type" name="Type" use="Big Shoulders carries every figure of 20px and up, and labels; Hanken Grotesk carries words. Numbers are the hero.">
      <p class="prompt">47 + 38</p>
      {TYPES.map(([token, family, text]) => (
        <p class="type-sample" key={token + family}>
          <span style={{ fontSize: `var(${token})`, fontFamily: `var(--${family})`, fontWeight: 'var(--weight-bold)' }}>{text}</span>
          <span class="meta">{token}</span>
        </p>
      ))}
      <p class="label">Label: the one uppercase voice</p>
    </Spec>
  );
}

function Steps() {
  return (
    <Spec id="steps" name="Space, shape, motion" use="A 4px rhythm. One radius: 3px. Presses take 60ms, state 150ms, sheets 220ms; no bounce.">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <div class="spec-row" key={n}>
          <span class="space-bar" style={{ width: `var(--space-${n})` }} />
          <span class="meta">--space-{n}</span>
        </div>
      ))}
    </Spec>
  );
}

function ScenarioQuestion() {
  const [chosen, setChosen] = useState<number | null>(null);
  const options = ['$1.8m', '$2.1m', '$2.4m', '$2.7m'];
  const correct = 1;
  const state = (i: number) => (chosen === null ? 'idle' : i === correct ? 'correct' : i === chosen ? 'wrong' : 'muted');
  return (
    <>
      <Spec id="option-card" name="Option card" use="Multiple choice. Whole row is the target; letter key; sentences in the word face.">
        <p class="spec-paragraph">A retailer plans to open 12 stores. Each costs $0.9m to fit out and earns $0.35m a year in contribution.</p>
        <p class="spec-prompt">How much contribution do the new stores earn in their first six months?</p>
        <OptionList label="Options">
          {options.map((text, i) => (
            <OptionCard key={text} letter={'ABCD'[i]!} state={state(i)} {...(chosen === null ? { onSelect: () => setChosen(i) } : {})}>
              {text}
            </OptionCard>
          ))}
        </OptionList>
      </Spec>
      <Spec id="option-states" name="Option card states" use="Selected (mock, can change) · correct · your wrong pick · the rest muted.">
        <OptionList label="States">
          <OptionCard letter="A" state="selected" onSelect={() => {}}>
            $1.8m
          </OptionCard>
          <OptionCard letter="B" state="correct">
            $2.1m
          </OptionCard>
          <OptionCard letter="C" state="wrong">
            $2.4m
          </OptionCard>
          <OptionCard letter="D" state="muted">
            $2.7m
          </OptionCard>
        </OptionList>
      </Spec>
      <Spec id="option-compact" name="Compact options" use="Short options beside a chart: two to a row where the width allows, one column on the narrowest phones; tags drop under the figure.">
        <OptionList label="Compact" compact>
          <OptionCard letter="A" onSelect={() => {}}>
            8%
          </OptionCard>
          <OptionCard letter="B" state="correct">
            38%
          </OptionCard>
          <OptionCard letter="C" state="wrong">
            68%
          </OptionCard>
          <OptionCard letter="D" state="muted">
            98%
          </OptionCard>
        </OptionList>
      </Spec>
    </>
  );
}

/** One chart of each form the renderer draws, from fixed descriptions. */
const SPECIMEN_CHARTS: ChartBlock[] = [
  {
    type: 'chart',
    chart: 'bar',
    title: 'Revenue by year (labelled)',
    unit: 'Revenue, $m',
    categories: ['2020', '2021', '2022', '2023', '2024'],
    series: [{ name: 'Revenue', values: [84, 97, 103, 121, 138] }],
    axis: { min: 0, max: 150, step: 25 },
    labelled: true,
    decimals: 0,
  },
  {
    type: 'chart',
    chart: 'bar',
    title: 'Sales by region, two years (estimated)',
    unit: 'Sales, million litres',
    categories: ['North', 'South', 'East', 'West', 'Centre'],
    series: [
      { name: '2023', values: [46, 30, 58, 22, 40] },
      { name: '2024', values: [52, 28, 70, 30, 44] },
    ],
    axis: { min: 0, max: 80, step: 10 },
    labelled: false,
    decimals: 0,
  },
  {
    type: 'chart',
    chart: 'stacked-bar',
    title: 'Revenue by channel',
    unit: 'Revenue, $m; totals above the bars',
    categories: ['2021', '2022', '2023', '2024'],
    series: [
      { name: 'Stores', values: [52, 48, 44, 40] },
      { name: 'Online', values: [30, 41, 55, 68] },
      { name: 'Concessions', values: [38, 39, 37, 36] },
    ],
    axis: { min: 0, max: 150, step: 25 },
    labelled: true,
    decimals: 0,
    highlight: 1,
    barNotes: ['120', '128', '136', '144'],
  },
  {
    type: 'chart',
    chart: 'stacked-bar-100',
    title: 'Share of sparkling-water sales (estimated)',
    unit: 'Share of sales, %; market size above the bars',
    categories: ['2022', '2023', '2024'],
    series: [
      { name: 'Fizz', values: [22, 26, 30] },
      { name: 'Brook', values: [30, 28, 26] },
      { name: 'Alpine', values: [20, 22, 22] },
      { name: 'Others', values: [28, 24, 22] },
    ],
    axis: { min: 0, max: 100, step: 10 },
    labelled: false,
    decimals: 0,
    suffix: '%',
    highlight: 0,
    barNotes: ['$240m', '$262m', '$281m'],
  },
  {
    type: 'chart',
    chart: 'line',
    title: 'Average shelf price per bag',
    unit: 'Price, $',
    categories: ['2019', '2020', '2021', '2022', '2023', '2024'],
    series: [
      { name: 'Roastly', values: [9.2, 9.6, 9.6, 10.4, 10.4, 10.8] },
      { name: 'Rival', values: [12, 13.2, 12.8, 13.2, 14.4, 16] },
    ],
    axis: { min: 6, max: 18, step: 2 },
    labelled: false,
    decimals: 1,
    highlight: 1,
  },
  {
    type: 'chart',
    chart: 'indexed-line',
    title: 'Revenue growth of listed grocers',
    unit: 'Index of revenue, 2019 = 100',
    categories: ['2019', '2020', '2021', '2022', '2023', '2024'],
    series: [
      { name: 'Freshco', values: [100, 100, 103, 104, 105, 111] },
      { name: 'Basket', values: [100, 102, 115, 130, 142, 160] },
    ],
    axis: { min: 80, max: 180, step: 20 },
    labelled: true,
    decimals: 0,
    highlight: 1,
  },
  {
    type: 'chart',
    chart: 'pie',
    title: 'Operating costs by type',
    unit: 'Share of operating costs, %',
    categories: ['Ingredients', 'Staff', 'Rent', 'Energy', 'Delivery', 'Other'],
    series: [{ name: 'Costs', values: [22, 25, 9, 20, 12, 12] }],
    labelled: true,
    decimals: 0,
    suffix: '%',
    highlight: 2,
    note: 'Total operating costs last year: $54m',
  },
  {
    type: 'chart',
    chart: 'cumulative',
    title: 'Projected sales in ten years, by market',
    unit: 'Cumulative share of projected sales, %; largest market first',
    categories: ['Top 1', 'Top 2', 'Top 3', 'Top 4', 'Top 5', 'All 40'],
    series: [{ name: 'Cumulative share', values: [18, 28, 36, 42, 47, 100] }],
    axis: { min: 0, max: 100, step: 20 },
    labelled: true,
    decimals: 0,
    suffix: '%',
    note: 'Total, all 40 markets: $134bn',
  },
  {
    type: 'chart',
    chart: 'cumulative',
    title: 'Emergency department costs (estimated)',
    unit: 'Cumulative share of cost, %; group A first',
    categories: ['A', 'A–B', 'A–C', 'A–D', 'A–E'],
    series: [{ name: 'Cumulative share', values: [16, 36, 62, 82, 100] }],
    axis: { min: 0, max: 100, step: 10 },
    labelled: false,
    decimals: 0,
    suffix: '%',
    note: 'Total cost: $9.3m',
  },
  {
    type: 'chart',
    chart: 'waterfall',
    title: 'Operating profit, 2023 to 2024',
    unit: 'Operating profit, $m',
    categories: ['2023', 'Fares', 'Passengers', 'Fuel', 'Crew pay', 'Airport fees', '2024'],
    series: [{ name: 'Operating profit', values: [268, 80, 64, -24, -40, -46, 302] }],
    totals: [0, 6],
    axis: { min: 0, max: 500, step: 100 },
    labelled: true,
    decimals: 0,
    highlight: 3,
  },
  {
    type: 'chart',
    chart: 'waterfall',
    title: 'From revenue to operating profit (estimated)',
    unit: '$m',
    categories: ['Revenue', 'Cost of goods', 'Gross profit', 'Staff', 'Rent', 'Marketing', 'Operating profit'],
    series: [{ name: 'Profit and loss', values: [600, -260, 340, -80, -60, -40, 160] }],
    totals: [0, 2, 6],
    axis: { min: 0, max: 700, step: 100 },
    labelled: false,
    decimals: 0,
  },
];

function Charts() {
  return (
    <Spec
      id="figure"
      name="Figure and charts"
      use="Chart from src/ui/chart inside a Figure. Amber marks the series asked about; greys, hatching, dashes and marker shapes tell the rest apart. Values printed, or read from stronger gridlines."
    >
      {SPECIMEN_CHARTS.map((block) => (
        <Chart key={block.title} block={block} />
      ))}
    </Spec>
  );
}

/**
 * The booklet exhibits redrawn from the PDFs, for checking each against its page. `?exhibit=<id>` shows one.
 * The exhibit files are private (content/exhibits): without them the section is left out.
 */
const EXHIBITS = Object.values(
  import.meta.glob<Array<{ id: string; page: number; questions: string[]; blocks: Array<ChartBlock | { type: 'table'; title?: string; headers: string[]; rows: string[][] }> }>>(
    '../../../content/exhibits/*.json',
    { eager: true, import: 'default' },
  ),
).flat();

function BookletExhibits() {
  const only = new URLSearchParams(location.search).get('exhibit');
  const shown = EXHIBITS.filter((x) => !only || x.id === only);
  if (EXHIBITS.length === 0) return null;
  return (
    <Spec id="exhibits" name="Booklet exhibits" use="Every booklet exhibit redrawn from its PDF page, as the booklet questions show it. ?exhibit=<id> shows one.">
      {shown.map((x) => (
        <div key={x.id} class="spec-exhibit" data-exhibit={x.id}>
          <p class="meta">
            {x.id} · page {x.page} · {x.questions.join(', ')}
          </p>
          {x.blocks.map((b, i) =>
            b.type === 'chart' ? <Chart key={i} block={b} /> : <DataTable key={i} {...(b.title ? { title: b.title } : {})} headers={b.headers} rows={b.rows} />,
          )}
        </div>
      ))}
    </Spec>
  );
}

function Chips() {
  const [skill, setSkill] = useState('×');
  const [tier, setTier] = useState(2);
  return (
    <Spec id="chip" name="Chip group" use="One choice from two to five: skill, tier, sound. Pressed chip is solid; amber stays for actions.">
      <ChipGroup label="Skill">
        {['+', '−', '×', '÷'].map((s) => (
          <Chip key={s} pressed={s === skill} onClick={() => setSkill(s)}>
            {s}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label="Tier">
        {[1, 2, 3].map((t) => (
          <Chip key={t} pressed={t === tier} onClick={() => setTier(t)}>
            Tier {t}
          </Chip>
        ))}
      </ChipGroup>
    </Spec>
  );
}

function Settings() {
  const [sound, setSound] = useState(true);
  const [goal, setGoal] = useState(100);
  return (
    <Spec id="settings" name="Settings" use="Rows with a chip group on the right. Destructive actions ask twice and the confirming press carries a heavy outline and a cross; never red. Named choices too many for a row scroll sideways.">
      <RowList label="Settings">
        <Row
          title="Sound"
          trailing={
            <ChipGroup label="Sound">
              <Chip pressed={sound} onClick={() => setSound(true)}>
                On
              </Chip>
              <Chip pressed={!sound} onClick={() => setSound(false)}>
                Off
              </Chip>
            </ChipGroup>
          }
        />
        <Row title="Daily goal" meta={`${goal} XP a day`} />
      </RowList>
      <ChipGroup label="Daily goal">
        {[50, 100, 200].map((g) => (
          <Chip key={g} pressed={g === goal} onClick={() => setGoal(g)}>
            {g}
          </Chip>
        ))}
      </ChipGroup>
      <Banner>This clears every answer, streak and badge. It cannot be undone.</Banner>
      <Button variant="secondary">Reset all progress</Button>
      <Button variant="secondary" destructive>
        Yes, erase everything
      </Button>
      <Button variant="quiet">Keep my progress</Button>
      <ChipGroup label="Skill" scroll>
        {['All skills', 'Addition', 'Subtraction', 'Multiplication', 'Division', 'Percentages'].map((name, i) => (
          <Chip key={name} pressed={i === 1} onClick={() => {}}>
            {name}
          </Chip>
        ))}
      </ChipGroup>
    </Spec>
  );
}

function Troubles() {
  return (
    <Spec id="trouble" name="Trouble" use="When saving fails Home says so once, in a note banner. A crash shows one screen with Reload first and a two-press reset; a phone on its side gets the rotate notice.">
      <Banner role="status">Storage on this phone is full, so new progress is not being saved. Delete old backups in Settings to make room.</Banner>
      <div class="spec-frame">
        <Crashed onReset={() => {}} />
      </div>
    </Spec>
  );
}
