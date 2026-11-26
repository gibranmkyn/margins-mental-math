import type { ChartAxis, ChartBlock } from '../../src/engine/question/types';

export function readValue(value: number, axis: ChartAxis): number;
export function onGridline(value: number, axis: ChartAxis): boolean;
export function readingPositions(chart: ChartBlock): Array<{ value: number; axis: ChartAxis }>;
export function readChart(chart: ChartBlock): ChartBlock;
export function readingsNote(chart: ChartBlock): string;
