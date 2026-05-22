import { describe, expect, test } from 'vitest';
import { findPrimaryArray } from './primaryArray';
import type { TreeNode } from '@/lib/tree/parse';

function arr(key: string | null, path: string, children: TreeNode[]): TreeNode {
  return { kind: 'array', key, path, children };
}
function obj(key: string | null, path: string, children: TreeNode[]): TreeNode {
  return { kind: 'object', key, path, children };
}
function num(key: string | null, path: string): TreeNode {
  return { kind: 'number', key, path, value: 1 };
}

describe('findPrimaryArray', () => {
  test('null root → null', () => {
    expect(findPrimaryArray(null)).toBeNull();
  });

  test('root is array → return as-is with path "$"', () => {
    const root = arr(null, '$', []);
    expect(findPrimaryArray(root)).toEqual({ node: root, path: '$' });
  });

  test('root primitive → null (no array)', () => {
    expect(findPrimaryArray(num(null, '$'))).toBeNull();
  });

  test('root object with one array child → that array', () => {
    const events = arr('events', '$.events', [num('0', '$.events[0]')]);
    const root = obj(null, '$', [events]);
    expect(findPrimaryArray(root)).toEqual({
      node: events,
      path: '$.events',
    });
  });

  test('root object with multiple arrays → picks the largest by child count', () => {
    const small = arr('small', '$.small', [num('0', '$.small[0]')]);
    const big = arr(
      'big',
      '$.big',
      Array.from({ length: 5 }, (_, i) => num(`${i}`, `$.big[${i}]`)),
    );
    const root = obj(null, '$', [small, big]);
    const result = findPrimaryArray(root);
    expect(result?.path).toBe('$.big');
  });

  test('root object with tied-size arrays → first encountered wins', () => {
    const a = arr('a', '$.a', [num('0', '$.a[0]')]);
    const b = arr('b', '$.b', [num('0', '$.b[0]')]);
    const root = obj(null, '$', [a, b]);
    expect(findPrimaryArray(root)?.path).toBe('$.a');
  });

  test('root object with no array children → null', () => {
    const root = obj(null, '$', [
      num('a', '$.a'),
      obj('nested', '$.nested', [num('x', '$.nested.x')]),
    ]);
    expect(findPrimaryArray(root)).toBeNull();
  });

  test('root object with array nested deeper than direct children → null (depth 1 only)', () => {
    // The helper only looks at direct children of the root object,
    // not arbitrarily nested arrays. Deep-array support is deferred
    // until users actually ask for it.
    const deep = obj('outer', '$.outer', [
      arr('inner', '$.outer.inner', [num('0', '$.outer.inner[0]')]),
    ]);
    const root = obj(null, '$', [deep]);
    expect(findPrimaryArray(root)).toBeNull();
  });

  test('empty arrays are still considered (size 0 ties)', () => {
    const a = arr('a', '$.a', []);
    const root = obj(null, '$', [a]);
    expect(findPrimaryArray(root)).toEqual({ node: a, path: '$.a' });
  });

  test('mixed children: array + object + primitive → array wins', () => {
    const events = arr(
      'events',
      '$.events',
      Array.from({ length: 3 }, (_, i) => num(`${i}`, `$.events[${i}]`)),
    );
    const root = obj(null, '$', [
      num('count', '$.count'),
      obj('metadata', '$.metadata', [num('version', '$.metadata.version')]),
      events,
    ]);
    expect(findPrimaryArray(root)?.path).toBe('$.events');
  });
});
