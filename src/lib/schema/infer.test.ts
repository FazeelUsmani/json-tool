// Tests for the schema walker. Build TreeNodes directly so tests
// target walker logic without dependence on the parser or streaming
// spine. fetchStub is mocked per-test for cases that need it.

import { describe, expect, test } from 'vitest';
import { inferSchema, type FetchStubValue } from './infer';
import type { TreeNode } from '@/lib/tree/parse';

// Fails loudly if any test path accidentally hits a stub fetch.
const noFetch: FetchStubValue = async () => {
  throw new Error('test: fetchStub called but no mock was set up');
};

// --- builders ---

function obj(path: string, children: TreeNode[]): TreeNode {
  return { kind: 'object', key: null, path, children };
}
function arr(path: string, children: TreeNode[]): TreeNode {
  return { kind: 'array', key: null, path, children };
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

// --- primitives ---

describe('inferSchema — primitives', () => {
  test('string', async () => {
    expect(await inferSchema(str(null, '$', 'hi'), noFetch)).toEqual({
      kind: 'string',
      nullable: false,
    });
  });
  test('number', async () => {
    expect(await inferSchema(num(null, '$', 5), noFetch)).toEqual({
      kind: 'number',
      nullable: false,
    });
  });
  test('boolean', async () => {
    expect(await inferSchema(bool(null, '$', true), noFetch)).toEqual({
      kind: 'boolean',
      nullable: false,
    });
  });
  test('null (root)', async () => {
    expect(await inferSchema(nul(null, '$'), noFetch)).toEqual({
      kind: 'null',
    });
  });
});

// --- single object ---

describe('inferSchema — object root', () => {
  test('flat object with primitives', async () => {
    const tree = obj('$', [num('id', '$.id', 1), str('name', '$.name', 'a')]);
    const result = await inferSchema(tree, noFetch);
    expect(result.kind).toBe('object');
    if (result.kind !== 'object') return;
    expect(result.fields.get('id')).toEqual({
      schema: { kind: 'number', nullable: false },
      optional: false,
    });
    expect(result.fields.get('name')).toEqual({
      schema: { kind: 'string', nullable: false },
      optional: false,
    });
  });

  test('empty object', async () => {
    const result = await inferSchema(obj('$', []), noFetch);
    expect(result).toEqual({
      kind: 'object',
      fields: new Map(),
      nullable: false,
    });
  });

  test('nested object', async () => {
    const tree = obj('$', [
      obj('$.user', [str('id', '$.user.id', 'u_0')]) as TreeNode,
    ]);
    // Re-tag the inner obj's key — builder defaults key to null
    (tree as Extract<TreeNode, { kind: 'object' }>).children[0] = {
      ...((tree as Extract<TreeNode, { kind: 'object' }>).children[0] as Extract<
        TreeNode,
        { kind: 'object' }
      >),
      key: 'user',
    };
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'object') throw new Error('expected object');
    const userField = result.fields.get('user');
    expect(userField).toBeDefined();
    if (!userField || userField.schema.kind !== 'object') {
      throw new Error('expected nested object');
    }
    expect(userField.schema.fields.get('id')).toEqual({
      schema: { kind: 'string', nullable: false },
      optional: false,
    });
  });
});

// --- array shapes ---

describe('inferSchema — array root', () => {
  test('empty array → items: null placeholder', async () => {
    expect(await inferSchema(arr('$', []), noFetch)).toEqual({
      kind: 'array',
      items: { kind: 'null' },
      nullable: false,
    });
  });

  test('homogeneous array of numbers', async () => {
    const tree = arr('$', [
      num('0', '$[0]', 1),
      num('1', '$[1]', 2),
      num('2', '$[2]', 3),
    ]);
    expect(await inferSchema(tree, noFetch)).toEqual({
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: false,
    });
  });

  test('array of strings + nulls → nullable string items', async () => {
    const tree = arr('$', [
      str('0', '$[0]', 'a'),
      nul('1', '$[1]'),
      str('2', '$[2]', 'b'),
    ]);
    expect(await inferSchema(tree, noFetch)).toEqual({
      kind: 'array',
      items: { kind: 'string', nullable: true },
      nullable: false,
    });
  });

  test('array of mixed types → mixed items with both branches in observed', async () => {
    const tree = arr('$', [num('0', '$[0]', 1), str('1', '$[1]', 'a')]);
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'array') throw new Error('expected array');
    expect(result.items.kind).toBe('mixed');
    if (result.items.kind !== 'mixed') return;
    const observedKinds = result.items.observed.map((s) => s.kind);
    expect(observedKinds).toContain('number');
    expect(observedKinds).toContain('string');
  });

  test('array of all-nulls → items: null', async () => {
    const tree = arr('$', [nul('0', '$[0]'), nul('1', '$[1]')]);
    expect(await inferSchema(tree, noFetch)).toEqual({
      kind: 'array',
      items: { kind: 'null' },
      nullable: false,
    });
  });
});

// --- object merging across array samples ---

