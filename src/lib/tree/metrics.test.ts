import { describe, expect, test } from 'vitest';
import { computeSpineMetrics } from './metrics';
import type { TreeNode } from './parse';

function obj(children: TreeNode[]): TreeNode {
  return { kind: 'object', key: null, path: '$', children };
}
function arr(children: TreeNode[]): TreeNode {
  return { kind: 'array', key: null, path: '$', children };
}
function num(): TreeNode {
  return { kind: 'number', key: null, path: '$', value: 1 };
}
function str(): TreeNode {
  return { kind: 'string', key: null, path: '$', value: 'a' };
}
function nullNode(): TreeNode {
  return { kind: 'null', key: null, path: '$' };
}
function stubObj(): TreeNode {
  return {
    kind: 'stub-object',
    key: null,
    path: '$',
    byteStart: 0,
    byteEnd: 1,
    childCount: 0,
    preview: [],
  };
}
function stubArr(): TreeNode {
  return {
    kind: 'stub-array',
    key: null,
    path: '$',
    byteStart: 0,
    byteEnd: 1,
    childCount: 0,
    preview: [],
  };
}
function line(): TreeNode {
  return { kind: 'ndjson-line', key: null, path: '$', byteStart: 0, byteEnd: 1 };
}

describe('computeSpineMetrics', () => {
  test('null root → all zeros', () => {
    expect(computeSpineMetrics(null)).toEqual({
      spineCount: 0,
      stubCount: 0,
      leafCount: 0,
      ndjsonLineCount: 0,
    });
  });

  test('single leaf root → 1 leaf, no composites', () => {
    expect(computeSpineMetrics(num())).toEqual({
      spineCount: 0,
      stubCount: 0,
      leafCount: 1,
      ndjsonLineCount: 0,
    });
  });

  test('object with mixed children counts each kind once', () => {
    const root = obj([
      num(),
      str(),
      nullNode(),
      stubObj(),
      stubArr(),
      arr([num(), num()]),
    ]);
    expect(computeSpineMetrics(root)).toEqual({
      // root object + inner array = 2 composites
      spineCount: 2,
      stubCount: 2,
      // 3 primitives at top level + 2 in inner array = 5 leaves
      leafCount: 5,
      ndjsonLineCount: 0,
    });
  });

  test('NDJSON shape (array of ndjson-line) → spineCount=1, ndjsonLineCount=N', () => {
    const root = arr([line(), line(), line(), line()]);
    expect(computeSpineMetrics(root)).toEqual({
      spineCount: 1,
      stubCount: 0,
      leafCount: 0,
      ndjsonLineCount: 4,
    });
  });

  test('deeply nested objects do not stack-overflow (iterative walk)', () => {
    // Build a 5000-deep chain { "next": { "next": { ... } } }
    let inner: TreeNode = num();
    const depth = 5000;
    for (let i = 0; i < depth; i++) {
      inner = obj([inner]);
    }
    const result = computeSpineMetrics(inner);
    expect(result.spineCount).toBe(depth);
    expect(result.leafCount).toBe(1);
  });

  test('empty composites still count as spine', () => {
    expect(computeSpineMetrics(obj([]))).toEqual({
      spineCount: 1,
      stubCount: 0,
      leafCount: 0,
      ndjsonLineCount: 0,
    });
    expect(computeSpineMetrics(arr([]))).toEqual({
      spineCount: 1,
      stubCount: 0,
      leafCount: 0,
      ndjsonLineCount: 0,
    });
  });

  test('stub variants do not recurse — childCount metadata is ignored', () => {
    // Stubs don't materialize children even when childCount > 0.
    const stubWithCount: TreeNode = {
      kind: 'stub-array',
      key: null,
      path: '$',
      byteStart: 0,
      byteEnd: 100,
      childCount: 1_000_000,
      preview: [],
    };
    expect(computeSpineMetrics(stubWithCount)).toEqual({
      spineCount: 0,
      stubCount: 1,
      leafCount: 0,
      ndjsonLineCount: 0,
    });
  });
});
