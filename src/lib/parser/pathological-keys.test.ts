// Pathological-keys regression tests for the JSON Pointer identity scheme
// shipped 2026-05-25 (commit c05d030). Every test asserts a collision the
// prior path-as-id scheme would have hit: keys containing dots, brackets,
// slashes, tildes, and the empty string. Failure here means parser identity
// regressed back to display-string ids — viewStore's `closed` Set, splice
// targeting, and stub-search would all conflate distinct nodes.

import { describe, expect, test } from 'vitest';
import { parseToTree, type TreeNode } from '@/lib/tree/parse';
import { parseStreaming, streamFromString } from './parse-streaming';
import { flattenTree } from '@/lib/tree/flatten';
import fixtureData from './__fixtures__/pathological-keys.json';

// The fixture is imported as a parsed JSON object and re-stringified
// for the parser tests below. V8 preserves insertion order for the
// fixture's string keys (none are integer-indexed), so the re-stringified
// text matches the file's logical structure even if whitespace differs.
const FIXTURE_TEXT = JSON.stringify(fixtureData);

type ObjectNode = Extract<TreeNode, { kind: 'object' }>;
type ArrayNode = Extract<TreeNode, { kind: 'array' }>;

function walkAll(node: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(node);
  if (node.kind === 'object' || node.kind === 'array') {
    for (const c of node.children) walkAll(c, out);
  }
  return out;
}

function findByKey(root: TreeNode, key: string): TreeNode | undefined {
  if (root.key === key) return root;
  if (root.kind === 'object' || root.kind === 'array') {
    for (const c of root.children) {
      const m = findByKey(c, key);
      if (m) return m;
    }
  }
  return undefined;
}

function parseSync(): ObjectNode {
  const r = parseToTree(FIXTURE_TEXT);
  if (!r.ok) throw new Error(`fixture invalid: ${r.error.message}`);
  if (r.root.kind !== 'object') throw new Error('fixture root must be object');
  return r.root;
}

describe('pathological keys — sync parser', () => {
  test('"a.b" (dot) does NOT collide with nested {a:{b}}', () => {
    const root = parseSync();
    const dotKey = root.children.find((c) => c.key === 'a.b');
    const nestedA = root.children.find((c) => c.key === 'a') as
      | ObjectNode
      | undefined;
    const nestedB = nestedA?.children.find((c) => c.key === 'b');
    expect(dotKey).toBeDefined();
    expect(nestedB).toBeDefined();
    expect(dotKey!.id).not.toBe(nestedB!.id);
    expect(dotKey!.id).toBe('/a.b');
    expect(nestedB!.id).toBe('/a/b');
  });

  test('"[0]" (brackets) does NOT collide with arr[0]', () => {
    const root = parseSync();
    const bracketKey = root.children.find((c) => c.key === '[0]');
    const arr = root.children.find((c) => c.key === 'arr') as
      | ArrayNode
      | undefined;
    const arrZero = arr?.children[0];
    expect(bracketKey).toBeDefined();
    expect(arrZero).toBeDefined();
    expect(bracketKey!.id).not.toBe(arrZero!.id);
    expect(bracketKey!.id).toBe('/[0]');
    expect(arrZero!.id).toBe('/arr/0');
  });

  test('empty-string key produces id `/` (root + empty segment)', () => {
    const root = parseSync();
    const empty = root.children.find((c) => c.key === '');
    expect(empty).toBeDefined();
    expect(empty!.id).toBe('/');
  });

  test('tilde escapes to ~0 in pointer (RFC 6901)', () => {
    const root = parseSync();
    const tilde = findByKey(root, '~with~tildes');
    expect(tilde!.id).toBe('/~0with~0tildes');
  });

  test('slash escapes to ~1 in pointer (RFC 6901)', () => {
    const root = parseSync();
    const slash = findByKey(root, 'has/slash');
    expect(slash!.id).toBe('/has~1slash');
  });

  test('combined tilde + slash escape in encode order (~ first)', () => {
    const root = parseSync();
    const combo = findByKey(root, '~contains/slash');
    expect(combo!.id).toBe('/~0contains~1slash');
  });

  test('non-identifier keys bracket-quote in display path', () => {
    const root = parseSync();
    const cases: Array<[string, string]> = [
      ['a.b', '$["a.b"]'],
      ['[0]', '$["[0]"]'],
      ['', '$[""]'],
      ['~with~tildes', '$["~with~tildes"]'],
      ['has/slash', '$["has/slash"]'],
      ['~contains/slash', '$["~contains/slash"]'],
      ['with space', '$["with space"]'],
      ['1starting-digit', '$["1starting-digit"]'],
      ['café', '$["café"]'],
    ];
    for (const [key, expectedPath] of cases) {
      const node = findByKey(root, key);
      expect(
        node,
        `node with key ${JSON.stringify(key)} should exist`,
      ).toBeDefined();
      expect(node!.path).toBe(expectedPath);
    }
  });

  test('quote in key escapes through JSON.stringify in display path', () => {
    const root = parseSync();
    const quoteKey = findByKey(root, 'has"quote');
    expect(quoteKey!.path).toBe('$["has\\"quote"]');
  });

  test('all node ids in the fixture tree are distinct', () => {
    const root = parseSync();
    const ids = walkAll(root).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pathological keys — streaming parser equivalence', () => {
  test('streaming parser produces the same (id, path) tuples as sync', async () => {
    const sync = parseSync();
    const stream = await parseStreaming(streamFromString(FIXTURE_TEXT));
    expect(stream.parseError).toBeUndefined();
    expect(stream.root).toBeDefined();
    if (!stream.root) throw new Error('unreachable');
    const syncTuples = walkAll(sync).map((n) => [n.path, n.id]);
    const streamTuples = walkAll(stream.root).map((n) => [n.path, n.id]);
    expect(streamTuples).toEqual(syncTuples);
  });
});

describe('pathological keys — FlatRow id propagation', () => {
  test('flattenTree carries the pointer ids unchanged (no path-as-id fallback)', () => {
    const root = parseSync();
    const flat = flattenTree(root);
    // Every visible row whose underlying node carries a pathological key
    // must round-trip the SAME id we asserted on the tree above.
    const byKey = new Map<string, string>(); // key → expected id
    byKey.set('a.b', '/a.b');
    byKey.set('[0]', '/[0]');
    byKey.set('', '/');
    byKey.set('~with~tildes', '/~0with~0tildes');
    byKey.set('has/slash', '/has~1slash');
    byKey.set('~contains/slash', '/~0contains~1slash');
    for (const [key, expectedId] of byKey) {
      const row = flat.find(
        (r) => r.kind !== 'close' && r.node.key === key,
      );
      expect(row, `flat row for key ${JSON.stringify(key)}`).toBeDefined();
      expect(row!.id).toBe(expectedId);
    }
  });

  test('ids stay identical after a no-op reparse — collapse Set survives', () => {
    // Mirrors the load-bearing invariant viewStore.closed relies on:
    // a reparse of the same fixture produces byte-identical ids, so a
    // user's collapsed-subtree set isn't invalidated mid-edit.
    const ids1 = flattenTree(parseSync()).map((r) => r.id);
    const ids2 = flattenTree(parseSync()).map((r) => r.id);
    expect(ids2).toEqual(ids1);
  });
});
