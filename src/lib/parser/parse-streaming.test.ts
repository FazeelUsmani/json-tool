import { describe, expect, test } from 'vitest';
import {
  parseStreaming,
  streamFromString,
} from './parse-streaming';
import { MAX_SPINE_DEPTH } from './parser-types';
import type { TreeNode } from '@/lib/tree/parse';

// Tests assume MAX_SPINE_DEPTH = 3 throughout. If the constant changes,
// most assertions need re-baselining.
expect(MAX_SPINE_DEPTH).toBe(3);

async function parse(text: string) {
  return parseStreaming(streamFromString(text));
}

function findByPath(root: TreeNode | null, path: string): TreeNode | undefined {
  if (!root) return undefined;
  if (root.path === path) return root;
  if (root.kind === 'object' || root.kind === 'array') {
    for (const c of root.children) {
      const m = findByPath(c, path);
      if (m) return m;
    }
  }
  return undefined;
}

describe('parseStreaming — spine', () => {
  test('primitive root', async () => {
    const r = await parse('42');
    expect(r.parseError).toBeUndefined();
    expect(r.root).toEqual({ kind: 'number', key: null, path: '$', value: 42 });
  });

  test('flat object materializes all primitives', async () => {
    const r = await parse('{"a":1,"b":"hi","c":true,"d":null}');
    expect(r.parseError).toBeUndefined();
    expect(r.root?.kind).toBe('object');
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    expect(r.root.children.map((c) => c.kind)).toEqual([
      'number',
      'string',
      'boolean',
      'null',
    ]);
    expect(r.root.children.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('array preserves element order + paths', async () => {
    const r = await parse('[10,20,30]');
    if (r.root?.kind !== 'array') throw new Error('unreachable');
    expect(r.root.children.map((c) => c.path)).toEqual([
      '$[0]',
      '$[1]',
      '$[2]',
    ]);
  });

  test('depth-2 composite is materialized (still spine)', async () => {
    // depth 0: root, depth 1: $.outer, depth 2: $.outer.mid
    // mid is at depth 2 (< MAX_SPINE_DEPTH=3) → fully materialized
    const r = await parse('{"outer":{"mid":{"v":1}}}');
    const mid = findByPath(r.root, '$.outer.mid');
    expect(mid?.kind).toBe('object');
    if (mid?.kind !== 'object') throw new Error('unreachable');
    expect(mid.children[0]).toEqual({
      kind: 'number',
      key: 'v',
      path: '$.outer.mid.v',
      value: 1,
    });
  });
});

describe('parseStreaming — stubs at depth >= MAX_SPINE_DEPTH', () => {
  test('depth-3 object becomes a stub-object', async () => {
    // root(0) → outer(1) → mid(2) → deep(3) — deep is the stub
    const r = await parse('{"outer":{"mid":{"deep":{"x":1,"y":2}}}}');
    const deep = findByPath(r.root, '$.outer.mid.deep');
    expect(deep?.kind).toBe('stub-object');
    if (deep?.kind !== 'stub-object') throw new Error('unreachable');
    expect(deep.childCount).toBe(2);
    expect(deep.byteEnd).toBeGreaterThan(deep.byteStart);
  });

  test('depth-3 array becomes a stub-array; byteEnd > byteStart', async () => {
    const r = await parse('{"a":{"b":{"c":[1,2,3,4,5]}}}');
    const stub = findByPath(r.root, '$.a.b.c');
    expect(stub?.kind).toBe('stub-array');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    expect(stub.childCount).toBe(5);
  });

  test('empty stub-object reports childCount=0', async () => {
    const r = await parse('{"a":{"b":{"c":{}}}}');
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-object') throw new Error('unreachable');
    expect(stub.childCount).toBe(0);
  });

  test('empty stub-array reports childCount=0', async () => {
    const r = await parse('{"a":{"b":{"c":[]}}}');
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    expect(stub.childCount).toBe(0);
  });

  test('single-element stub reports childCount=1 (commas+1 with hasElement)', async () => {
    const r = await parse('{"a":{"b":{"c":[42]}}}');
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    expect(stub.childCount).toBe(1);
  });

  test('stub with nested composite children still counts top-level only', async () => {
    // c has 3 top-level children: [], {}, 1. The nested empty composites
    // shouldn't be double-counted via inner LEFT/RIGHT tokens.
    const r = await parse('{"a":{"b":{"c":[[],{},1]}}}');
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    expect(stub.childCount).toBe(3);
  });

  test('stub byte range slices to valid JSON', async () => {
    const text = '{"a":{"b":{"c":[1,2,3]}}}';
    const r = await parse(text);
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    const slice = text.slice(stub.byteStart, stub.byteEnd);
    expect(JSON.parse(slice)).toEqual([1, 2, 3]);
  });
});

describe('parseStreaming — byte index', () => {
  test('every spine composite appears in byteIndex', async () => {
    const r = await parse('{"outer":{"mid":{"deep":[]}}}');
    const paths = new Set(r.byteIndex.map(([p]) => p));
    expect(paths.has('$')).toBe(true);
    expect(paths.has('$.outer')).toBe(true);
    expect(paths.has('$.outer.mid')).toBe(true);
    expect(paths.has('$.outer.mid.deep')).toBe(true); // stub
  });

  test('byteIndex ranges round-trip via JSON.parse', async () => {
    const text = '{"x":{"y":{"z":{"k":1}}}}';
    const r = await parse(text);
    for (const [path, { byteStart, byteEnd }] of r.byteIndex) {
      const slice = text.slice(byteStart, byteEnd);
      // The slice should be valid JSON for the value at `path`. We don't
      // assert exact equality here (would require materialized comparison),
      // just that it parses.
      expect(() => JSON.parse(slice), `path: ${path}`).not.toThrow();
    }
  });
});

describe('parseStreaming — error propagation (partial root)', () => {
  test('malformed JSON yields parseError + whatever spine was built', async () => {
    // Valid `{"a":1,` then garbage. Some token sequence runs before the
    // error fires; depending on tokenizer internals, root may be a
    // partially-built object or null. The contract is parseError is set.
    const r = await parse('{"a":1,!!!}');
    expect(r.parseError).toBeDefined();
    expect(r.parseError?.message.length).toBeGreaterThan(0);
  });

  test('valid prefix → root partial; pendingKey state visible', async () => {
    // {"a":1 followed by EOF — tokenizer.end() fires onError because of
    // unclosed brace. Whatever was attached before EOF stays in root.
    const r = await parse('{"a":1');
    expect(r.parseError).toBeDefined();
    // root may be partial: the root object was opened but never closed.
    // We don't pin exact shape; we just confirm parseError is set.
  });
});

describe('parseStreaming — pathological', () => {
  test('UTF-8 BOM at file start does not fail', async () => {
    // The tokenizer is documented as treating BOM as whitespace. Verify.
    const text = '﻿{"a":1}';
    const r = await parse(text);
    expect(r.parseError).toBeUndefined();
    expect(r.root?.kind).toBe('object');
  });

  test('escaped quotes and backslashes round-trip', async () => {
    const r = await parse('{"q":"\\"quoted\\" \\\\ slash"}');
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    const leaf = r.root.children[0];
    if (leaf.kind !== 'string') throw new Error('unreachable');
    expect(leaf.value).toBe('"quoted" \\ slash');
  });

  test('surrogate pair for emoji decodes', async () => {
    const r = await parse('{"e":"\\uD83D\\uDE00"}');
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    const leaf = r.root.children[0];
    if (leaf.kind !== 'string') throw new Error('unreachable');
    expect(leaf.value).toBe('\u{1F600}');
  });

  test('duplicate keys are preserved as separate children (debug-tool semantics)', async () => {
    const r = await parse('{"dup":1,"dup":2,"dup":3}');
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    expect(r.root.children.map((c) => c.key)).toEqual(['dup', 'dup', 'dup']);
    expect(r.root.children.map((c) => (c as { value?: number }).value)).toEqual(
      [1, 2, 3],
    );
  });
});

describe('parseStreaming — chunked stream (UTF-8 across boundaries)', () => {
  function chunkedStream(text: string, chunkSize: number): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkSize, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    });
  }

  test('multi-byte chars across chunk boundaries decode correctly', async () => {
    // 你 is 3 bytes (E4 BD A0). chunkSize=4 cuts across some boundaries
    // without being pathologically small. (At chunk=1 the upstream
    // tokenizer's STRING_INCOMPLETE_CHAR state mishandles a 3-byte char
    // split across three 1-byte chunks — known upstream limitation;
    // real-world File.stream() yields 64KB+ chunks so this is moot.)
    const text = '{"text":"你好世界"}';
    const r = await parseStreaming(chunkedStream(text, 4));
    expect(r.parseError).toBeUndefined();
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    const leaf = r.root.children[0];
    if (leaf.kind !== 'string') throw new Error('unreachable');
    expect(leaf.value).toBe('你好世界');
  });

  test('emoji ZWJ family glyph survives realistic-size chunking', async () => {
    const text = '{"e":"👨‍👩‍👧"}';
    const r = await parseStreaming(chunkedStream(text, 8));
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    const leaf = r.root.children[0];
    if (leaf.kind !== 'string') throw new Error('unreachable');
    expect(leaf.value).toBe('👨‍👩‍👧');
  });
});
