const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

/** A negative number takes a true minus sign, "−3", never a hyphen; a value that rounds to zero loses its sign. */
function signed(text: string): string {
  if (/^-0(?:\.0*)?$/.test(text)) return text.slice(1);
  return text.replace(/^-/, '−');
}

/** Formats a number the way it appears in prompts and solutions: 12,345.6, −3 */
export function formatNumber(value: number): string {
  return signed(grouped.format(value));
}

const MAGNITUDES = [
  { suffix: 'bn', size: 1e9 },
  { suffix: 'm', size: 1e6 },
  { suffix: 'k', size: 1e3 },
] as const;

/**
 * Formats a number in magnitude shorthand where it is a thousand or more:
 * 4,800,000,000 -> 4.8bn, 60,000 -> 60k, 1,250 -> 1.25k, 640 -> 640.
 */
export function formatShort(value: number): string {
  const magnitude = MAGNITUDES.find(({ size }) => Math.abs(value) >= size);
  if (!magnitude) return formatNumber(value);
  // Shift the decimal point on the digits so 1.2m never prints as 1.2000000000000002m.
  const mantissa = Number(`${value}e-${Math.log10(magnitude.size)}`);
  return `${formatNumber(mantissa)}${magnitude.suffix}`;
}

/** Formats with a fixed number of decimal places, grouped: formatFixed(2.5, 2) -> 2.50 */
export function formatFixed(value: number, decimals: number): string {
  return signed(new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value));
}
