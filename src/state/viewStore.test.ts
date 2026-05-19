import { beforeEach, describe, expect, test } from 'vitest';
import { useViewStore } from './viewStore';
import type { TreeNode } from '@/lib/tree/parse';

// Targets the W2-Thu invariant: setRoot must re-resolve focusedIndex and
// drawerFor by id after reparse — typing in the editor reparses every
// 150ms, and resetting both would yank focus + close the drawer mid-keystroke.
// Also load-bearing for W3-Mon stub expansion: splicing a materialized
// subtree into the root triggers setRoot; the drawer (if open on the now-
// materialized row) must rerender with CompositeBody instead of closing.

function obj(
  key: string | null,
  path: string,
  children: TreeNode[],
): TreeNode {
  return { kind: 'object', key, path, children };
}
function num(key: string | null, path: string, value: number): TreeNode {
  return { kind: 'number', key, path, value };
}

describe('viewStore.setRoot — id preservation', () => {
  beforeEach(() => {
    // Reset store between tests. Zustand exposes setState but we just
    // null-out via the public action.
    useViewStore.getState().setRoot(null);
    useViewStore.getState().closeDrawer();
    useViewStore.getState().setFocusedIndex(null);
  });

  test('preserves focusedIndex when the same path exists in the new flat', () => {
    const rootA = obj(null, '$', [num('a', '$.a', 1), num('b', '$.b', 2)]);
    useViewStore.getState().setRoot(rootA);
    // Focus row index 1 ($.a — index 1 because flat is [open $, leaf $.a, leaf $.b, close $]).
    const flatA = useViewStore.getState().flat;
    const aIdx = flatA.findIndex((r) => r.id === '$.a');
    useViewStore.getState().setFocusedIndex(aIdx);

    // Reparse: $ gains a new sibling key 'c'. Path $.a still exists.
    const rootB = obj(null, '$', [
      num('a', '$.a', 1),
      num('b', '$.b', 2),
      num('c', '$.c', 3),
    ]);
    useViewStore.getState().setRoot(rootB);

    const flatB = useViewStore.getState().flat;
    const focusedB = useViewStore.getState().focusedIndex;
    expect(focusedB).not.toBeNull();
    expect(flatB[focusedB!].id).toBe('$.a');
  });

  test('preserves drawerFor when the same path exists in the new flat', () => {
    const rootA = obj(null, '$', [num('a', '$.a', 1)]);
    useViewStore.getState().setRoot(rootA);
    const flatA = useViewStore.getState().flat;
    const rowA = flatA.find((r) => r.id === '$.a')!;
    useViewStore.getState().openDrawer(rowA);

    // Reparse: value of $.a changes (1 → 99) but the path is identical.
    const rootB = obj(null, '$', [num('a', '$.a', 99)]);
    useViewStore.getState().setRoot(rootB);

    const drawerForB = useViewStore.getState().drawerFor;
    expect(drawerForB).not.toBeNull();
    expect(drawerForB!.id).toBe('$.a');
    // The drawerFor row is the NEW row reference (refreshed by id-lookup),
    // not the stale rowA reference.
    expect(drawerForB).not.toBe(rowA);
  });

  test('clears focusedIndex when the previous path no longer exists', () => {
    const rootA = obj(null, '$', [num('a', '$.a', 1)]);
    useViewStore.getState().setRoot(rootA);
    const aIdx = useViewStore.getState().flat.findIndex((r) => r.id === '$.a');
    useViewStore.getState().setFocusedIndex(aIdx);

    // Reparse: $.a is replaced with $.x. Old path is gone.
    const rootB = obj(null, '$', [num('x', '$.x', 1)]);
    useViewStore.getState().setRoot(rootB);

    expect(useViewStore.getState().focusedIndex).toBeNull();
  });

  test('clears drawerFor when the previous path no longer exists', () => {
    const rootA = obj(null, '$', [num('a', '$.a', 1)]);
    useViewStore.getState().setRoot(rootA);
    const rowA = useViewStore.getState().flat.find((r) => r.id === '$.a')!;
    useViewStore.getState().openDrawer(rowA);

    const rootB = obj(null, '$', [num('x', '$.x', 1)]);
    useViewStore.getState().setRoot(rootB);

    expect(useViewStore.getState().drawerFor).toBeNull();
  });

  test('stores the root TreeNode for downstream consumers (e.g. splice)', () => {
    const rootA = obj(null, '$', [num('a', '$.a', 1)]);
    useViewStore.getState().setRoot(rootA);
    expect(useViewStore.getState().root).toBe(rootA);
    useViewStore.getState().setRoot(null);
    expect(useViewStore.getState().root).toBeNull();
  });
});
