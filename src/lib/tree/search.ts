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
  // Lowercase the needle ONCE. The per-row haystack stays original-case
  // and is compared via asciiCaseInsensitiveIncludes — no per-row string
  // allocations. The prior `.toLowerCase().includes()` approach allocated
  // 2 × flat.length lowercase strings per keystroke; on a 2.25M-row file
  // that was 4.5M allocations and dominated the 2-second main-thread INP.
  const needle = asciiToLower(query);
  const deep = stubSearchMatches;
  const matchIndices: number[] = [];
  const visibleSet = new Set<number>();
  const flatLen = flat.length;

  for (let i = 0; i < flatLen; i++) {
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
      for (let j = i + 1; j < flatLen; j++) {
        visibleSet.add(j);
        if (flat[j].kind === 'close' && flat[j].parentIndex === i) break;
      }
    }
  }

  // Pull in close rows whose matching open row is visible — without this
  // we'd render `▾ "users": [` but no closing `]`, which looks broken.
  for (let i = 0; i < flatLen; i++) {
    if (flat[i].kind === 'close' && visibleSet.has(flat[i].parentIndex)) {
      visibleSet.add(i);
    }
  }

  return { matchIndices, visibleSet };
}

function rowMatches(
  row: FlatRow,
  needleLower: string,
  deep: ReadonlySet<string> | undefined,
): boolean {
  if (row.kind === 'close') return false;
  // Key match — applies to open rows (composites) and leaf rows (primitives
  // or empty composites). Root has key === null, can't key-match.
  const key = row.node.key;
  if (key !== null && asciiCaseInsensitiveIncludes(key, needleLower)) {
    return true;
  }
  // Deep match — stubs and lines whose worker-decoded content includes the
  // needle. Path-keyed so a stub at $.events[42] that contains "error"
  // surfaces here without our needing to materialize it client-side.
  if ((row.kind === 'stub' || row.kind === 'line') && deep?.has(row.id)) {
    return true;
  }
  // Value match — only primitives, only leaves.
  if (row.kind !== 'leaf') return false;
  const node = row.node;
  if (node.kind === 'string') {
    return asciiCaseInsensitiveIncludes(node.value, needleLower);
  }
  if (node.kind === 'number') return String(node.value).includes(needleLower);
  if (node.kind === 'boolean') return String(node.value).includes(needleLower);
  // null skipped per spec; empty composites have no value to match.
  return false;
}

// Substring contains-check that case-folds A-Z to a-z on the fly without
// allocating a lowercase copy. `needleLower` is assumed already
// lowercased (the caller in findMatches does this once per query).
//
// ASCII-only case folding — matches the existing searchStubs worker's
// behavior (`parser.worker.ts:106-114`). Non-ASCII characters compare
// case-sensitive in both branches, so result sets stay consistent
// across the sync FlatRow walk and the worker byte scan.
//
// Performance: ~10ns per char on V8, no allocations. Compared to the
// prior `.toLowerCase().includes()` approach (one string allocation per
// row × 2.25M rows = 4.5M allocations per keystroke at 505MB), this
// cuts the dominant cost. Most rows fail on the first-char mismatch
// branch so the per-row scan is typically 1-2 char comparisons, not a
// full needle-length scan.
export function asciiCaseInsensitiveIncludes(
  haystack: string,
  needleLower: string,
): boolean {
  const nLen = needleLower.length;
  if (nLen === 0) return true;
  const hLen = haystack.length;
  if (nLen > hLen) return false;
  const last = hLen - nLen;
  const firstCode = needleLower.charCodeAt(0);
  outer: for (let i = 0; i <= last; i++) {
    let c = haystack.charCodeAt(i);
    if (c >= 65 && c <= 90) c |= 32;
    if (c !== firstCode) continue;
    for (let j = 1; j < nLen; j++) {
      let cc = haystack.charCodeAt(i + j);
      if (cc >= 65 && cc <= 90) cc |= 32;
      if (cc !== needleLower.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
}

// Lowercases ASCII A-Z in a string. Non-ASCII chars pass through
// unchanged. Used only on the search needle (single allocation per
// keystroke), so the slight diff from JS `.toLowerCase()` (which
// case-folds some non-ASCII) doesn't matter for the workloads we
// search against — same trade as the searchStubs byte-level scan.
function asciiToLower(s: string): string {
  let out = '';
  let needsCopy = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      if (!needsCopy) {
        out = s.slice(0, i);
        needsCopy = true;
      }
      out += String.fromCharCode(c | 32);
    } else if (needsCopy) {
      out += s[i];
    }
  }
  return needsCopy ? out : s;
}
