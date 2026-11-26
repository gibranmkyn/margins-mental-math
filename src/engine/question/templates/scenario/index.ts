import type { ScenarioSkill } from '../../types';
import type { ScenarioTemplate } from '../template';
import { averagePerHead } from './average-per-head';
import { breakEvenProbability } from './break-even-probability';
import { breakEvenVolume } from './break-even-volume';
import { costPerUnit } from './cost-per-unit';
import { pricePoint } from './price-point';
import { supplierSwitch } from './supplier-switch';
import { formulaHeadcount } from './formula-headcount';
import { formulaPay } from './formula-pay';
import { formulaPerUnit } from './formula-per-unit';
import { expectedPayoff } from './expected-payoff';
import { growthRate } from './growth-rate';
import { shareShift } from './share-shift';
import { statementFunnel } from './statement-funnel';
import { statementGrowth } from './statement-growth';
import { statementMargin } from './statement-margin';
import { weightedPrice } from './weighted-price';
import { growthProjection } from './growth-projection';
import { markupDiscount } from './markup-discount';
import { missingCount } from './missing-count';
import { paybackCeiling } from './payback-ceiling';
import { paybackSavings } from './payback-savings';
import { priceVolume } from './price-volume';
import { rankRatio } from './rank-ratio';
import { riskRanking } from './risk-ranking';
import { sameRatio } from './same-ratio';
import { highestRatio } from './highest-ratio';
import { shareOfShare } from './share-of-share';

/** Every scenario template, grouped by the skill it serves. A skill without templates is served by authored questions alone. */
export const scenarioTemplates: Record<ScenarioSkill, ScenarioTemplate[]> = {
  'break-even-payback': [breakEvenVolume, paybackSavings, paybackCeiling],
  'percentages-in-context': [shareOfShare, priceVolume, markupDiscount],
  'growth-trends': [growthRate, shareShift, growthProjection],
  'unit-economics': [costPerUnit, supplierSwitch, pricePoint],
  'ratios-comparisons': [rankRatio, highestRatio, sameRatio],
  'averages-mixes': [weightedPrice, averagePerHead, missingCount],
  'building-formulas': [formulaPerUnit, formulaPay, formulaHeadcount],
  'testing-statements': [statementGrowth, statementMargin, statementFunnel],
  'expected-value': [riskRanking, expectedPayoff, breakEvenProbability],
};
