// Per-row lazy materialization for the table view. Two responsibilities:
//
//   1. `fetchRowValue(blob, node)` — pure async helper that resolves
//      a TreeNode to its JS-value equivalent. For materialized
//      composites (object/array/primitive) the value is derived
//      sync via `treeNodeToValue`. For stub-object / stub-array /
//      ndjson-line nodes the blob byte range is sliced and parsed
//      with JSON.parse. Cached in a module-level WeakMap keyed by
//      Blob so a single Blob's lazy-loaded rows survive across
//      remounts; the cache auto-GCs when the Blob is replaced
//      (new file load).
//
//   2. `useRowMaterialization(blob, node)` — React hook around (1)
//      that returns a discriminated-union state for use in row
//      rendering. Synchronous-ready when the node is fully
//      materialized; loading/error/ready transitions when async.
//
// Cache architecture mirrors `useStubPreview.ts` but the value
// is the full parsed row, not a preview byte slice. Different cache
// (different lifecycle: preview is one stub's bytes, row is one
// stub's parsed object), kept parallel rather than unified.
//
// Promise-cache dedupes concurrent fetches of the same row — if
// column-derivation fires a fetch + then a visible row mounts and
// also asks for the same row, both await the same in-flight Promise.

import { useEffect, useState } from 'react';
import type { TreeNode } from '@/lib/tree/parse';

const rowCache = new WeakMap<Blob, Map<string, unknown>>();
const rowLoaders = new WeakMap<Blob, Map<string, Promise<unknown>>>();

function getCachedRow(blob: Blob, rowId: string): unknown | undefined {
  return rowCache.get(blob)?.get(rowId);
}

function setCachedRow(blob: Blob, rowId: string, value: unknown): void {
  let inner = rowCache.get(blob);
  if (!inner) {
    inner = new Map();
    rowCache.set(blob, inner);
  }
  inner.set(rowId, value);
}

function getLoader(blob: Blob, rowId: string): Promise<unknown> | undefined {
  return rowLoaders.get(blob)?.get(rowId);
}

function setLoader(
  blob: Blob,
  rowId: string,
  loader: Promise<unknown>,
): void {
  let inner = rowLoaders.get(blob);
  if (!inner) {
    inner = new Map();
    rowLoaders.set(blob, inner);
  }
  inner.set(rowId, loader);
}

function clearLoader(blob: Blob, rowId: string): void {
  const inner = rowLoaders.get(blob);
  if (!inner) return;
  inner.delete(rowId);
  if (inner.size === 0) rowLoaders.delete(blob);
}

// Sync cache peek — returns the cached row value if present, or
// undefined if not yet fetched. Used by TablePane's sort comparator
// to read row values synchronously inside Array.sort's comparator.
// The sort-click handler awaits fetchRowValue for every row BEFORE
// calling setSortState, so by the time this peek runs every stub
// should be cached. Undefined returns route through the
// null-at-end policy in sortRows — harmless.
export function peekRowCache(blob: Blob, rowId: string): unknown | undefined {
  return getCachedRow(blob, rowId);
}

// Public: convert any TreeNode to its JS-value equivalent. For stubs
// / ndjson-lines this fetches the blob byte range + parses. For
// materialized composites it walks the children tree synchronously.
// Reuses the WeakMap cache so column-derivation pre-fetches feed
// the visible-row hooks.
export async function fetchRowValue(
  blob: Blob | null,
  node: TreeNode,
): Promise<unknown> {
  if (
    node.kind !== 'stub-object' &&
    node.kind !== 'stub-array' &&
    node.kind !== 'ndjson-line'
  ) {
    return treeNodeToValue(node);
  }
  if (!blob) {
    throw new Error('fetchRowValue: stub/line node requires a source blob');
  }
  const cached = getCachedRow(blob, node.path);
  if (cached !== undefined) return cached;
  let loader = getLoader(blob, node.path);
  if (!loader) {
    loader = blob
      .slice(node.byteStart, node.byteEnd)
      .text()
      .then((text) => JSON.parse(text) as unknown);
    setLoader(blob, node.path, loader);
  }
  try {
    const value = await loader;
    setCachedRow(blob, node.path, value);
    clearLoader(blob, node.path);
    return value;
  } catch (err) {
    clearLoader(blob, node.path);
    throw err;
  }
}

// Sync walker for already-materialized TreeNodes. Stubs return `null`
// as a sentinel — but they should never reach this branch because
// fetchRowValue routes them above.
function treeNodeToValue(node: TreeNode): unknown {
  switch (node.kind) {
    case 'null':
      return null;
    case 'string':
    case 'number':
    case 'boolean':
      return node.value;
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const child of node.children) {
        if (child.key !== null) out[child.key] = treeNodeToValue(child);
      }
      return out;
    }
    case 'array':
      return node.children.map(treeNodeToValue);
    case 'stub-object':
    case 'stub-array':
    case 'ndjson-line':
      // Should be unreachable — caller (fetchRowValue) routes these
      // to the async fetch branch.
      return null;
  }
}

export type RowState =
  | { kind: 'ready'; value: unknown }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

// Hook variant — for use inside row components. Returns a state
// machine the renderer can switch on. Stable across react-window
// recycling because the cache survives unmount/remount of the row
// component (WeakMap keyed by Blob, not by component identity).
export function useRowMaterialization(
  sourceBlob: Blob | null,
  node: TreeNode,
): RowState {
  const initialState = computeInitialState(sourceBlob, node);
  const [state, setState] = useState<RowState>(initialState);

  // Derived-state-from-props reset: react-window reuses the same
  // component instance for different rows as the user scrolls.
  // When `node.path` changes, re-derive the state synchronously
  // so we don't briefly render the previous row's data.
  const [prevPath, setPrevPath] = useState(node.path);
  if (prevPath !== node.path) {
    setPrevPath(node.path);
    setState(computeInitialState(sourceBlob, node));
  }

  useEffect(() => {
    if (state.kind === 'ready' || state.kind === 'error') return;
    if (!sourceBlob) return;
    let cancelled = false;
    fetchRowValue(sourceBlob, node)
      .then((value) => {
        if (!cancelled) setState({ kind: 'ready', value });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setState({ kind: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceBlob, node, state.kind]);

  return state;
}

function computeInitialState(
  blob: Blob | null,
  node: TreeNode,
): RowState {
  const needsFetch =
    node.kind === 'stub-object' ||
    node.kind === 'stub-array' ||
    node.kind === 'ndjson-line';
  if (!needsFetch) {
    return { kind: 'ready', value: treeNodeToValue(node) };
  }
  if (!blob) {
    return { kind: 'error', message: 'No source blob available for stub row' };
  }
  const cached = getCachedRow(blob, node.path);
  if (cached !== undefined) return { kind: 'ready', value: cached };
  return { kind: 'loading' };
}
