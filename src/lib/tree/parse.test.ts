import { describe, expect, test } from 'vitest';
import { parseToTree, type TreeNode } from './parse';

function asObject(node: TreeNode) {
  if (node.kind !== 'object') throw new Error('expected object node');
  return node;
}
function asArray(node: TreeNode) {
  if (node.kind !== 'array') throw new Error('expected array node');
  return node;
}

describe('parseToTree', () => {
  test('flat object', () => {
    const result = parseToTree('{"name":"Alice","age":30}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = asObject(result.root);
    expect(root.path).toBe('$');
    expect(root.children.map((c) => c.key)).toEqual(['name', 'age']);
    expect(root.children[0]).toMatchObject({
      kind: 'string',
      key: 'name',
      path: '$.name',
      value: 'Alice',
    });
    expect(root.children[1]).toMatchObject({
      kind: 'number',
      key: 'age',
      path: '$.age',
      value: 30,
    });
  });

  test('nested object propagates paths', () => {
    const result = parseToTree('{"user":{"name":"Bob"}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const user = asObject(asObject(result.root).children[0]);
    expect(user.path).toBe('$.user');
    expect(user.children[0]).toMatchObject({
      kind: 'string',
      path: '$.user.name',
      value: 'Bob',
    });
  });

  test('array of objects with bracketed indices', () => {
    const result = parseToTree('[{"id":1},{"id":2}]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = asArray(result.root);
    expect(root.children).toHaveLength(2);
    expect(root.children[0].path).toBe('$[0]');
    expect(root.children[1].path).toBe('$[1]');
    const firstId = asObject(root.children[0]).children[0];
    expect(firstId.path).toBe('$[0].id');
  });

  test('top-level primitives are valid roots', () => {
    expect(parseToTree('42')).toMatchObject({
      ok: true,
      root: { kind: 'number', key: null, value: 42 },
    });
    expect(parseToTree('"hi"')).toMatchObject({
      ok: true,
      root: { kind: 'string', value: 'hi' },
    });
    expect(parseToTree('null')).toMatchObject({
      ok: true,
      root: { kind: 'null' },
    });
    expect(parseToTree('true')).toMatchObject({
      ok: true,
      root: { kind: 'boolean', value: true },
    });
  });

  test('empty input is an error', () => {
    const result = parseToTree('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/empty/i);
  });

  test('invalid JSON returns error with line + col where extractable', () => {
    // Trailing-comma case — V8 emits position info for this on current Node.
    // (Inputs like '{"a":,}' get a position-less "Unexpected token" message,
    // and we surface that as `message` only.)
    const result = parseToTree('{"a":1,}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.line ?? result.error.col).toBeDefined();
  });

  test('mixed nested structure paths', () => {
    const result = parseToTree('{"a":[1,{"b":true}]}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = asArray(asObject(result.root).children[0]);
    expect(a.path).toBe('$.a');
    expect(a.children[0].path).toBe('$.a[0]');
    const inner = asObject(a.children[1]);
    expect(inner.path).toBe('$.a[1]');
    expect(inner.children[0].path).toBe('$.a[1].b');
    expect(inner.children[0]).toMatchObject({
      kind: 'boolean',
      value: true,
    });
  });
});
