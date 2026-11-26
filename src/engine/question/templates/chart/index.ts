import type { ChartSkill } from '../../types';
import type { ScenarioTemplate } from '../template';
import { barGrowth } from './bar-growth';
import { barShare } from './bar-share';
import { cumulativeGroups } from './cumulative-groups';
import { cumulativeShare } from './cumulative-share';
import { indexedGrowth } from './indexed-growth';
import { lineTrend } from './line-trend';
import { marginWalk } from './margin-walk';
import { pieAmount } from './pie-amount';
import { pieShift } from './pie-shift';
import { profitBridge } from './profit-bridge';
import { stackedMix } from './stacked-mix';
import { stackedShare } from './stacked-share';

/** Every chart template, grouped by the chart skill it serves. */
export const chartTemplates: Record<ChartSkill, ScenarioTemplate[]> = {
  'bar-charts': [barGrowth, barShare],
  'stacked-bar-charts': [stackedMix, stackedShare],
  'line-charts': [lineTrend, indexedGrowth],
  'pie-charts': [pieAmount, pieShift],
  'cumulative-charts': [cumulativeShare, cumulativeGroups],
  'waterfall-charts': [profitBridge, marginWalk],
};
