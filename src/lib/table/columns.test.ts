import { describe, expect, test } from 'vitest';
import {
  COLUMN_SAMPLE_SIZE,
  VALUE_COLUMN_KEY,
  deriveColumns,
} from './columns';

describe('deriveColumns — empty + edge cases', () => {
  test('empty array → no columns', () => {
    expect(deriveColumns([])).toEqual([]);
  });

  test('single object → columns from its keys', () => {
    expect(deriveColumns([{ a: 1, b: 'x' }])).toEqual([
      { key: 'a', type: 'number' },
      { key: 'b', type: 'string' },
    ]);
  });

  test('sample size caps the walk', () => {
    // 200 rows; only the first 100 contribute to column derivation.
    // Row 100+ has a new key 'late' that should NOT appear because
    // it's beyond the sample window.
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 100; i++) rows.push({ a: i });
    for (let i = 0; i < 100; i++) rows.push({ a: i, late: 'extra' });
    const cols = deriveColumns(rows);
    expect(cols.map((c) => c.key)).toEqual(['a']);
  });

  test('custom sampleSize argument', () => {
    const rows: Array<Record<string, unknown>> = [];
    rows.push({ a: 1 });
    rows.push({ b: 2 });
    expect(deriveColumns(rows, 1)).toEqual([{ key: 'a', type: 'number' }]);
    expect(deriveColumns(rows, 2)).toEqual([
      { key: 'a', type: 'number' },
      { key: 'b', type: 'number' },
    ]);
  });
});

describe('deriveColumns — array of objects (canonical case)', () => {
  test('homogeneous shape → columns match keys in first-encounter order', () => {
    const rows = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ];
    expect(deriveColumns(rows)).toEqual([
      { key: 'id', type: 'number' },
      { key: 'name', type: 'string' },
    ]);
  });

  test('missing key on later row → column still derived, type unchanged', () => {
    const rows = [
      { id: 1, name: 'a' },
      { id: 2 }, // no name
    ];
    expect(deriveColumns(rows)).toEqual([
      { key: 'id', type: 'number' },
      { key: 'name', type: 'string' },
    ]);
  });

  test('new key introduced in later row → appears at end of column list', () => {
    const rows = [
      { id: 1 },
      { id: 2, extra: 'late' },
    ];
    expect(deriveColumns(rows)).toEqual([
      { key: 'id', type: 'number' },
      { key: 'extra', type: 'string' },
    ]);
  });
});

describe('deriveColumns — type collapse rules', () => {
  test('all values same type → that type', () => {
    expect(deriveColumns([{ a: 1 }, { a: 2 }])).toEqual([
      { key: 'a', type: 'number' },
    ]);
  });

  test('null + primitive → primitive (nullable-as-primitive)', () => {
    expect(deriveColumns([{ a: 1 }, { a: null }])).toEqual([
      { key: 'a', type: 'number' },
    ]);
    expect(deriveColumns([{ a: 'hi' }, { a: null }])).toEqual([
      { key: 'a', type: 'string' },
    ]);
  });

  test('mixed primitives → mixed', () => {
    expect(deriveColumns([{ a: 1 }, { a: 'hi' }])).toEqual([
      { key: 'a', type: 'mixed' },
    ]);
  });

  test('all-null column → null', () => {
    expect(deriveColumns([{ a: null }, { a: null }])).toEqual([
      { key: 'a', type: 'null' },
    ]);
  });

  test('object-valued column', () => {
    expect(deriveColumns([{ a: { x: 1 } }])).toEqual([
      { key: 'a', type: 'object' },
    ]);
  });

  test('array-valued column', () => {
    expect(deriveColumns([{ a: [1, 2, 3] }])).toEqual([
      { key: 'a', type: 'array' },
    ]);
  });

  test('three distinct primitive types → mixed', () => {
    expect(deriveColumns([{ a: 1 }, { a: 'x' }, { a: true }])).toEqual([
      { key: 'a', type: 'mixed' },
    ]);
  });
});

describe('deriveColumns — non-object arrays fall back to single column', () => {
  test('array of primitives → single value column', () => {
    expect(deriveColumns([1, 2, 3])).toEqual([
      { key: VALUE_COLUMN_KEY, type: 'number' },
    ]);
  });

  test('array of mixed primitives → mixed value column', () => {
    expect(deriveColumns([1, 'two', true])).toEqual([
      { key: VALUE_COLUMN_KEY, type: 'mixed' },
    ]);
  });

  test('array of arrays → single array column (nested arrays not split)', () => {
    expect(deriveColumns([[1, 2], [3, 4]])).toEqual([
      { key: VALUE_COLUMN_KEY, type: 'array' },
    ]);
  });

  test('any null in the array → falls to single value column', () => {
    // null isn't a plain object, so the "all plain objects" check
    // fails, and we drop to the single-column branch. {object, null}
    // collapses to 'object' per the nullable-as-primitive rule.
    expect(deriveColumns([{ a: 1 }, null])).toEqual([
      { key: VALUE_COLUMN_KEY, type: 'object' },
    ]);
  });

  test('mixed-shape non-object array → single mixed column', () => {
    // Distinguish from the null-collapses case: when the values
    // aren't reducible to "X + nullable", the column is mixed.
    expect(deriveColumns([1, 'two'])).toEqual([
      { key: VALUE_COLUMN_KEY, type: 'mixed' },
    ]);
  });
});

describe('deriveColumns — prototype safety', () => {
  test('own properties only — no inherited keys leak in', () => {
    const proto = { inherited: 'should-not-appear' };
    const row = Object.create(proto);
    row.own = 'visible';
    expect(deriveColumns([row]).map((c) => c.key)).toEqual(['own']);
  });
});

describe('deriveColumns — defaults', () => {
  test('COLUMN_SAMPLE_SIZE is 100 (matches quicktype default)', () => {
    expect(COLUMN_SAMPLE_SIZE).toBe(100);
  });
});
