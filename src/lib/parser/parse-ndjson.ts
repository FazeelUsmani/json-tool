// NDJSON parse path. Detection happens upstream (TreeView samples the
// first 4KB before dispatching); this module owns the full-file walk
// that builds the line-offset index and emits a virtual TreeNode tree
// (an array root whose children are ndjson-line leaves).
//
// Called from the parser worker in production. The full byte buffer has
// to materialize once to walk newlines; keeping that allocation and scan
// off the main thread preserves the huge-file UX.
//
// The TreeNode tree we produce is intentionally lossless about line
// positions but lossy about line content — line bytes stay in the Blob
// and are sliced on demand by LineRow and DetailDrawer. That keeps the
// in-memory tree size O(N) instead of O(sum-of-line-lengths).

import type { TreeNode } from '@/lib/tree/parse';
import { buildLineIndex, lineCount } from '@/lib/json/ndjson';
import {
  ROOT_ID,
  ROOT_PATH,
  appendDisplayPath,
  appendPointer,
} from './identity';

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
    const lineIndex = children.length;
    children.push({
      kind: 'ndjson-line',
      id: appendPointer(ROOT_ID, lineIndex),
      key: String(lineIndex),
      path: appendDisplayPath(ROOT_PATH, lineIndex),
      byteStart: start,
      byteEnd: contentEnd,
    });
  }

  const root: TreeNode = {
    kind: 'array',
    id: ROOT_ID,
    key: null,
    path: ROOT_PATH,
    children,
  };
  return { root, lineCount: children.length };
}
