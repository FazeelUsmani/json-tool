import { describe, expect, test } from 'vitest';
import { previewChildValue, previewFromChildren } from './preview';
import type { TreeNode } from './parse';

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
function num(key: string | null, path: string, value: number): TreeNode {
  return { kind: 'number', key, path, value };
}
function str(key: string | null, path: string, value: string): TreeNode {
  return { kind: 'string', key, path, value };
}
function bool(key: string | null, path: string, value: boolean): TreeNode {
  return { kind: 'boolean', key, path, value };
}
function nul(key: string | null, path: string): TreeNode {
  return { kind: 'null', key, path };
}
function stubObj(key: string, path: string): TreeNode {
  return {
    kind: 'stub-object',
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

  test('composite values collapse to placeholders, not recursive content', () => {
    expect(previewChildValue(obj(null, '$', [num('x', '$.x', 1)]))).toBe(
      '{…}',
    );
    expect(previewChildValue(arr(null, '$', [num('0', '$[0]', 1)]))).toBe(
      '[…]',
    );
  });

  test('stub variants collapse the same as their materialized counterparts', () => {
    expect(previewChildValue(stubObj('a', '$.a'))).toBe('{…}');
    expect(previewChildValue(stubArr('a', '$.a'))).toBe('[…]');
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

  test('nested composites show as `{…}` / `[…]` not recursive content', () => {
    const n = obj(null, '$', [
      str('timestamp', '$.timestamp', '2023-11-14'),
      obj('user', '$.user', [str('id', '$.user.id', 'u_0')]),
      arr('tags', '$.tags', [str('0', '$.tags[0]', 't1')]),
    ]);
    expect(previewFromChildren(n)).toBe(
      '"timestamp":"2023-11-14", "user":{…}, "tags":[…]',
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
