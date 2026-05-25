import { describe, expect, test } from 'vitest';
import { previewChildValue, previewFromChildren } from './preview';
import type { TreeNode } from './parse';

// Composite helpers return the narrowed variant so the calls into
// previewFromChildren type-check without a cast at every call site.
type ObjectNode = Extract<TreeNode, { kind: 'object' }>;
type ArrayNode = Extract<TreeNode, { kind: 'array' }>;

// preview functions inspect kind/value/children only; id-as-path is fine.
function obj(
  key: string | null,
  path: string,
  children: TreeNode[],
): ObjectNode {
  return { kind: 'object', id: path, key, path, children };
}
function arr(
  key: string | null,
  path: string,
  children: TreeNode[],
): ArrayNode {
  return { kind: 'array', id: path, key, path, children };
}
function num(key: string | null, path: string, value: number): TreeNode {
  return { kind: 'number', id: path, key, path, value };
}
function str(key: string | null, path: string, value: string): TreeNode {
  return { kind: 'string', id: path, key, path, value };
}
function bool(key: string | null, path: string, value: boolean): TreeNode {
  return { kind: 'boolean', id: path, key, path, value };
}
function nul(key: string | null, path: string): TreeNode {
  return { kind: 'null', id: path, key, path };
}
function stubObj(key: string, path: string): TreeNode {
  return {
    kind: 'stub-object',
    id: path,
    key,
    path,
    byteStart: 0,
    byteEnd: 1,
    childCount: 0,
    preview: [],
  };
}
function stubArr(key: string, path: string): TreeNode {
  return {
    kind: 'stub-array',
    id: path,
    key,
    path,
    byteStart: 0,
    byteEnd: 1,
    childCount: 0,
    preview: [],
  };
}

describe('previewChildValue', () => {
  test('string is JSON-stringified (preserves quotes + escapes)', () => {
    expect(previewChildValue(str(null, '$', 'hello'))).toBe('"hello"');
    expect(previewChildValue(str(null, '$', 'a"b'))).toBe('"a\\"b"');
  });

  test('number renders bare', () => {
    expect(previewChildValue(num(null, '$', 42))).toBe('42');
    expect(previewChildValue(num(null, '$', -1.5))).toBe('-1.5');
  });

  test('boolean renders as true/false', () => {
    expect(previewChildValue(bool(null, '$', true))).toBe('true');
    expect(previewChildValue(bool(null, '$', false))).toBe('false');
  });

  test('null renders as null', () => {
    expect(previewChildValue(nul(null, '$'))).toBe('null');
  });

  test('object at depth 0 collapses to placeholder (no recurse into object)', () => {
    expect(previewChildValue(obj(null, '$', [num('x', '$.x', 1)]))).toBe(
      '{…}',
    );
  });

  test('array at depth 0 recurses one level into its elements', () => {
    // Array of primitives renders the values directly.
    expect(previewChildValue(arr(null, '$', [num('0', '$[0]', 1)]))).toBe(
      '[1]',
    );
    expect(
      previewChildValue(
        arr(null, '$', [
          num('0', '$[0]', 1),
          num('1', '$[1]', 2),
          num('2', '$[2]', 3),
        ]),
      ),
    ).toBe('[1, 2, 3]');
  });

  test('array of objects recurses into each element showing first KV', () => {
    // The headline use case for the recursion: 900K array elements that
    // would render as `[{…}, {…}, …]` before, now show first key.
    const n = arr(null, '$', [
      obj('0', '$[0]', [
        num('id', '$[0].id', 0),
        str('name', '$[0].name', 'click'),
      ]),
      obj('1', '$[1]', [num('id', '$[1].id', 1)]),
    ]);
    // First object inside the array shows "id":0 + ", …" because it has
    // two children (id + name). Second has one child so no trailing dots.
    expect(previewChildValue(n)).toBe('[{"id":0, …}, {"id":1}]');
  });

  test('array recursion caps at 3 elements with trailing ellipsis', () => {
    const n = arr(null, '$', [
      num('0', '$[0]', 1),
      num('1', '$[1]', 2),
      num('2', '$[2]', 3),
      num('3', '$[3]', 4),
      num('4', '$[4]', 5),
    ]);
    expect(previewChildValue(n)).toBe('[1, 2, 3, …]');
  });

  test('deeply nested arrays do not run away — depth-2 collapses to `[…]`', () => {
    // Array of arrays: outer recurses (depth 0 → 1); inner doesn't
    // (depth 1 already inside an array).
    const inner = arr('0', '$[0]', [num('0', '$[0][0]', 1)]);
    const outer = arr(null, '$', [inner]);
    expect(previewChildValue(outer)).toBe('[[…]]');
  });

  test('empty array / empty object stay as `[]` / `{…}`', () => {
    expect(previewChildValue(arr(null, '$', []))).toBe('[…]');
    expect(previewChildValue(obj(null, '$', []))).toBe('{…}');
  });

  test('stub variants always collapse regardless of array context', () => {
    expect(previewChildValue(stubObj('a', '$.a'))).toBe('{…}');
    expect(previewChildValue(stubArr('a', '$.a'))).toBe('[…]');
    // Even inside an outer array recursion, the stub child stays shorthand.
    const arrWithStub = arr(null, '$', [stubObj('0', '$[0]')]);
    expect(previewChildValue(arrWithStub)).toBe('[{…}]');
  });
});

