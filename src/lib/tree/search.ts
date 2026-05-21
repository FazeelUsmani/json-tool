// Substring search over a flat row array.
//
// Returns: matches + every ancestor on the parentIndex chain + (for a
// matched open row) every descendant + close rows whose open is visible.
// The output is independent of the viewStore's `closed` Set — the consumer
// (TreeView) intersects this visibleSet with the collapse state. Closed
// subtrees stay collapsed during search; matches inside them are counted
// but rendered only after the user expands the parent.
//
// Match target: keys + string/number/bool values. `null` skipped. Close rows
// don't match (no semantic content).
//
// W3-Thu+ deep matches: when `stubSearchMatches` is provided, any stub or
// ndjson-line row whose path is in the set is also counted as a match.
// That path comes from the worker's searchStubs scan — it sees content
// inside collapsed stubs that the sync FlatRow walk can't reach. Folded
// into the same matchIndices array so the existing N/M count + jump-to-
// next-match UX absorbs deep matches without a parallel data structure.

import type { FlatRow } from './flatten';
import type { TreeNode } from './parse';

/**
 * Walks a TreeNode tree and emits the byte ranges of every stub-object,
 * stub-array, and ndjson-line node — the kinds whose content isn't in
 * FlatRow and therefore is invisible to the synchronous findMatches.
 * Used to feed the worker's searchStubs scan.
 *
 * Includes empty stubs (childCount=0) since their byte range still
 * decodes to `{}` / `[]` — harmless to scan, easier than filtering.
 */
export function collectStubRanges(
  root: TreeNode | null,
): { path: string; byteStart: number; byteEnd: number }[] {
  const out: { path: string; byteStart: number; byteEnd: number }[] = [];
  if (!root) return out;
  walk(root, out);
  return out;
}

function walk(
  node: TreeNode,
  out: { path: string; byteStart: number; byteEnd: number }[],
): void {
  if (
    node.kind === 'stub-object' ||
    node.kind === 'stub-array' ||
    node.kind === 'ndjson-line'
  ) {
    out.push({
      path: node.path,
      byteStart: node.byteStart,
      byteEnd: node.byteEnd,
    });
    return;
  }
  if (node.kind === 'object' || node.kind === 'array') {
    for (const c of node.children) walk(c, out);
  }
}

export type SearchResult = {
  matchIndices: number[];          // flat-array indices of matched rows
  visibleSet: Set<number>;         // flat-array indices of rows to render
};

export function findMatches(
  flat: FlatRow[],
  query: string,
  stubSearchMatches?: ReadonlySet<string>,
): SearchResult {
  if (query === '') {
    return { matchIndices: [], visibleSet: new Set() };
  }
  const needle = query.toLowerCase();
  const deep = stubSearchMatches;
  const matchIndices: number[] = [];
  const visibleSet = new Set<number>();

  for (let i = 0; i < flat.length; i++) {
    if (!rowMatches(flat[i], needle, deep)) continue;
    matchIndices.push(i);
    visibleSet.add(i);
    // Walk ancestors via parentIndex chain
    let p = flat[i].parentIndex;
    while (p >= 0 && !visibleSet.has(p)) {
      visibleSet.add(p);
      p = flat[p].parentIndex;
    }
    // If the match is on a composite open row, include its entire subtree.
    // Without this, searching "meta" on {"meta":{...}} shows
    // `▾ "meta": { … }` with no contents, which looks like the search
    // found nothing inside. Cost: a top-level key match on a 100k-element
    // array puts the whole tree in visibleSet — fine for react-window's
    // virtualized rendering.
    if (flat[i].kind === 'open') {
      for (let j = i + 1; j < flat.length; j++) {
        visibleSet.add(j);
        if (flat[j].kind === 'close' && flat[j].parentIndex === i) break;
      }
    }
  }

  // Pull in close rows whose matching open row is visible — without this
  // we'd render `▾ "users": [` but no closing `]`, which looks broken.
  for (let i = 0; i < flat.length; i++) {
    if (flat[i].kind === 'close' && visibleSet.has(flat[i].parentIndex)) {
      visibleSet.add(i);
    }
  }

  return { matchIndices, visibleSet };
}

function rowMatches(
  row: FlatRow,
  needle: string,
  deep: ReadonlySet<string> | undefined,
): boolean {
  if (row.kind === 'close') return false;
  // Key match — applies to open rows (composites) and leaf rows (primitives
  // or empty composites). Root has key === null, can't key-match.
  const key = row.node.key;
  if (key !== null && key.toLowerCase().includes(needle)) return true;
  // Deep match — stubs and lines whose worker-decoded content includes the
  // needle. Path-keyed so a stub at $.events[42] that contains "error"
  // surfaces here without our needing to materialize it client-side.
  if ((row.kind === 'stub' || row.kind === 'line') && deep?.has(row.id)) {
    return true;
  }
  // Value match — only primitives, only leaves.
  if (row.kind !== 'leaf') return false;
  const node = row.node;
  if (node.kind === 'string') return node.value.toLowerCase().includes(needle);
  if (node.kind === 'number') return String(node.value).includes(needle);
  if (node.kind === 'boolean') return String(node.value).includes(needle);
  // null skipped per spec; empty composites have no value to match.
  return false;
}
