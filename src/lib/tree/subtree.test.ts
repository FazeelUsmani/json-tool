import { describe, expect, test } from 'vitest';
import { reconstructJson } from './subtree';
import { parseToTree, type TreeNode } from './parse';

function parse(text: string): TreeNode {
  const r = parseToTree(text);
  if (!r.ok) throw new Error('test fixture must be valid JSON');
  return r.root;
}

describe('reconstructJson', () => {
  test('primitive at root', () => {
    expect(reconstructJson(parse('42'))).toBe(42);
    expect(reconstructJson(parse('"hi"'))).toBe('hi');
    expect(reconstructJson(parse('null'))).toBe(null);
    expect(reconstructJson(parse('true'))).toBe(true);
  });

  test('flat object preserves keys + values + insertion order', () => {
    const v = reconstructJson(parse('{"b":1,"a":2}'));
    expect(v).toEqual({ b: 1, a: 2 });
    expect(Object.keys(v as object)).toEqual(['b', 'a']);
  });

  test('array preserves element order', () => {
    expect(reconstructJson(parse('[3,1,2]'))).toEqual([3, 1, 2]);
  });

  test('nested mixed structure round-trips', () => {
    const json = '{"u":[{"id":1},{"id":2,"tags":["x","y"]}],"n":null}';
    expect(JSON.stringify(reconstructJson(parse(json)))).toBe(json);
  });

  test('empty object returns {}', () => {
    expect(reconstructJson(parse('{}'))).toEqual({});
  });

  test('empty array returns []', () => {
    expect(reconstructJson(parse('[]'))).toEqual([]);
  });
});