describe('previewFromChildren', () => {
  test('empty object → empty string (caller renders the `{}` shell)', () => {
    expect(previewFromChildren(obj(null, '$', []))).toBe('');
  });

  test('object renders "key":value pairs', () => {
    const n = obj(null, '$', [
      num('id', '$.id', 1),
      str('name', '$.name', 'click'),
    ]);
    expect(previewFromChildren(n)).toBe('"id":1, "name":"click"');
  });

  test('array renders bare values (no keys)', () => {
    const n = arr(null, '$', [
      num('0', '$[0]', 10),
      num('1', '$[1]', 20),
      num('2', '$[2]', 30),
    ]);
    expect(previewFromChildren(n)).toBe('10, 20, 30');
  });

  test('caps at 3 children regardless of object size', () => {
    const n = obj(null, '$', [
      num('a', '$.a', 1),
      num('b', '$.b', 2),
      num('c', '$.c', 3),
      num('d', '$.d', 4),
      num('e', '$.e', 5),
    ]);
    expect(previewFromChildren(n)).toBe('"a":1, "b":2, "c":3');
  });

  test('nested objects show as `{…}`; nested arrays recurse one level', () => {
    // The previewChildValue rule: object values stay shorthand,
    // arrays show their first elements. So a top-level object containing
    // both renders the array's content but not the object's.
    const n = obj(null, '$', [
      str('timestamp', '$.timestamp', '2023-11-14'),
      obj('user', '$.user', [str('id', '$.user.id', 'u_0')]),
      arr('tags', '$.tags', [
        str('0', '$.tags[0]', 't1'),
        str('1', '$.tags[1]', 't2'),
      ]),
    ]);
    expect(previewFromChildren(n)).toBe(
      '"timestamp":"2023-11-14", "user":{…}, "tags":["t1", "t2"]',
    );
  });

  test('escaped quotes in string values round-trip through JSON.stringify', () => {
    const n = obj(null, '$', [str('msg', '$.msg', 'has "quotes"')]);
    expect(previewFromChildren(n)).toBe('"msg":"has \\"quotes\\""');
  });

  test('stub children inside a materialized composite collapse to {…}/[…]', () => {
    const n = obj(null, '$', [
      stubObj('event', '$.event'),
      stubArr('tags', '$.tags'),
    ]);
    expect(previewFromChildren(n)).toBe('"event":{…}, "tags":[…]');
  });

  test('null and boolean children render correctly mixed', () => {
    const n = obj(null, '$', [
      nul('ref', '$.ref'),
      bool('flag', '$.flag', true),
    ]);
    expect(previewFromChildren(n)).toBe('"ref":null, "flag":true');
  });
});
