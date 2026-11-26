/** Local calendar day as YYYY-MM-DD: what an answer or session records as its day. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Whole days since an arbitrary epoch, on the local calendar (safe across clock changes). */
export function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** The day number of a YYYY-MM-DD day. */
export function dayNumberOf(day: string): number {
  return Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000);
}

/** The local day a record belongs to: the one stored when it was recorded, else read from its timestamp here. */
export function recordDay(record: { day?: string | undefined }, iso: string): string {
  return record.day ?? localDay(new Date(iso));
}
