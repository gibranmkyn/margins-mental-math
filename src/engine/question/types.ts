/** Every skill: drill skills, then scenario skills, then chart skills. */
export type Skill =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'percentages'
  | 'large-numbers'
  | 'compound-growth'
  | 'fraction-conversions'
  | 'percentage-change'
  | 'weighted-average'
  | ScenarioSkill
  | ChartSkill;

/** Skills served by multiple-choice scenario questions, one per archetype in the spec. */
export type ScenarioSkill =
  | 'break-even-payback'
  | 'percentages-in-context'
  | 'growth-trends'
  | 'unit-economics'
  | 'ratios-comparisons'
  | 'averages-mixes'
  | 'building-formulas'
  | 'testing-statements'
  | 'expected-value';

/**
 * Skills served by chart questions, one per chart type: scenario questions whose
 * data is a drawn chart, read or estimated before calculating.
 */
export type ChartSkill = 'bar-charts' | 'stacked-bar-charts' | 'line-charts' | 'pie-charts' | 'cumulative-charts' | 'waterfall-charts';

/** Skills answered by choosing an option, in 3-question sessions: scenario and chart skills. */
export type ChoiceSkill = ScenarioSkill | ChartSkill;

/** Skills answered by typing a number. */
export type DrillSkill = Exclude<Skill, ChoiceSkill>;

export type Tier = 1 | 2 | 3;

export type QuestionSource = 'generated' | 'authored' | 'booklet';

/**
 * How a typed numeric answer is marked: exactly, or correct when within a
 * stated percentage of the true value.
 */
export type Marking = { mode: 'exact' } | { mode: 'tolerance'; percent: number };

/** A typed number. Multiple-choice answers join the Answer union later. */
export interface NumericAnswer {
  kind: 'numeric';
  value: number;
  marking: Marking;
  /** Shown beside the value, e.g. '%' or '$'. Empty for bare numbers. */
  unit: string;
}

/** One option chosen from several; scenario and chart questions use this. */
export interface ChoiceAnswer {
  kind: 'choice';
  /** Owner-facing option text, in display order. */
  options: string[];
  correctIndex: number;
}

export type Answer = NumericAnswer | ChoiceAnswer;

/** Paragraph, list, table or chart; drills carry none. */
export type ContextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; title?: string; headers: string[]; rows: string[][] }
  | ChartBlock;

/**
 * The drawn chart forms. A 100% stacked bar draws each category as shares of
 * its own total: its values are shares adding to 100, or amounts printed as
 * given (a bar of 0.3 and 0.4 is drawn as 43% and 57%); an indexed line's values are an index with the first
 * category at 100. A cumulative chart's values are running totals across the
 * categories (a running share ends at 100), drawn as rising bars. A
 * waterfall's values are totals at the categories listed in `totals` and
 * signed steps up or down from the running total everywhere else. A
 * scatter places named points on two value axes: each category is a point,
 * at `x` along `xAxis` and its value up `axis`. A stacked bar may hold
 * negative segments, which stack down from zero.
 */
export type ChartKind = 'bar' | 'stacked-bar' | 'stacked-bar-100' | 'line' | 'indexed-line' | 'pie' | 'cumulative' | 'waterfall' | 'scatter';

export interface ChartSeries {
  name: string;
  /** One value per category (for a pie, one per slice). */
  values: number[];
  /** Line charts with a second value axis: this series is measured on the right-hand axis. */
  axis?: 'right';
}

/** A value axis: gridlines or ticks every step from min to max. */
export interface ChartAxis {
  min: number;
  max: number;
  step: number;
}

/**
 * A chart description: what to draw, never how. The chart renderer turns it
 * into a drawing; the same description serves generated questions and
 * redrawn booklet exhibits.
 */
