// Type-aware sort for the table view.
//
// Two responsibilities:
//   1. `compareValues(a, b, type)` — pure comparator, returns the
//      usual -1 / 0 / +1 contract. Caller must pre-filter null/
//      undefined; this helper assumes both arguments are present.
//   2. `sortRows(rows, getValue, type, direction)` — does the
//      `null-at-end-regardless-of-direction` policy + direction
//      flip + array clone, then delegates to `compareValues` for
//      non-null pairs.
//
// Null policy: null and undefined always sort to the end, whether
// ascending or descending. Descending flips the order of present
// values but null stays where it is. Matches the principle that
// "missing data" is its own category — flipping direction shouldn't
// turn missing into the new top.
//
// Mixed / object / array columns sort by `JSON.stringify` lexicographic
// compare. "Wrong but not surprising" — same shape gives same string,
// so the result is at least deterministic. A real semantic compare
// for object columns is out of M1 scope.
//
// `SORT_DISABLE_THRESHOLD` is the row-count above which the TablePane
// disables sort entirely for stub-backed arrays (sorting requires
// materializing every stub, which at 2.25M rows = tens of seconds +
// hundreds of MB transient memory). Lives here because it's part of
// the sort contract — every caller respecting it keeps the UX honest.

import type { ColumnType } from './columns';

export type SortDirection = 'asc' | 'desc';

// Above this row count, TablePane disables sort if the underlying
// data is stub-backed. Below this, even a 10K materialize-all is a
// few-second one-shot at worst — acceptable for a one-time sort
// click.
export const SORT_DISABLE_THRESHOLD = 10_000;

export function compareValues(a: unknown, b: unknown, type: ColumnType): number {
  // Caller is responsible for null/undefined filtering — see sortRows.
  switch (type) {
    case 'number': {
      const na = a as number;
      const nb = b as number;
      // NaN handling: push NaN to the end, same policy as null.
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    }
    case 'string':
      return (a as string).localeCompare(b as string);
    case 'boolean':
      // false (0) < true (1)
      return Number(a) - Number(b);
    case 'object':
    case 'array':
    case 'mixed':
      // Deterministic but semantically loose — same shape produces
      // same string so order is stable across calls.
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    case 'null':
      // All values in a 'null' column are null; equal-by-definition.
      return 0;
  }
}

export function sortRows<T>(
  rows: ReadonlyArray<T>,
  getValue: (row: T) => unknown,
  type: ColumnType,
  direction: SortDirection,
): T[] {
  const out = [...rows];
  const sign = direction === 'asc' ? 1 : -1;
  out.sort((ra, rb) => {
    const a = getValue(ra);
    const b = getValue(rb);
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1; // null/undefined always at end
    if (bMissing) return -1;
    return sign * compareValues(a, b, type);
  });
  return out;
}
