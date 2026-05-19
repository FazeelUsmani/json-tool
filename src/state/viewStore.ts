// Tree-pane view state. Owns the flat row array (derived from a parsed
// TreeNode via flattenTree) and the set of collapsed composite IDs.
//
// `closed` is a Set of JSON-path IDs — paths are stable across reparses of
// unrelated edits, so a user collapsing `$.users[0]` and then typing in
// some unrelated key keeps their collapse. Stale entries for paths that no
// longer exist after major edits are harmless (just memory).
//
// Visibility derivation lives in `flatten.ts` (deriveVisible) so it's
// testable without the React layer. Consumers do
//   const flat = useViewStore(s => s.flat);
//   const closed = useViewStore(s => s.closed);
//   const visible = useMemo(() => deriveVisible(flat, closed), [flat, closed]);
//
// W3-Mon added `root` (the TreeNode tree backing `flat` — needed by
// splice on stub expansion), `expandingPaths` (in-flight expansions for
// spinner display), and `sourceBlob` (the Blob backing the current parse
// — needed by parserHost.expandStub to re-slice byte ranges).
//
// Tipping-point note: viewStore now mixes view state (flat, closed,
// focus, drawer, query) with parser-session state (root, sourceBlob,
// expandingPaths). If anything else parser-input-shaped lands (parse
// options, format detection, NDJSON cursor), split parser fields into a
// dedicated `parserSession` store rather than growing this one further.

import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { flattenTree, type FlatRow } from '@/lib/tree/flatten';
import type { TreeNode } from '@/lib/tree/parse';

// On reparse: preserve focus and drawer by id lookup. The lookup is O(N)
// over the new flat array, but it runs once per debounced reparse (not per
// keystroke), so the cost is bounded. Without preservation, typing in
// Monaco resets the tree-pane focus every 150ms — surprising UX.

// Immer ships Map/Set support behind an opt-in plugin. `closed` is a Set,
// and any toggle() call would throw inside the producer without this.
// Idempotent — safe to call multiple times under HMR.
enableMapSet();

type ViewState = {
  flat: FlatRow[];
  // The TreeNode tree backing `flat`. Held alongside the flat array so
  // stub expansion can splice a materialized subtree into it without
  // reconstructing from FlatRows (lossy round-trip).
  root: TreeNode | null;
  closed: Set<string>;
  // Empty string when no search is active. The (b) visibility rule treats
  // closed as ignored during search — see search.ts.
  query: string;
  // Index into `flat`. Keyboard nav writes this; Breadcrumb + focus styling
  // read it.
  focusedIndex: number | null;
  // The row currently shown in the detail drawer. Null when the drawer is
  // closed. Re-resolved by id on each reparse.
  drawerFor: FlatRow | null;
  // Paths of stubs currently being expanded via parserHost.expandStub.
  // StubRow reads membership to show a spinner; ESC reads non-empty to
  // route abort to the worker.
  expandingPaths: Set<string>;
  // Source Blob for the most recent streaming parse. parserHost.expandStub
  // re-slices this on stub click. Null when nothing parsed yet OR when
  // running via the sync (?streaming=0) path.
  sourceBlob: Blob | null;
};

type ViewActions = {
  setRoot: (root: TreeNode | null) => void;
  toggle: (id: string) => void;
  setQuery: (query: string) => void;
  setFocusedIndex: (index: number | null) => void;
  openDrawer: (row: FlatRow) => void;
  closeDrawer: () => void;
  setExpanding: (path: string, value: boolean) => void;
  setSourceBlob: (blob: Blob | null) => void;
};

export const useViewStore = create<ViewState & ViewActions>()(
  immer((set) => ({
    flat: [],
    root: null,
    closed: new Set<string>(),
    query: '',
    focusedIndex: null,
    drawerFor: null,
    expandingPaths: new Set<string>(),
    sourceBlob: null,
    setRoot: (root) =>
      set((state) => {
        const newFlat = root === null ? [] : flattenTree(root);
        // Snapshot the ids we want to preserve before overwriting state.flat.
        const oldFocusedId =
          state.focusedIndex !== null
            ? (state.flat[state.focusedIndex]?.id ?? null)
            : null;
        const oldDrawerId = state.drawerFor?.id ?? null;
        state.flat = newFlat;
        state.root = root;
        if (oldFocusedId !== null) {
          const idx = newFlat.findIndex((r) => r.id === oldFocusedId);
          state.focusedIndex = idx >= 0 ? idx : null;
        } else {
          state.focusedIndex = null;
        }
        if (oldDrawerId !== null) {
          const row = newFlat.find((r) => r.id === oldDrawerId);
          state.drawerFor = row ?? null;
        } else {
          state.drawerFor = null;
        }
      }),
    toggle: (id) =>
      set((state) => {
        if (state.closed.has(id)) {
          state.closed.delete(id);
        } else {
          state.closed.add(id);
        }
      }),
    setQuery: (query) =>
      set((state) => {
        state.query = query;
      }),
    setFocusedIndex: (index) =>
      set((state) => {
        state.focusedIndex = index;
      }),
    openDrawer: (row) =>
      set((state) => {
        state.drawerFor = row;
      }),
    closeDrawer: () =>
      set((state) => {
        state.drawerFor = null;
      }),
    setExpanding: (path, value) =>
      set((state) => {
        if (value) state.expandingPaths.add(path);
        else state.expandingPaths.delete(path);
      }),
    setSourceBlob: (blob) =>
      set((state) => {
        state.sourceBlob = blob;
      }),
  })),
);
