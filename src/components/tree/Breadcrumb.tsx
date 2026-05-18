import { useViewStore } from '@/state/viewStore';
import type { FlatRow } from '@/lib/tree/flatten';

// Renders the parent chain of the focused row as a clickable breadcrumb.
// Walks parentIndex from the focused row to root. Close rows redirect to
// their matching open row — focusing a close shows the same path as
// focusing the open.
//
// Deep paths (20+ levels) overflow horizontally rather than wrapping or
// truncating. W4 polish can revisit middle-ellipsis if it becomes a real
// problem on actual files.

export function Breadcrumb() {
  const flat = useViewStore((s) => s.flat);
  const focusedIndex = useViewStore((s) => s.focusedIndex);
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);

  if (focusedIndex === null || focusedIndex >= flat.length) return null;
  const segments = walkPath(flat, focusedIndex);
  if (segments.length === 0) return null;

  return (
    <nav className="bg-muted/20 flex items-center gap-1 overflow-x-auto border-b px-3 py-1 text-xs whitespace-nowrap">
      {segments.map((seg, i) => (
        <span key={seg.flatIdx} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">›</span>}
          <button
            type="button"
            onClick={() => setFocusedIndex(seg.flatIdx)}
            className="text-foreground/80 hover:text-foreground rounded px-1 hover:underline"
          >
            {seg.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

type Segment = { flatIdx: number; label: string };

function walkPath(flat: FlatRow[], startIdx: number): Segment[] {
  // Close rows have no node — redirect to the matching open so the
  // breadcrumb shows the composite's path.
  let i = flat[startIdx].kind === 'close' ? flat[startIdx].parentIndex : startIdx;
  const segments: Segment[] = [];
  while (i >= 0) {
    const row = flat[i];
    if (row.kind === 'close') {
      i = row.parentIndex;
      continue;
    }
    const label = row.node.key ?? '$';
    segments.unshift({ flatIdx: i, label });
    i = row.parentIndex;
  }
  return segments;
}