describe('inferSchema — object field merging', () => {
  test('field present in all sampled objects → required', async () => {
    const tree = arr('$', [
      obj('$[0]', [num('a', '$[0].a', 1)]),
      obj('$[1]', [num('a', '$[1].a', 2)]),
    ]);
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'array') throw new Error('expected array');
    if (result.items.kind !== 'object') throw new Error('expected object items');
    expect(result.items.fields.get('a')).toEqual({
      schema: { kind: 'number', nullable: false },
      optional: false,
    });
  });

  test('field absent in any sample → optional (strict)', async () => {
    const tree = arr('$', [
      obj('$[0]', [num('a', '$[0].a', 1), num('b', '$[0].b', 2)]),
      obj('$[1]', [num('a', '$[1].a', 3)]),
    ]);
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'array' || result.items.kind !== 'object') return;
    expect(result.items.fields.get('a')).toEqual({
      schema: { kind: 'number', nullable: false },
      optional: false,
    });
    expect(result.items.fields.get('b')).toEqual({
      schema: { kind: 'number', nullable: false },
      optional: true,
    });
  });

  test('field with one null observation → nullable', async () => {
    const tree = arr('$', [
      obj('$[0]', [num('a', '$[0].a', 1)]),
      obj('$[1]', [nul('a', '$[1].a')]),
    ]);
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'array' || result.items.kind !== 'object') return;
    expect(result.items.fields.get('a')).toEqual({
      schema: { kind: 'number', nullable: true },
      optional: false,
    });
  });

  test('field with mixed types across samples → mixed schema', async () => {
    const tree = arr('$', [
      obj('$[0]', [num('a', '$[0].a', 1)]),
      obj('$[1]', [str('a', '$[1].a', 'hello')]),
    ]);
    const result = await inferSchema(tree, noFetch);
    if (result.kind !== 'array' || result.items.kind !== 'object') return;
    const field = result.items.fields.get('a');
    expect(field?.schema.kind).toBe('mixed');
    if (field?.schema.kind !== 'mixed') return;
    const observedKinds = field.schema.observed.map((s) => s.kind);
    expect(observedKinds).toContain('number');
    expect(observedKinds).toContain('string');
  });
});

// --- stub + ndjson-line expansion ---

describe('inferSchema — stub + ndjson-line expansion via fetchStub', () => {
  test('stub-object: fetcher invoked with byte range, value walked', async () => {
    const tree: TreeNode = {
      kind: 'stub-object',
      key: null,
      path: '$',
      byteStart: 10,
      byteEnd: 50,
      childCount: 2,
      preview: [],
    };
    const calls: Array<[number, number]> = [];
    const fetch: FetchStubValue = async (start, end) => {
      calls.push([start, end]);
      return { id: 1, name: 'test' };
    };
    const result = await inferSchema(tree, fetch);
    expect(calls).toEqual([[10, 50]]);
    if (result.kind !== 'object') throw new Error('expected object');
    expect(result.fields.get('id')?.schema).toEqual({
      kind: 'number',
      nullable: false,
    });
    expect(result.fields.get('name')?.schema).toEqual({
      kind: 'string',
      nullable: false,
    });
  });

  test('ndjson-line: each sampled line fetched and merged', async () => {
    const root = arr('$', [
      { kind: 'ndjson-line', key: '0', path: '$[0]', byteStart: 0, byteEnd: 30 },
      { kind: 'ndjson-line', key: '1', path: '$[1]', byteStart: 31, byteEnd: 60 },
    ]);
    const fetch: FetchStubValue = async (start) => {
      if (start === 0) return { event: 'click', count: 1 };
      if (start === 31) return { event: 'scroll' };
      throw new Error('unexpected fetch range');
    };
    const result = await inferSchema(root, fetch);
    if (result.kind !== 'array' || result.items.kind !== 'object') return;
    expect(result.items.fields.get('event')).toEqual({
      schema: { kind: 'string', nullable: false },
      optional: false,
    });
    expect(result.items.fields.get('count')).toEqual({
      schema: { kind: 'number', nullable: false },
      // present on line 0, absent on line 1 → optional
      optional: true,
    });
  });

  test('fetched value can be a deeply nested structure', async () => {
    const tree: TreeNode = {
      kind: 'stub-object',
      key: null,
      path: '$',
      byteStart: 0,
      byteEnd: 100,
      childCount: 0,
      preview: [],
    };
    const fetch: FetchStubValue = async () => ({
      meta: { tags: ['a', 'b'], scores: [1, 2, 3] },
    });
    const result = await inferSchema(tree, fetch);
    if (result.kind !== 'object') return;
    const meta = result.fields.get('meta')?.schema;
    if (meta?.kind !== 'object') return;
    expect(meta.fields.get('tags')?.schema).toEqual({
      kind: 'array',
      items: { kind: 'string', nullable: false },
      nullable: false,
    });
    expect(meta.fields.get('scores')?.schema).toEqual({
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: false,
    });
  });
});

// --- sampling at scale ---

describe('inferSchema — sampling at scale', () => {
  test('5000-element array completes under 100ms (sampling kicks in)', async () => {
    const children: TreeNode[] = [];
    for (let i = 0; i < 5000; i++) {
      children.push(num(`${i}`, `$[${i}]`, i));
    }
    const t0 = performance.now();
    const result = await inferSchema(arr('$', children), noFetch);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
    expect(result).toEqual({
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: false,
    });
  });
});
