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

import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { flattenTree, type FlatRow } from '@/lib/tree/flatten';
import type { TreeNode } from '@/lib/tree/parse';

// Immer ships Map/Set support behind an opt-in plugin. `closed` is a Set,
// and any toggle() call would throw inside the producer without this.
// Idempotent — safe to call multiple times under HMR.
enableMapSet();

type ViewState = {
  flat: FlatRow[];
  closed: Set<string>;
};

type ViewActions = {
  setRoot: (root: TreeNode | null) => void;
  toggle: (id: string) => void;
};

export const useViewStore = create<ViewState & ViewActions>()(
  immer((set) => ({
    flat: [],
    closed: new Set<string>(),
    setRoot: (root) =>
      set((state) => {
        state.flat = root === null ? [] : flattenTree(root);
      }),
    toggle: (id) =>
      set((state) => {
        if (state.closed.has(id)) {
          state.closed.delete(id);
        } else {
          state.closed.add(id);
        }
      }),
  })),
);
