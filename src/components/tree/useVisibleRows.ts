import { useMemo } from 'react';
import type { FlatRow } from '@/lib/tree/flatten';

export type VisibleRows = {
  visibleRows: FlatRow[];
  visibleFlatIdx: number[];
  idToVisibleIdx: Map<string, number>;
};

// Single-pass visibility computation: rows + parallel flat-index array +
// id → visible-index map. Keyboard nav uses the flat-index array to
// convert a visible position back to the absolute flat index that
// viewStore.focusedIndex stores.
//
// Closed always wins: even during search, a row hidden behind a collapsed
// ancestor stays hidden. Search narrows; it does not force-open. Matches
// inside a collapsed subtree still appear in the count, but the user has
// to expand the parent to see them.
export function useVisibleRows(
  flat: FlatRow[],
  closed: Set<string>,
  query: string,
  visibleSet: Set<number>,
): VisibleRows {
  return useMemo(() => {
    const rows: FlatRow[] = [];
    const fIdx: number[] = [];
    const idMap = new Map<string, number>();
    const hasQuery = query !== '';
    const hasClosedAncestor = (rowIdx: number): boolean => {
      let p = flat[rowIdx].parentIndex;
      while (p >= 0) {
        if (closed.has(flat[p].id)) return true;
        p = flat[p].parentIndex;
      }
      return false;
    };
    for (let i = 0; i < flat.length; i++) {
      const include = hasQuery
        ? visibleSet.has(i) && !hasClosedAncestor(i)
        : !hasClosedAncestor(i);
      if (include) {
        idMap.set(flat[i].id, rows.length);
        fIdx.push(i);
        rows.push(flat[i]);
      }
    }
    return {
      visibleRows: rows,
      visibleFlatIdx: fIdx,
      idToVisibleIdx: idMap,
    };
  }, [flat, closed, query, visibleSet]);
}
