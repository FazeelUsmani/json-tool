import { describe, expect, it } from 'vitest';
import { parseToTree } from '@/lib/tree/parse';
import { runQuery } from './jsonpath';

// Helper: parse a JSON literal into a TreeNode root for query input.
function tree(literal: string) {
  const r = parseToTree(literal);
  if (!r.ok) throw new Error(`parseToTree failed: ${JSON.stringify(r.error)}`);
  return r.root;
}

describe('runQuery — basic JSONPath operations', () => {
  it('returns empty matches for an empty query', () => {
    const root = tree('{"a":1}');
    const r = runQuery(root, '');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toEqual([]);
  });

  it('returns empty matches for whitespace-only query', () => {
    const root = tree('{"a":1}');
    const r = runQuery(root, '   \t  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toEqual([]);
  });

  it('matches a single property at depth 1', () => {
    const root = tree('{"hello":"world","n":42}');
    const r = runQuery(root, '$.hello');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toBe('world');
    expect(r.matches[0].pointer).toBe('/hello');
  });

  it('matches nested object property', () => {
    const root = tree('{"a":{"b":{"c":7}}}');
    const r = runQuery(root, '$.a.b.c');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toBe(7);
    expect(r.matches[0].pointer).toBe('/a/b/c');
  });

  it('matches all array elements with wildcard', () => {
    const root = tree('{"events":[{"id":1},{"id":2},{"id":3}]}');
    const r = runQuery(root, '$.events[*].id');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(3);
    expect(r.matches.map((m) => m.value)).toEqual([1, 2, 3]);
    expect(r.matches.map((m) => m.pointer)).toEqual([
      '/events/0/id',
      '/events/1/id',
      '/events/2/id',
    ]);
  });

  it('matches deep descendant with $..', () => {
    const root = tree(
      '{"a":{"target":1},"b":{"c":{"target":2}},"d":[{"target":3}]}',
    );
    const r = runQuery(root, '$..target');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(3);
    expect(r.matches.map((m) => m.value).sort()).toEqual([1, 2, 3]);
  });

  it('returns empty matches for a path that does not match', () => {
    const root = tree('{"hello":"world"}');
    const r = runQuery(root, '$.nonexistent');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toEqual([]);
  });
});

describe('runQuery — value types preserved through conversion', () => {
  it('preserves primitives (string, number, boolean, null)', () => {
    const root = tree('{"s":"hi","n":42,"b":true,"z":null}');
    expect((runQuery(root, '$.s') as { matches: { value: unknown }[] }).matches[0].value).toBe('hi');
    expect((runQuery(root, '$.n') as { matches: { value: unknown }[] }).matches[0].value).toBe(42);
    expect((runQuery(root, '$.b') as { matches: { value: unknown }[] }).matches[0].value).toBe(true);
    expect((runQuery(root, '$.z') as { matches: { value: unknown }[] }).matches[0].value).toBe(null);
  });

  it('matches against composite values (returns the object/array)', () => {
    const root = tree('{"user":{"id":7,"plan":"pro"}}');
    const r = runQuery(root, '$.user');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toEqual({ id: 7, plan: 'pro' });
  });
});

describe('runQuery — pointer/jsonpath dual form', () => {
  it('returns the jsonpath as the display form', () => {
    const root = tree('{"events":[{"id":1}]}');
    const r = runQuery(root, '$.events[0].id');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches[0].jsonpath).toMatch(/events.*0.*id/);
    expect(r.matches[0].pointer).toBe('/events/0/id');
  });

  it('handles keys with slashes via RFC 6901 escaping in pointer', () => {
    // RFC 6901 escapes `/` → `~1` and `~` → `~0`. jsonpath-plus's
    // pointer output follows the spec.
    const root = tree('{"a/b":42}');
    const r = runQuery(root, "$['a/b']");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toBe(42);
    expect(r.matches[0].pointer).toBe('/a~1b');
  });
});

describe('runQuery — stub limitation (collapsed subtrees invisible)', () => {
  it('treats stub nodes as null (queries miss matches inside stubs)', () => {
    // parseToTree itself never emits stubs (those originate from
    // parse-streaming.ts). To exercise the stub branch of
    // treeNodeToPlain, construct a stub TreeNode directly.
    const root = {
      kind: 'object' as const,
      id: '',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object' as const,
          id: '/big',
          key: 'big',
          path: '$.big',
          byteStart: 0,
          byteEnd: 100,
          childCount: 5,
          preview: [],
        },
      ],
    };
    const r = runQuery(root, '$.big.inside');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Stub is null → `$.big.inside` cannot resolve → no matches.
    expect(r.matches).toEqual([]);
  });
});
