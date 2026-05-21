import { describe, expect, test } from 'vitest';
import { spliceSubtree } from './splice';
import type { TreeNode } from './parse';

function leaf(key: string | null, path: string, value: number): TreeNode {
  return { kind: 'number', key, path, value };
}
function obj(
  key: string | null,
  path: string,
  children: TreeNode[],
): TreeNode {
  return { kind: 'object', key, path, children };
}
function arr(
  key: string | null,
  path: string,
  children: TreeNode[],
): TreeNode {
  return { kind: 'array', key, path, children };
}
function stub(key: string, path: string): TreeNode {
  return {
    kind: 'stub-object',
    key,
    path,
    byteStart: 0,
    byteEnd: 10,
    childCount: 0,
    preview: [],
  };
}

describe('spliceSubtree', () => {
  test('replaces root when atPath === root.path', () => {
    const before = obj(null, '$', [leaf('a', '$.a', 1)]);
    const after = obj(null, '$', [leaf('b', '$.b', 2)]);
    const result = spliceSubtree(before, '$', after);
    expect(result).toBe(after);
  });

  test('replaces a nested object child by path', () => {
    const target = stub('inner', '$.outer.inner');
    const materialized = obj('inner', '$.outer.inner', [
      leaf('x', '$.outer.inner.x', 42),
    ]);
    const root = obj(null, '$', [obj('outer', '$.outer', [target])]);
    const result = spliceSubtree(root, '$.outer.inner', materialized);
    if (result.kind !== 'object') throw new Error('unreachable');
    const outer = result.children[0];
    if (outer.kind !== 'object') throw new Error('unreachable');
    expect(outer.children[0]).toBe(materialized);
  });

  test('replaces an array element by index path', () => {
    const target = stub('0', '$.users[0]');
    const materialized = obj('0', '$.users[0]', [
      leaf('id', '$.users[0].id', 1),
    ]);
    const sibling = leaf('1', '$.users[1]', 2);
    const root = obj(null, '$', [arr('users', '$.users', [target, sibling])]);
    const result = spliceSubtree(root, '$.users[0]', materialized);
    if (result.kind !== 'object') throw new Error('unreachable');
    const users = result.children[0];
    if (users.kind !== 'array') throw new Error('unreachable');
    expect(users.children[0]).toBe(materialized);
    // Sibling reference must be preserved — structural sharing invariant.
    expect(users.children[1]).toBe(sibling);
  });

  test('structural sharing: unchanged sibling subtrees keep identity', () => {
    const targetStub = stub('inner', '$.a.inner');
    const replacement = obj('inner', '$.a.inner', []);
    const untouchedB = obj('b', '$.b', [
      leaf('x', '$.b.x', 1),
      leaf('y', '$.b.y', 2),
    ]);
    const untouchedC = arr('c', '$.c', [leaf('0', '$.c[0]', 9)]);
    const root = obj(null, '$', [
      obj('a', '$.a', [targetStub]),
      untouchedB,
      untouchedC,
    ]);
    const result = spliceSubtree(root, '$.a.inner', replacement);
    if (result.kind !== 'object') throw new Error('unreachable');
    if (root.kind !== 'object') throw new Error('unreachable');
    // Path to spliced node gets new identities.
    expect(result).not.toBe(root);
    expect(result.children[0]).not.toBe(root.children[0]);
    // Untouched siblings keep their references.
    expect(result.children[1]).toBe(untouchedB);
    expect(result.children[2]).toBe(untouchedC);
  });

  test('replaces ndjson-line with primitive while preserving the line index', () => {
    // NDJSON v2 in-place expansion: a line whose content is `42` parses
    // to a primitive TreeNode with key:null. spliceSubtree must restore
    // the array index ("7") so the row continues to render as `[7]: 42`
    // instead of dropping the index label.
    const line: TreeNode = {
      kind: 'ndjson-line',
      key: '7',
      path: '$[7]',
      byteStart: 0,
      byteEnd: 2,
    };
    const replacement: TreeNode = {
      kind: 'number',
      key: null,
      path: '$[7]',
      value: 42,
    };
    const root = arr(null, '$', [line]);
    const result = spliceSubtree(root, '$[7]', replacement);
    if (result.kind !== 'array') throw new Error('unreachable');
    const child = result.children[0];
    expect(child.kind).toBe('number');
    expect(child.key).toBe('7');
    expect(child.path).toBe('$[7]');
    if (child.kind === 'number') expect(child.value).toBe(42);
  });

  test('replaces ndjson-line with materialized object', () => {
    // Composite expansion path: line content `{"a":1}` produces an object
    // root that replaces the ndjson-line.
    const line: TreeNode = {
      kind: 'ndjson-line',
      key: '0',
      path: '$[0]',
      byteStart: 0,
      byteEnd: 7,
    };
    const replacement = obj(null, '$[0]', [
      leaf('a', '$[0].a', 1),
    ]);
    const root = arr(null, '$', [line]);
    const result = spliceSubtree(root, '$[0]', replacement);
    if (result.kind !== 'array') throw new Error('unreachable');
    const child = result.children[0];
    if (child.kind !== 'object') throw new Error('unreachable');
    expect(child.key).toBe('0');
    expect(child.path).toBe('$[0]');
    expect(child.children).toHaveLength(1);
  });

  test('preserves original key when replacement has key:null', () => {
    // Regression for the W3-Wed bug where expanding then collapsing an
    // array-element stub dropped its index label: worker's expandStub
    // returns a root with key:null (parsed in isolation via basePath),
    // and splice was returning it directly. Result: `[41746]: { … }`
    // collapsed to a keyless `{ … }` after expand→collapse.
    const stubAt0 = stub('0', '$.events[0]');
    const workerReply = obj(null, '$.events[0]', [
      leaf('id', '$.events[0].id', 1),
    ]);
    const root = obj(null, '$', [arr('events', '$.events', [stubAt0])]);
    const result = spliceSubtree(root, '$.events[0]', workerReply);
    if (result.kind !== 'object') throw new Error('unreachable');
    const events = result.children[0];
    if (events.kind !== 'array') throw new Error('unreachable');
    expect(events.children[0].key).toBe('0');
  });

  test('missing path returns root unchanged (no error)', () => {
    const root = obj(null, '$', [leaf('a', '$.a', 1)]);
    const result = spliceSubtree(root, '$.nonexistent', obj('x', '$.x', []));
    expect(result).toBe(root);
  });

  test('atPath outside root scope short-circuits without walking', () => {
    // root is $.users — atPath $.other is unrelated. The early-out path
    // prefix check should detect this and return root directly without
    // recursing into children.
    const root = arr('users', '$.users', [
      leaf('0', '$.users[0]', 1),
      leaf('1', '$.users[1]', 2),
    ]);
    const result = spliceSubtree(root, '$.other', obj('x', '$.x', []));
    expect(result).toBe(root);
  });
});
