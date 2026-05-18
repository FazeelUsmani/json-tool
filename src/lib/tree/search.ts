// Substring search over a flat row array.
//
// W2-Wed: filter mode. Visible-during-search = matches + every ancestor on
// the parentIndex chain + close rows whose open is visible. The viewStore's
// `closed` Set is ignored while a query is active — that's the user-approved
// (b) interaction: searching should never appear to "find nothing" because
// the match was hidden inside a collapsed subtree. Clearing the query
// restores the collapse state.
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
