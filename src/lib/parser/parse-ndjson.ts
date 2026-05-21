// NDJSON parse path. Detection happens upstream (TreeView samples the
// first 4KB before dispatching); this module owns the full-file walk
// that builds the line-offset index and emits a virtual TreeNode tree
// (an array root whose children are ndjson-line leaves).
//
// Runs main-thread for v1 — see PLAN.MD W3-Thu. The full byte buffer
// has to materialize once to walk newlines; for 200MB that's a ~200ms
// allocation + ~100ms scan in V8. Acceptable for a one-shot per file;
// move into the worker if the smoke shows main-thread blocking.
//
// The TreeNode tree we produce is intentionally lossless about line
// positions but lossy about line content — line bytes stay in the Blob
// and are sliced on demand by LineRow and DetailDrawer. That keeps the
// in-memory tree size O(N) instead of O(sum-of-line-lengths).

import type { TreeNode } from '@/lib/tree/parse';
import { buildLineIndex, lineCount } from '@/lib/json/ndjson';

export type ParseNdjsonResult = {
  root: TreeNode;
  // Total non-blank lines emitted. Equal to lineCount(index) for
  // newline-terminated files; one less when the file ends without LF
  // and the trailing slot is empty (kept as a sentinel inside
  // buildLineIndex).
  lineCount: number;
};

/**
 * Reads the Blob's full bytes once, walks for newlines, and emits a
 * root array TreeNode whose children are ndjson-line nodes pointing at
 * each line's byte range.
 *
 * Skips blank lines (consecutive LFs) — those produce zero-length
 * ranges that would round-trip to empty `JSON.parse` failures and add
 * no information. Trailing LF likewise.
 */
export async function parseNdjson(blob: Blob): Promise<ParseNdjsonResult> {
  // Blob.bytes() (modern Chrome/Safari) avoids the ArrayBuffer copy that
  // .arrayBuffer() does; fall back when unavailable.
  const bytes =
    typeof (blob as Blob & { bytes?: () => Promise<Uint8Array> }).bytes ===
    'function'
      ? await (blob as Blob & { bytes: () => Promise<Uint8Array> }).bytes()
      : new Uint8Array(await blob.arrayBuffer());

  const index = buildLineIndex(bytes);
  const total = lineCount(index);
  const children: TreeNode[] = [];

  for (let i = 0; i < total; i++) {
    const start = index[i];
    const end = index[i + 1];
    // Trim the trailing LF (and CR if CRLF) for the line's logical
    // content range. The drawer parses bytes[start..end), so we want
    // end to be exclusive of the line separator.
    let contentEnd = end;
    if (contentEnd > start && bytes[contentEnd - 1] === 0x0a) contentEnd--;
    if (contentEnd > start && bytes[contentEnd - 1] === 0x0d) contentEnd--;
    // Skip completely blank lines.
    if (contentEnd === start) continue;
    children.push({
      kind: 'ndjson-line',
      key: String(children.length),
      path: `$[${children.length}]`,
      byteStart: start,
      byteEnd: contentEnd,
    });
  }

  const root: TreeNode = {
    kind: 'array',
    key: null,
    path: '$',
    children,
  };
  return { root, lineCount: children.length };
}