export interface ChartBlock {
  type: 'chart';
  chart: ChartKind;
  title: string;
  /** What the values measure, shown with the chart: "Revenue, $m", "Index, 2019 = 100". */
  unit: string;
  /** Labels along the category axis (years, regions); for a pie, the slice names. */
  categories: string[];
  /** Bars side by side, segments of a stack, lines, or the one series of a pie. */
  series: ChartSeries[];
  /** The value axis of bar and line charts: gridlines every step from min to max. */
  axis?: ChartAxis;
  /** Values printed on the chart. When false they must be estimated from the gridlines. */
  labelled: boolean;
  /** Decimal places of printed values and axis labels. */
  decimals: number;
  /** Printed around values and axis labels: "$" before, "%" after. */
  prefix?: string;
  suffix?: string;
  /** The series (for a pie, the slice; for a waterfall, the bar) the question is about; drawn in the accent. */
  highlight?: number;
  /**
   * Waterfall only: the categories drawn as totals standing on zero, at the
   * running total. The first category is always one (the starting value).
   */
  totals?: number[];
  /** Text above each bar of a stacked chart, e.g. the total or the market size. */
  barNotes?: string[];
  /** A line under the chart, e.g. a source or a figure the chart does not show. */
  note?: string;
  /** Bar and stacked bar charts: bars run across, one row per category, so long names fit. */
  horizontal?: boolean;
  /**
   * Rows of figures printed above the bars of a bar or stacked chart, each named:
   * e.g. a total and a growth rate per bar.
   */
  barNoteRows?: Array<{ name: string; notes: string[] }>;
  /**
   * Bar and cumulative charts: runs of consecutive categories that form a group,
   * drawn in their own tone and named under the axis. The counts add up to the categories.
   */
  groups?: Array<{ name: string; count: number }>;
  /** Line charts: a second value axis on the right, for series marked `axis: 'right'`, printed with its own prefix and suffix. */
  axisRight?: ChartAxis & { prefix?: string; suffix?: string };
  /** Scatter only: the horizontal value axis, what it measures, and each point's position along it. */
  xAxis?: ChartAxis & { prefix?: string; suffix?: string };
  xUnit?: string;
  x?: number[];
  /**
   * Scatter only: points joined in category order, by straight lines or by steps
   * (each value held until the next point's x, the last until the axis ends).
   * Points named '' only shape the line and carry no marker.
   */
  join?: 'line' | 'step';
  /** Scatter only: dashed reference lines across the plot at a value of either axis. */
  references?: Array<{ axis: 'x' | 'y'; value: number }>;
}

export interface Question {
  /** Stable identity. For generated questions it encodes the seed, so the question can be rebuilt. */
  id: string;
  skill: Skill;
  tier: Tier;
  source: QuestionSource;
  targetTimeMs: number;
  prompt: string;
  context: ContextBlock[];
  answer: Answer;
  /** Worked solution, one step per line; the last step arrives at the answer. */
  solution: string[];
  /** May be empty for a booklet question whose booklet gave no shortcut. */
  shortcut: string;
  /** Shown under the solution: a booklet question's note on its answer (e.g. why the key's answer is kept). */
  note?: string;
  /** Where a booklet question comes from; booklet questions only. */
  booklet?: BookletRef;
  /** The id of the booklet question an authored question is modelled on, when its entry names one. */
  modelledOn?: string;
}

/** A booklet question's origin: which booklet, which case, which question number. */
export interface BookletRef {
  /** The booklet's id, e.g. "pst1". */
  booklet: string;
  /** The booklet's name, e.g. "Practice booklet 1". */
  name: string;
  caseTitle: string;
  /** The question's number in the booklet (in its practice set, where the booklet holds two). */
  number: number;
  /**
   * The practice set the question belongs to, only where one booklet holds two numbered
   * sets (say "Official sample", then "Second practice set"), so that two
   * questions never share a label.
   */
  part?: string;
}

/** A drill: a question answered by typing a number. */
export type DrillQuestion = Question & { skill: DrillSkill; answer: NumericAnswer };

/** What the owner submitted: a typed number, or the index of the option chosen. */
export type Submission = { kind: 'numeric'; value: number } | { kind: 'choice'; index: number };

export interface Mark {
  correct: boolean;
  /** The true value, for display after answering; for multiple choice, the index of the correct option. */
  expected: number;
}
