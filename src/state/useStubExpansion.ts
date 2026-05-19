import { useCallback } from 'react';
import { toast } from 'sonner';
import { expandStub as workerExpandStub } from './parserHost';
import { spliceSubtree } from '@/lib/tree/splice';
import { useViewStore } from './viewStore';
import type { FlatRow } from '@/lib/tree/flatten';

// Single entry point for stub-expansion. Called from StubRow click, ←/→
// /Enter keyboard handlers, and DetailDrawer's "Expand subtree" button —
// all three trigger the same flow so behavior stays uniform across
// surfaces.
//
// Cancellation contract: ESC sets the path's expandingPaths flag to
// false BEFORE calling parserHost.abort(). When the awaited expandStub
// returns (either with a partial result or via worker termination), we
// check whether the path is still in expandingPaths. If not, the user
// aborted — suppress toast and skip splice. Worker errors that DIDN'T
// originate from a user abort surface as toasts.
//
// Concurrent expansions on the SAME path are guarded at entry. Different
// paths: not serialized for W3-Mon; the worker's abortFlag is recreated
// per call so concurrent calls run independently. If multi-stub race
// surfaces as a real issue, queue here.
export function useStubExpansion() {
  const setRoot = useViewStore((s) => s.setRoot);
  const setExpanding = useViewStore((s) => s.setExpanding);

  return useCallback(
    async (row: Extract<FlatRow, { kind: 'stub' }>) => {
      const initial = useViewStore.getState();
      if (initial.expandingPaths.has(row.id)) return; // already in flight
      if (!initial.root || !initial.sourceBlob) {
        toast.error('Cannot expand: no source available');
        return;
      }
      const { sourceBlob } = initial;

      setExpanding(row.id, true);

      let result: Awaited<ReturnType<typeof workerExpandStub>> | null = null;
      let caught: unknown = null;
      try {
        result = await workerExpandStub(
          sourceBlob,
          row.node.byteStart,
          row.node.byteEnd,
          row.id,
        );
      } catch (err) {
        caught = err;
      }

      // ESC during expansion clears expandingPaths for this row BEFORE
      // calling abort(). If the path was removed by the time we get here,
      // the user cancelled — drop the result on the floor.
      const userAborted = !useViewStore
        .getState()
        .expandingPaths.has(row.id);
      if (!userAborted) setExpanding(row.id, false);
      if (userAborted) return;

      if (caught) {
        toast.error('Could not expand subtree', {
          description:
            caught instanceof Error ? caught.message : String(caught),
        });
        return;
      }
      if (!result) return;
      if (result.parseError) {
        toast.error('Could not expand subtree', {
          description: result.parseError.message,
        });
        return;
      }
      if (!result.root) return;

      const currentRoot = useViewStore.getState().root;
      if (!currentRoot) return;
      setRoot(spliceSubtree(currentRoot, row.id, result.root));
    },
    [setRoot, setExpanding],
  );
}
