import type { KeyboardEvent, RefObject } from 'react';
import { toast } from 'sonner';
import type { FlatRow } from '@/lib/tree/flatten';
import { copyText } from '@/lib/clipboard';
import { abort as abortParser } from '@/state/parserHost';

// PageUp/PageDown jump distance in visible rows. Tuned to roughly match
// one screenful at ROW_HEIGHT=24 in the default pane size; not pixel-perfect
// because the actual viewport varies with resize.
const PAGE_JUMP_ROWS = 20;

type Args = {
  flat: FlatRow[];
  visibleFlatIdx: number[];
  idToVisibleIdx: Map<string, number>;
  closed: Set<string>;
  query: string;
  focusedIndex: number | null;
  toggle: (id: string) => void;
  setFocusedIndex: (index: number | null) => void;
  setQuery: (query: string) => void;
  openDrawer: (row: FlatRow) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  // W3-Mon stub expansion: → / Enter on a stub row triggers expansion;
  // ESC during expansion aborts and clears the pending paths.
  expandStubRow: (row: Extract<FlatRow, { kind: 'stub' }>) => void;
  expandingPaths: Set<string>;
  clearExpanding: (path: string) => void;
};

// All keyboard nav for the tree pane: arrows (with PageUp/Down and Home/End),
// Enter/Space, Escape, and `c` for copy-path. The container in TreeView wires
// the returned onKeyDown to its root div.
//
// State touched: viewStore.focusedIndex (via setFocusedIndex), viewStore.closed
// (via toggle), viewStore.query (Escape clears), viewStore.drawerFor (via
// openDrawer). Nothing else.
export function useTreeKeyboardNav({
  flat,
  visibleFlatIdx,
  idToVisibleIdx,
  closed,
  query,
  focusedIndex,
  toggle,
  setFocusedIndex,
  setQuery,
  openDrawer,
  containerRef,
  expandStubRow,
  expandingPaths,
  clearExpanding,
}: Args) {
  const moveFocus = (delta: number) => {
    if (visibleFlatIdx.length === 0) return;
    const currentVisIdx =
      focusedIndex !== null
        ? (idToVisibleIdx.get(flat[focusedIndex]?.id ?? '') ?? -1)
        : -1;
    // First key with no focus jumps to the edge (start for downward keys,
    // end for upward) — not delta rows in. PageDown shouldn't drop you on
    // row 19 just because that's 0 + 20.
    if (currentVisIdx === -1) {
      setFocusedIndex(
        visibleFlatIdx[delta > 0 ? 0 : visibleFlatIdx.length - 1],
      );
      return;
    }
    const next = Math.max(
      0,
      Math.min(visibleFlatIdx.length - 1, currentVisIdx + delta),
    );
    setFocusedIndex(visibleFlatIdx[next]);
  };

  const handleArrowLeft = () => {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'open' && !closed.has(row.id)) {
      toggle(row.id);
      return;
    }
    if (row.parentIndex >= 0) setFocusedIndex(row.parentIndex);
  };

  const handleArrowRight = () => {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'stub') {
      // Mirrors → on a collapsed composite: trigger expansion. Focus stays
      // on the stub row; user presses → again after materialization to
      // descend into the first child (keeps the "→ to expand, → to enter"
      // mental model consistent across spine + stub composites).
      if (!expandingPaths.has(row.id)) expandStubRow(row);
      return;
    }
    if (row.kind !== 'open') return;
    if (closed.has(row.id)) {
      toggle(row.id);
      return;
    }
    // Already expanded — move to first child (the row right after the open
    // in visible order).
    const currentVisIdx = idToVisibleIdx.get(row.id);
    if (
      currentVisIdx !== undefined &&
      currentVisIdx + 1 < visibleFlatIdx.length
    ) {
      setFocusedIndex(visibleFlatIdx[currentVisIdx + 1]);
    }
  };

  const handleEnter = () => {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'open') {
      toggle(row.id);
    } else if (row.kind === 'stub') {
      // Enter on a stub triggers expansion. Drawer is NOT opened — the
      // drawer's "Expand subtree" button is the alt path, and opening
      // both would just duplicate the request.
      if (!expandingPaths.has(row.id)) expandStubRow(row);
    } else if (row.kind === 'leaf') {
      openDrawer(row);
    }
  };

  const handleCopyPath = () => {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'close') return;
    void copyText(row.id).then((ok) => {
      if (ok) toast.success('Path copied', { description: row.id });
      else toast.error('Could not copy');
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Inputs (search) handle their own keys.
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        e.preventDefault();
        if (visibleFlatIdx.length > 0) setFocusedIndex(visibleFlatIdx[0]);
        break;
      case 'End':
        e.preventDefault();
        if (visibleFlatIdx.length > 0)
          setFocusedIndex(visibleFlatIdx[visibleFlatIdx.length - 1]);
        break;
      case 'PageDown':
        e.preventDefault();
        moveFocus(PAGE_JUMP_ROWS);
        break;
      case 'PageUp':
        e.preventDefault();
        moveFocus(-PAGE_JUMP_ROWS);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        handleArrowLeft();
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleArrowRight();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleEnter();
        break;
      case 'Escape':
        if (expandingPaths.size > 0) {
          // Cancel any in-flight stub expansion. The useStubExpansion hook
          // detects an aborted call by checking `expandingPaths.has(id)`
          // after the await returns — clearing them here is the signal.
          for (const path of expandingPaths) clearExpanding(path);
          abortParser();
        } else if (query !== '') {
          setQuery('');
        } else {
          containerRef.current?.blur();
        }
        break;
      case 'c':
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          handleCopyPath();
        }
        break;
    }
  };

  return { onKeyDown };
}
