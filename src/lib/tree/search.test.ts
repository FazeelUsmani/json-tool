import { describe, expect, test } from 'vitest';
import {
  asciiCaseInsensitiveIncludes,
  collectStubRanges,
  findMatches,
} from './search';
import { flattenTree } from './flatten';
import { parseToTree, type TreeNode } from './parse';

function flat(text: string) {
  const r = parseToTree(text);
  if (!r.ok) throw new Error('test fixture must be valid JSON');
  return flattenTree(r.root as TreeNode);
}

// Synthesizes a tree shaped like the streaming parser's output: a root
// composite whose children are stubs / ndjson-lines. Used by the
// deep-search tests below so they don't depend on parseStreaming.
function tree(children: TreeNode[]): TreeNode {
  return { kind: 'array', id: '$', key: null, path: '$', children };
}
function stubObj(idx: number, byteStart: number, byteEnd: number): TreeNode {
  return {
    kind: 'stub-object',
    id: `$[${idx}]`,
    key: String(idx),
    path: `$[${idx}]`,
    byteStart,
    byteEnd,
    childCount: 0,
    preview: [],
  };
}
function ndjsonLine(idx: number, byteStart: number, byteEnd: number): TreeNode {
  return {
    kind: 'ndjson-line',
    id: `$[${idx}]`,
    key: String(idx),
    path: `$[${idx}]`,
    byteStart,
    byteEnd,
  };
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
    expect(f[r.matchIndices[0]].id).toBe('/port');
  });

  test('match on boolean value', () => {
    const f = flat('{"active":true,"inactive":false}');
    const r = findMatches(f, 'true');
    // Only /active matches: true. /inactive holds false → no match.
    const ids = r.matchIndices.map((i) => f[i].id);
    expect(ids).toEqual(['/active']);
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
    expect(f[r.matchIndices[0]].id).toBe('/User');
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

  test('stubSearchMatches surfaces stub-row content matches in matchIndices', () => {
    // Synthesize a flat row array where one row is a stub. The sync key/
    // value matcher misses content inside the stub; the deep-search Set
    // bridges that.
    const root = tree([stubObj(0, 10, 50), stubObj(1, 60, 100)]);
    const f = flattenTree(root);
    // Sanity: stub rows have kind:'stub' in the flat array.
    expect(f.find((r) => r.id === '$[0]')?.kind).toBe('stub');
    // Without deep set: no match for "rare-content" (not in any key).
    const empty = findMatches(f, 'rare-content');
    expect(empty.matchIndices).toEqual([]);
    // With deep set including $[1]'s path: that row becomes a match
    // and its ancestor ($) is pulled into visibleSet.
    const deep = findMatches(f, 'rare-content', new Set(['$[1]']));
    expect(deep.matchIndices).toHaveLength(1);
    expect(f[deep.matchIndices[0]].id).toBe('$[1]');
    expect(deep.visibleSet.has(0)).toBe(true); // root open
  });

  test('stubSearchMatches also covers ndjson-line rows', () => {
    const root = tree([ndjsonLine(0, 0, 10), ndjsonLine(1, 11, 20)]);
    const f = flattenTree(root);
    expect(f.find((r) => r.id === '$[1]')?.kind).toBe('line');
    const deep = findMatches(f, 'x', new Set(['$[1]']));
    expect(deep.matchIndices.map((i) => f[i].id)).toEqual(['$[1]']);
  });

  test('stubSearchMatches unions with sync key/leaf matches without duplicates', () => {
    // Tree where `$[0]` matches via the deep set AND `$[1]`'s key would
    // sync-match a numeric needle. Both should appear exactly once.
    const root = tree([stubObj(0, 10, 50), stubObj(1, 60, 100)]);
    const f = flattenTree(root);
    // Needle "1" matches the key "1" on $[1] (sync). The deep set adds
    // $[0]. Result: 2 distinct matches.
    const deep = findMatches(f, '1', new Set(['$[0]']));
    const ids = deep.matchIndices.map((i) => f[i].id).sort();
    expect(ids).toEqual(['$[0]', '$[1]']);
  });

  test('match on composite open row pulls in its entire subtree', () => {
    // 0:$ open, 1:$.meta open, 2:$.meta.tags open, 3:$.meta.tags[0] leaf,
    // 4:$.meta.tags close, 5:$.meta.score leaf, 6:$.meta close, 7:$ close
    const f = flat('{"meta":{"tags":["a"],"score":1}}');
    const r = findMatches(f, 'meta');
    expect(r.matchIndices).toEqual([1]);
    // Without the descendant walk visibleSet would be {0, 1, 6, 7} — the
    // user would see `▾ "meta": { … }` with the contents hidden even
    // though the match was specifically on `meta`. The walk pulls in the
    // tags array, the "a" element inside it, and the score leaf.
    const visibleIds = new Set([...r.visibleSet].map((i) => f[i].id));
    expect(visibleIds.has('/meta/tags')).toBe(true);
    expect(visibleIds.has('/meta/tags/0')).toBe(true);
    expect(visibleIds.has('/meta/score')).toBe(true);
    expect([...r.visibleSet].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe('collectStubRanges', () => {
  test('null root → empty list', () => {
    expect(collectStubRanges(null)).toEqual([]);
  });

  test('tree with only materialized composites → empty list', () => {
    const root: TreeNode = {
      kind: 'object',
      id: '$',
      key: null,
      path: '$',
      children: [{ kind: 'number', id: '$.a', key: 'a', path: '$.a', value: 1 }],
    };
    expect(collectStubRanges(root)).toEqual([]);
  });

  test('collects stub-object, stub-array, ndjson-line in tree order', () => {
    const root: TreeNode = {
      kind: 'object',
      id: '$',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object',
          id: '$.a',
          key: 'a',
          path: '$.a',
          byteStart: 10,
          byteEnd: 50,
          childCount: 0,
          preview: [],
        },
        {
          kind: 'array',
          id: '$.events',
          key: 'events',
          path: '$.events',
          children: [
            {
              kind: 'ndjson-line',
              id: '$.events[0]',
              key: '0',
              path: '$.events[0]',
              byteStart: 60,
              byteEnd: 80,
            },
            {
              kind: 'stub-array',
              id: '$.events[1]',
              key: '1',
              path: '$.events[1]',
              byteStart: 90,
              byteEnd: 110,
              childCount: 0,
              preview: [],
            },
          ],
        },
      ],
    };
    const ranges = collectStubRanges(root);
    expect(ranges).toEqual([
      { id: '$.a', byteStart: 10, byteEnd: 50 },
      { id: '$.events[0]', byteStart: 60, byteEnd: 80 },
      { id: '$.events[1]', byteStart: 90, byteEnd: 110 },
    ]);
  });

  test('does not descend into stub children (they have none materialized)', () => {
    // The stub's own byte range covers its subtree; we don't synthesize
    // additional ranges for what's inside it.
    const root: TreeNode = {
      kind: 'object',
      id: '$',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object',
          id: '$.a',
          key: 'a',
          path: '$.a',
          byteStart: 0,
          byteEnd: 100,
          childCount: 5,
          preview: [],
        },
      ],
    };
    expect(collectStubRanges(root)).toHaveLength(1);
  });
});

describe('asciiCaseInsensitiveIncludes', () => {
  test('empty needle always matches', () => {
    expect(asciiCaseInsensitiveIncludes('', '')).toBe(true);
    expect(asciiCaseInsensitiveIncludes('anything', '')).toBe(true);
  });

  test('needle longer than haystack returns false', () => {
    expect(asciiCaseInsensitiveIncludes('a', 'abc')).toBe(false);
    expect(asciiCaseInsensitiveIncludes('', 'abc')).toBe(false);
  });

  test('case-insensitive match on ASCII letters', () => {
    expect(asciiCaseInsensitiveIncludes('HELLO', 'hello')).toBe(true);
    expect(asciiCaseInsensitiveIncludes('Hello World', 'world')).toBe(true);
    expect(asciiCaseInsensitiveIncludes('userName', 'username')).toBe(true);
  });

  test('case-sensitive mismatch returns false', () => {
    expect(asciiCaseInsensitiveIncludes('HELLO', 'world')).toBe(false);
  });

  test('matches at any position in haystack', () => {
    expect(asciiCaseInsensitiveIncludes('prefix-needle-suffix', 'needle')).toBe(
      true,
    );
    expect(asciiCaseInsensitiveIncludes('end-of-string', 'string')).toBe(true);
    expect(asciiCaseInsensitiveIncludes('start-of-string', 'start')).toBe(true);
  });

  test('digits + symbols compared bit-for-bit (no case-folding)', () => {
    expect(asciiCaseInsensitiveIncludes('item-123', '123')).toBe(true);
    expect(asciiCaseInsensitiveIncludes('a@b.com', '@')).toBe(true);
  });

  test('non-ASCII chars stay case-sensitive (ASCII-only fold)', () => {
    // Documents the trade-off vs JS toLowerCase: ASCII is case-folded,
    // non-ASCII is not. Matches the searchStubs worker behavior so the
    // sync FlatRow walk + worker byte scan return the same hits.
    // (Test inputs assume `needleLower` was already lowercased by the
    // caller — that's findMatches's contract.)
    expect(asciiCaseInsensitiveIncludes('café', 'café')).toBe(true);
    // Mixed-case non-ASCII does NOT fold: uppercase É (U+00C9) and
    // lowercase é (U+00E9) compare bit-for-bit.
    expect(asciiCaseInsensitiveIncludes('CAFÉbar', 'café')).toBe(false);
    // Pure-ASCII portion folds normally even when the haystack
    // includes non-ASCII elsewhere.
    expect(asciiCaseInsensitiveIncludes('café BAR', 'bar')).toBe(true);
  });

  test('overlapping near-matches advance the cursor by one, not by needle length', () => {
    // 'aab' / 'ab' — position 0 first-char matches, second-char fails;
    // algorithm continues at position 1 (not 2) and finds 'ab' there.
    expect(asciiCaseInsensitiveIncludes('aab', 'ab')).toBe(true);
    // 'aba' / 'ba' — position 0 first-char mismatch (a vs b); algorithm
    // continues at position 1 and finds 'ba'.
    expect(asciiCaseInsensitiveIncludes('aba', 'ba')).toBe(true);
  });
});
