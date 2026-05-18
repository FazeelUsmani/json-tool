import { describe, expect, test } from 'vitest';
import { findMatches } from './search';
import { flattenTree } from './flatten';
import { parseToTree, type TreeNode } from './parse';

function flat(text: string) {
  const r = parseToTree(text);
  if (!r.ok) throw new Error('test fixture must be valid JSON');
  return flattenTree(r.root as TreeNode);
}

describe('findMatches', () => {
  test('empty query yields empty matches + empty visibleSet', () => {
    const f = flat('{"a":1}');
    const r = findMatches(f, '');
    expect(r.matchIndices).toEqual([]);
    expect(r.visibleSet.size).toBe(0);
  });

  test('match on key brings in every ancestor', () => {
    // 0: open $        1: open $.user      2: leaf $.user.name
    // 3: close $.user  4: close $
    const f = flat('{"user":{"name":"Alice"}}');
    const r = findMatches(f, 'name');
    expect(r.matchIndices).toEqual([2]);
    // Visible: the match + both ancestors (open rows) + both close rows
    expect([...r.visibleSet].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  test('match on string value', () => {
    const f = flat('{"u":{"name":"Alice"}}');
    const r = findMatches(f, 'alic');
    expect(r.matchIndices).toEqual([2]);
    expect(r.visibleSet.has(2)).toBe(true);
  });

  test('match on number value (stringified)', () => {
    const f = flat('{"port":8080}');
    const r = findMatches(f, '80');
    // The "port" leaf should match because String(8080) contains "80"
    expect(r.matchIndices).toHaveLength(1);
    expect(f[r.matchIndices[0]].id).toBe('$.port');
  });

  test('match on boolean value', () => {
    const f = flat('{"active":true,"inactive":false}');
    const r = findMatches(f, 'true');
    // Only $.active matches: true. $.inactive holds false → no match.
    const ids = r.matchIndices.map((i) => f[i].id);
    expect(ids).toEqual(['$.active']);
  });

  test('null value is NOT matched by literal "null"', () => {
    const f = flat('{"x":null}');
    const r = findMatches(f, 'null');
    // Only the key "x" could match, but it doesn't contain "null".
    expect(r.matchIndices).toEqual([]);
  });

  test('case-insensitive match', () => {
    const f = flat('{"User":"Alice"}');
    const r = findMatches(f, 'USER');
    expect(r.matchIndices).toHaveLength(1);
    expect(f[r.matchIndices[0]].id).toBe('$.User');
  });

  test('two matches in different subtrees both pull in their ancestors', () => {
    // {"a":{"k":1},"b":{"k":2}}
    // 0:$ open, 1:$.a open, 2:$.a.k leaf, 3:$.a close,
    // 4:$.b open, 5:$.b.k leaf, 6:$.b close, 7:$ close
    const f = flat('{"a":{"k":1},"b":{"k":2}}');
    const r = findMatches(f, 'k');
    expect(r.matchIndices.sort((a, b) => a - b)).toEqual([2, 5]);
    // All 8 rows are visible (every row has "k" via the matches' ancestors
    // or is a close row whose open is visible)
    expect(r.visibleSet.size).toBe(8);
  });

  test('zero matches yields empty visibleSet (not the full tree)', () => {
    const f = flat('{"a":1,"b":2}');
    const r = findMatches(f, 'zzz-no-such-thing');
    expect(r.matchIndices).toEqual([]);
    expect(r.visibleSet.size).toBe(0);
  });

  test('close rows are pulled in when their open is visible', () => {
    const f = flat('{"u":{"name":"x"}}');
    const r = findMatches(f, 'name');
    // Indices 3 and 4 are close rows of $.user and $; both should be in
    // visibleSet because their opens (0, 1) are visible.
    expect(r.visibleSet.has(3)).toBe(true);
    expect(r.visibleSet.has(4)).toBe(true);
  });
});
