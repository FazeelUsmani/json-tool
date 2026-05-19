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

import type { FlatRow } from './flatten';

export type SearchResult = {
  matchIndices: number[];          // flat-array indices of matched rows
  visibleSet: Set<number>;         // flat-array indices of rows to render
};

export function findMatches(flat: FlatRow[], query: string): SearchResult {
  if (query === '') {
    return { matchIndices: [], visibleSet: new Set() };
  }
  const needle = query.toLowerCase();
  const matchIndices: number[] = [];
  const visibleSet = new Set<number>();

  for (let i = 0; i < flat.length; i++) {
    if (!rowMatches(flat[i], needle)) continue;
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

function rowMatches(row: FlatRow, needle: string): boolean {
  if (row.kind === 'close') return false;
  // Key match — applies to open rows (composites) and leaf rows (primitives
  // or empty composites). Root has key === null, can't key-match.
  const key = row.node.key;
  if (key !== null && key.toLowerCase().includes(needle)) return true;
  // Value match — only primitives, only leaves.
  if (row.kind !== 'leaf') return false;
  const node = row.node;
  if (node.kind === 'string') return node.value.toLowerCase().includes(needle);
  if (node.kind === 'number') return String(node.value).includes(needle);
  if (node.kind === 'boolean') return String(node.value).includes(needle);
  // null skipped per spec; empty composites have no value to match.
  return false;
}
