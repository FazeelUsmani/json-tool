// Parses JSON text into a tree of nodes for the right-pane renderer.
//
// W1-Wed: naive — everything materialized as JS objects. Fine for small
// documents; replaced by the streaming spine + offset index in W3 so we can
// handle 500MB without OOM. Same discriminated-union result shape as
// format.ts and fetchUrl.ts.
//
// 2026-05-25: every node carries two parallel string fields per
// `src/lib/parser/identity.ts`:
//   - `id`   = JSON Pointer (RFC 6901), used as the key for every
//              Set/Map/WeakMap tracking node identity. Collision-safe
//              under any JSON key shape.
//   - `path` = JSONPath, used purely for display surfaces.
// Splitting them fixes the correctness bug where keys like `"a.b"`
// or `"[0]"` collapsed onto the same string as nested structures.

import { ROOT_ID, ROOT_PATH, appendDisplayPath, appendPointer } from '@/lib/parser/identity';

export type TreeNode =
  | { kind: 'object'; id: string; key: string | null; path: string; children: TreeNode[] }
  | { kind: 'array'; id: string; key: string | null; path: string; children: TreeNode[] }
  | { kind: 'string'; id: string; key: string | null; path: string; value: string }
  | { kind: 'number'; id: string; key: string | null; path: string; value: number }
  | { kind: 'boolean'; id: string; key: string | null; path: string; value: boolean }
  | { kind: 'null'; id: string; key: string | null; path: string }
  // W3-Mon: stub variants for the streaming spine parser. Emitted when the
  // parser encounters a composite at depth >= MAX_SPINE_DEPTH; the subtree
  // is not materialized until the user expands it. byteStart/byteEnd point
  // into the original file so expansion can re-tokenize just that range.
  // parseToTree never emits these — they originate from parse-streaming.ts.
  //
  // W3-Wed Part B: `preview` carries byte ranges of the first up-to-3
  // immediate children (KV pairs for objects, elements for arrays) so
  // StubRow can render an inline preview by slicing sourceBlob — turns
  // `▸ 0: { … } [5]` into `▸ 0: { "id":0, "name":"click", … } [5]`
  // without materializing the whole subtree. Empty stubs have preview=[].
  | {
      kind: 'stub-object';
      id: string;
      key: string | null;
      path: string;
      byteStart: number;
      byteEnd: number;
      childCount: number;
      preview: { byteStart: number; byteEnd: number }[];
    }
  | {
      kind: 'stub-array';
      id: string;
      key: string | null;
      path: string;
      byteStart: number;
      byteEnd: number;
      childCount: number;
      preview: { byteStart: number; byteEnd: number }[];
    }
  // W3-Thu: one NDJSON line. Leaf-like (no children); the byte range
  // points at the line's content in the original blob. Preview text
  // loads lazily via the same sourceBlob slice path StubRow uses.
  // Click → detail drawer JSON.parse's the line bytes and renders
  // (v1). In-place subtree expansion lands in [[ndjson-v2]].
  | {
      kind: 'ndjson-line';
      id: string;
      key: string | null;
      path: string;
      byteStart: number;
      byteEnd: number;
    };

export type ParseTreeResult =
  | { ok: true; root: TreeNode }
  | { ok: false; error: ParseTreeError };

export type ParseTreeError = {
  message: string;
  line?: number;
  col?: number;
};

export function parseToTree(text: string): ParseTreeResult {
  if (text.trim() === '') {
    return { ok: false, error: { message: 'Empty input' } };
  }
  try {
    const value = JSON.parse(text);
    return { ok: true, root: build(value, null, ROOT_ID, ROOT_PATH) };
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, error: { message, ...locate(message, text) } };
  }
}

function build(
  value: unknown,
  key: string | null,
  id: string,
  path: string,
): TreeNode {
  if (value === null) return { kind: 'null', id, key, path };
  if (typeof value === 'string')
    return { kind: 'string', id, key, path, value };
  if (typeof value === 'number')
    return { kind: 'number', id, key, path, value };
  if (typeof value === 'boolean')
    return { kind: 'boolean', id, key, path, value };
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      id,
      key,
      path,
      children: value.map((v, i) =>
        build(v, String(i), appendPointer(id, i), appendDisplayPath(path, i)),
      ),
    };
  }
  // typeof 'object' && !null && !array → plain object (JSON.parse only emits these)
  const obj = value as Record<string, unknown>;
  return {
    kind: 'object',
    id,
    key,
    path,
    children: Object.entries(obj).map(([k, v]) =>
      build(v, k, appendPointer(id, k), appendDisplayPath(path, k)),
    ),
  };
}

function locate(
  message: string,
  source: string,
): { line?: number; col?: number } {
  const lineColMatch = /\(line (\d+) column (\d+)\)/.exec(message);
  if (lineColMatch) {
    return { line: Number(lineColMatch[1]), col: Number(lineColMatch[2]) };
  }
  const posMatch = /position (\d+)/.exec(message);
  if (posMatch) {
    return positionToLineCol(source, Number(posMatch[1]));
  }
  return {};
}

function positionToLineCol(
  source: string,
  pos: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const stop = Math.min(pos, source.length);
  for (let i = 0; i < stop; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
