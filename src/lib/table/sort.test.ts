import { describe, expect, test } from 'vitest';
import { SORT_DISABLE_THRESHOLD, compareValues, sortRows } from './sort';

describe('compareValues — primitives', () => {
  test('number', () => {
    expect(compareValues(1, 2, 'number')).toBeLessThan(0);
    expect(compareValues(2, 1, 'number')).toBeGreaterThan(0);
    expect(compareValues(1, 1, 'number')).toBe(0);
  });

  test('number — NaN sorts to end', () => {
    expect(compareValues(NaN, 1, 'number')).toBeGreaterThan(0);
    expect(compareValues(1, NaN, 'number')).toBeLessThan(0);
    expect(compareValues(NaN, NaN, 'number')).toBe(0);
  });

  test('string (locale-aware)', () => {
    expect(compareValues('a', 'b', 'string')).toBeLessThan(0);
    expect(compareValues('b', 'a', 'string')).toBeGreaterThan(0);
    expect(compareValues('a', 'a', 'string')).toBe(0);
  });

  test('boolean (false < true)', () => {
    expect(compareValues(false, true, 'boolean')).toBeLessThan(0);
    expect(compareValues(true, false, 'boolean')).toBeGreaterThan(0);
    expect(compareValues(true, true, 'boolean')).toBe(0);
  });

  test("null column → all equal (caller guarantees only null values)", () => {
    expect(compareValues(null, null, 'null')).toBe(0);
  });
});

describe('compareValues — object/array/mixed (stringify-and-compare)', () => {
  test('object compared by JSON.stringify', () => {
    expect(compareValues({ a: 1 }, { a: 2 }, 'object')).toBeLessThan(0);
    expect(compareValues({ a: 1 }, { a: 1 }, 'object')).toBe(0);
  });

  test('array compared by JSON.stringify', () => {
    expect(compareValues([1, 2], [1, 3], 'array')).toBeLessThan(0);
  });

  test('mixed compared by JSON.stringify (lexicographic, not type-aware)', () => {
    // JSON.stringify(1) → "1"; JSON.stringify("1") → '"1"'. The
    // quote char (0x22) sorts before '1' (0x31), so the STRINGIFIED
    // STRING "1" lexicographically beats the STRINGIFIED NUMBER 1.
    // This is the "wrong but not surprising" framing: deterministic,
    // not semantic.
    expect(compareValues(1, '1', 'mixed')).toBeGreaterThan(0);
  });
});

describe('sortRows — null-at-end policy', () => {
  type Row = { v: unknown };
  const get = (r: Row) => r.v;

  test('null values land at the end ascending', () => {
    const rows: Row[] = [{ v: 2 }, { v: null }, { v: 1 }, { v: null }];
    const out = sortRows(rows, get, 'number', 'asc');
    expect(out.map((r) => r.v)).toEqual([1, 2, null, null]);
  });

  test('null values STAY at the end descending (do not flip)', () => {
    const rows: Row[] = [{ v: 2 }, { v: null }, { v: 1 }];
    const out = sortRows(rows, get, 'number', 'desc');
    // Descending flips 2/1 but null still sorts after both
    expect(out.map((r) => r.v)).toEqual([2, 1, null]);
  });

  test('undefined behaves identically to null', () => {
    const rows: Row[] = [{ v: 1 }, { v: undefined }, { v: 2 }];
    const out = sortRows(rows, get, 'number', 'asc');
    expect(out.map((r) => r.v)).toEqual([1, 2, undefined]);
  });

  test('all-null/undefined → stable, no comparator errors', () => {
    const rows: Row[] = [{ v: null }, { v: undefined }, { v: null }];
    const out = sortRows(rows, get, 'number', 'asc');
    expect(out.length).toBe(3);
  });
});

describe('sortRows — direction flips non-null order', () => {
  type Row = { v: unknown };
  const get = (r: Row) => r.v;

  test('ascending strings', () => {
    const rows: Row[] = [{ v: 'c' }, { v: 'a' }, { v: 'b' }];
    expect(sortRows(rows, get, 'string', 'asc').map((r) => r.v)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('descending strings', () => {
    const rows: Row[] = [{ v: 'a' }, { v: 'b' }, { v: 'c' }];
    expect(sortRows(rows, get, 'string', 'desc').map((r) => r.v)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('sortRows — does not mutate input', () => {
  test('input array unchanged after sort', () => {
    const rows = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const before = rows.map((r) => r.v);
    sortRows(rows, (r) => r.v, 'number', 'asc');
    expect(rows.map((r) => r.v)).toEqual(before);
  });
});

describe('SORT_DISABLE_THRESHOLD', () => {
  test('is 10K (the M1 stub-materialization budget)', () => {
    // The TablePane consults this to decide whether to disable
    // header-click sort for stub-backed arrays above the threshold.
    // 10K materializations at ~0.3ms each ≈ 3s total — acceptable
    // one-shot; above that, the wait dominates the interaction.
    expect(SORT_DISABLE_THRESHOLD).toBe(10_000);
  });
});
