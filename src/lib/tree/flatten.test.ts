import { describe, expect, test } from 'vitest';
import { deriveVisible, flattenTree } from './flatten';
import { parseToTree, type TreeNode } from './parse';

function parse(text: string): TreeNode {
  const r = parseToTree(text);
  if (!r.ok) throw new Error('test fixture must be valid JSON');
  return r.root;
}

describe('flattenTree', () => {
  test('flat object: open + leaf + leaf + close', () => {
    const flat = flattenTree(parse('{"a":1,"b":"x"}'));
    expect(flat.map((r) => r.kind)).toEqual(['open', 'leaf', 'leaf', 'close']);
    expect(flat[0]).toMatchObject({ id: '$', depth: 0, parentIndex: -1 });
    expect(flat[1]).toMatchObject({ id: '$.a', depth: 1, parentIndex: 0 });
    expect(flat[2]).toMatchObject({ id: '$.b', depth: 1, parentIndex: 0 });
    expect(flat[3]).toMatchObject({
      kind: 'close',
      depth: 0,
      closeBracket: '}',
      parentIndex: 0,
    });
  });

  test('nested object: parent chain walks back to root', () => {
    const flat = flattenTree(parse('{"u":{"n":"a"}}'));
    expect(flat.map((r) => r.id)).toEqual([
      '$',
      '$.u',
      '$.u.n',
      '$.u#close',
      '$#close',
    ]);
    // Walk parent chain from the deepest leaf
    let i: number = 2; // $.u.n
    expect(flat[i].parentIndex).toBe(1); // immediate parent: $.u (open)
    i = flat[i].parentIndex;
    expect(flat[i].id).toBe('$.u');
    expect(flat[i].parentIndex).toBe(0); // grandparent: $ (open)
    i = flat[i].parentIndex;
    expect(flat[i].id).toBe('$');
    expect(flat[i].parentIndex).toBe(-1);
  });

  test('array of objects: bracketed paths + correct parentIndex', () => {
    const flat = flattenTree(parse('[{"id":1},{"id":2}]'));
    expect(flat.map((r) => r.id)).toEqual([
      '$',
      '$[0]',
      '$[0].id',
      '$[0]#close',
      '$[1]',
      '$[1].id',
      '$[1]#close',
      '$#close',
    ]);
    // Second array element points back to the array root, not the first
    expect(flat[4].parentIndex).toBe(0);
  });

  test('empty composite collapses to single leaf row', () => {
    const flat = flattenTree(parse('{"empty":{}}'));
    expect(flat.map((r) => r.kind)).toEqual(['open', 'leaf', 'close']);
    expect(flat[1]).toMatchObject({ id: '$.empty', kind: 'leaf' });
  });

  test('top-level primitive: single leaf row, no opens', () => {
    const flat = flattenTree(parse('42'));
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ kind: 'leaf', id: '$', parentIndex: -1 });
  });

  test('stub TreeNodes flatten to a single stub row (no open/close pair)', () => {
    // Construct a TreeNode directly because parseToTree never emits stubs.
    // Real stubs come from parse-streaming at depth >= MAX_SPINE_DEPTH.
    const root: TreeNode = {
      kind: 'object',
      id: '$',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object',
          id: '$.big',
          key: 'big',
          path: '$.big',
          byteStart: 10,
          byteEnd: 200,
          childCount: 42,
          preview: [],
        },
      ],
    };
    const flat = flattenTree(root);
    expect(flat.map((r) => r.kind)).toEqual(['open', 'stub', 'close']);
    expect(flat[1]).toMatchObject({
      kind: 'stub',
      id: '$.big',
      depth: 1,
      parentIndex: 0,
    });
  });

  test('paths stay identical across reparses of unrelated edits', () => {
    // Headline W2-Mon property: viewStore's `closed` Set is keyed by these
    // path IDs and must survive edits that don't touch a given subtree.
    // If anyone refactors to index-based IDs this test fires.
    const flatA = flattenTree(parse('{"a":1,"b":{"c":2}}'));
    const flatB = flattenTree(parse('{"a":1,"b":{"c":2},"d":3}'));
    const idsA = flatA.filter((r) => r.id.startsWith('$.b')).map((r) => r.id);
    const idsB = flatB.filter((r) => r.id.startsWith('$.b')).map((r) => r.id);
    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA).toEqual(idsB);
  });
});

describe('deriveVisible', () => {
  test('empty closed set returns the same array reference', () => {
    const flat = flattenTree(parse('{"a":1}'));
    expect(deriveVisible(flat, new Set())).toBe(flat);
  });

  test('closing root hides everything below the root open row', () => {
    const flat = flattenTree(parse('{"a":1,"b":2}'));
    const visible = deriveVisible(flat, new Set(['$']));
    // Only the root open row remains visible; children + close row hidden
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('$');
  });

  test('closing an inner composite hides its subtree only', () => {
    const flat = flattenTree(parse('{"u":{"n":"a"},"k":7}'));
    const visible = deriveVisible(flat, new Set(['$.u']));
    expect(visible.map((r) => r.id)).toEqual([
      '$',
      '$.u', // open row stays visible
      '$.k', // sibling unaffected
      '$#close',
    ]);
  });
});
