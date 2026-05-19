import { describe, expect, test } from 'vitest';
import {
  parseStreaming,
  streamFromString,
} from './parse-streaming';
import { MAX_SPINE_DEPTH } from './parser-types';
import type { TreeNode } from '@/lib/tree/parse';

async function parse(text: string) {
  return parseStreaming(streamFromString(text));
}

// Many tests below assume MAX_SPINE_DEPTH = 3. If the constant changes,
// most assertions need re-baselining; this guard fails loudly first so the
// failure pile reads as "the constant changed" not "a dozen things broke."
test('precondition: MAX_SPINE_DEPTH === 3', () => {
  expect(MAX_SPINE_DEPTH).toBe(3);
});

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

  test('byteStart/byteEnd are BYTE offsets, not char offsets (multibyte safe)', async () => {
    // Multibyte content BEFORE the stub forces byte != char divergence.
    // Slicing the SOURCE BYTES at the reported offsets must yield valid
    // JSON for the stub subtree; slicing by char would land mid-character
    // on the multibyte content and produce mojibake.
    const text = '{"hdr":"日本語テキスト","a":{"b":{"c":[{"k":"你好"}]}}}';
    const bytes = new TextEncoder().encode(text);
    const r = await parseStreaming(streamFromString(text));
    const stub = findByPath(r.root, '$.a.b.c');
    if (stub?.kind !== 'stub-array') throw new Error('unreachable');
    // Sanity: byteStart > char-offset of '[', proving offset is in bytes
    // (header string adds extra bytes per CJK char).
    expect(stub.byteStart).toBeGreaterThan(text.indexOf('['));
    const slice = bytes.subarray(stub.byteStart, stub.byteEnd);
    const decoded = new TextDecoder().decode(slice);
    expect(JSON.parse(decoded)).toEqual([{ k: '你好' }]);
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

  test('stub TreeNodes keep inline byteStart/byteEnd after sampling drops their byteIndex entry', async () => {
    // events array at depth 1 → its children (events) are at depth 2,
    // materialized as spine. Each event's `.user` is at depth 3 → stub.
    // 200 elements + threshold=100/n=100 means every event's byteIndex
    // entries get sampled (K=0 and K=100 kept; rest dropped).
    const events = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      user: { name: `u${i}` },
    }));
    const text = JSON.stringify({ events });
    const r = await parseStreaming(streamFromString(text), {
      sampling: { threshold: 100, n: 100 },
    });
    expect(r.parseError).toBeUndefined();

    function find(
      n: NonNullable<typeof r.root>,
      target: string,
    ): TreeNode | undefined {
      if (n.path === target) return n;
      if (n.kind === 'object' || n.kind === 'array') {
        for (const c of n.children) {
          const m = find(c, target);
          if (m) return m;
        }
      }
      return undefined;
    }

    // events[37] is sampled OUT of byteIndex but its TreeNode is still
    // fully materialized in the spine.
    const event37 = find(r.root!, '$.events[37]');
    if (event37?.kind !== 'object') throw new Error('unreachable');
    const userStub = event37.children.find((c) => c.key === 'user');
    if (userStub?.kind !== 'stub-object') throw new Error('unreachable');

    // Crucial invariant: even though this stub's path was dropped from
    // byteIndex by sampling, the TreeNode itself still carries valid
    // byte ranges. Step 7's expansion reads these inline — sampling must
    // never touch them.
    expect(userStub.byteStart).toBeGreaterThan(0);
    expect(userStub.byteEnd).toBeGreaterThan(userStub.byteStart);
    const bytes = new TextEncoder().encode(text);
    const slice = bytes.subarray(userStub.byteStart, userStub.byteEnd);
    expect(JSON.parse(new TextDecoder().decode(slice))).toEqual({
      name: 'u37',
    });

    // Sampling-side sanity: K=37 dropped, K=100 kept.
    const idxPaths = new Set(r.byteIndex.map(([p]) => p));
    expect(idxPaths.has('$.events[37].user')).toBe(false);
    expect(idxPaths.has('$.events[100].user')).toBe(true);
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

describe('parseStreaming — expansion (basePath + byteOffsetBase)', () => {
  test('rebases paths from basePath and shifts offsets by byteOffsetBase', async () => {
    // Simulate expandStub on a stub at $.users[0] whose byteStart was 100
    // in the original file. We feed only the subtree text to the parser
    // and tell it where it came from.
    const subtreeText = '{"name":"alice","tags":["x","y"]}';
    const r = await parseStreaming(streamFromString(subtreeText), {
      basePath: '$.users[0]',
      byteOffsetBase: 100,
    });
    expect(r.parseError).toBeUndefined();
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    // Root TreeNode adopts basePath; children paths cascade from it.
    expect(r.root.path).toBe('$.users[0]');
    expect(r.root.children[0].path).toBe('$.users[0].name');
    expect(r.root.children[1].path).toBe('$.users[0].tags');
    // Offsets in byteIndex are shifted into the ORIGINAL file's coordinate
    // space (slice-relative + 100).
    const rootEntry = r.byteIndex.find(([p]) => p === '$.users[0]');
    expect(rootEntry).toBeDefined();
    if (!rootEntry) throw new Error('unreachable');
    const [, { byteStart, byteEnd }] = rootEntry;
    expect(byteStart).toBe(100); // slice-offset 0 + base 100
    expect(byteEnd).toBe(100 + subtreeText.length);
  });

  test('stubs inside expanded subtree carry rebased paths + shifted offsets', async () => {
    // The subtree itself contains depth-3 stubs (depth 3 within the slice).
    // Their paths should be under basePath; offsets in original-file
    // coordinates.
    const subtreeText = '{"a":{"b":{"c":{"deep":1}}}}';
    const r = await parseStreaming(streamFromString(subtreeText), {
      basePath: '$.users[0]',
      byteOffsetBase: 1000,
    });
    if (r.root?.kind !== 'object') throw new Error('unreachable');
    function find(n: TreeNode, p: string): TreeNode | undefined {
      if (n.path === p) return n;
      if (n.kind === 'object' || n.kind === 'array') {
        for (const c of n.children) {
          const m = find(c, p);
          if (m) return m;
        }
      }
      return undefined;
    }
    const stub = find(r.root, '$.users[0].a.b.c');
    expect(stub?.kind).toBe('stub-object');
    if (stub?.kind !== 'stub-object') throw new Error('unreachable');
    // c is at slice-offset where `{"deep":1}` starts (after `{"a":{"b":{"c":`).
    const sliceOffset = subtreeText.indexOf('{"deep":1}');
    expect(stub.byteStart).toBe(sliceOffset + 1000);
    expect(stub.byteEnd).toBe(sliceOffset + '{"deep":1}'.length + 1000);
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

  test('truncated input → parseError + partial root preserved', async () => {
    // `{"a":1` ends without the closing brace. Post-stream check sets the
    // "unclosed object or array" error; finalize-partial drains the root
    // frame so the user sees what parsed instead of a null root.
    const r = await parse('{"a":1');
    expect(r.parseError).toBeDefined();
    if (r.root?.kind !== 'object') throw new Error('expected partial root object');
    expect(r.root.children).toEqual([
      { kind: 'number', key: 'a', path: '$.a', value: 1 },
    ]);
  });

  test('error mid-stub → spine retained, no orphan stub attached', async () => {
    // Unclosed STRING inside a depth-3 stub. tokenizer.end() fires onError
    // because state is STRING_DEFAULT mid-token. Contract: spine
    // ($, $.a, $.a.b) materializes as TreeNodes with empty deeper
    // children; the active stub at $.a.b.c is discarded — no half-formed
    // stub TreeNode appears.
    const r = await parse('{"a":{"b":{"c":["valid", "unclosed');
    expect(r.parseError).toBeDefined();
    if (r.root?.kind !== 'object') throw new Error('expected partial root');
    const a = findByPath(r.root, '$.a');
    const b = findByPath(r.root, '$.a.b');
    expect(a?.kind).toBe('object');
    expect(b?.kind).toBe('object');
    if (b?.kind !== 'object') throw new Error('unreachable');
    // $.a.b should have no children — the stub at $.a.b.c never closed,
    // so no node was attached for key "c".
    expect(b.children).toEqual([]);
    // No stub node anywhere in the tree.
    expect(findByPath(r.root, '$.a.b.c')).toBeUndefined();
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
