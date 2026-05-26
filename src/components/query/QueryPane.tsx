// JSONPath query bar pane — third tab in RightPane (Tree / Schema /
// Table / Query). Live query input + virtualized result list +
// click-to-focus integration with the existing tree.
//
// Architecture (per design pass 2026-05-26):
//
//   - Query runs synchronously on the main thread via jsonpath-plus
//     (see src/lib/query/jsonpath.ts header for the worker-routing
//     deferral reasoning).
//   - Debounce input by 200ms so the user gets fast feedback while
//     typing without re-running on every keystroke.
//   - Click on a result row → check if the target is reachable in
//     the current flat view; if reachable, setFocusedIndex (existing
//     viewStore action) + signal RightPane to switch to the Tree
//     tab. If not reachable (inside a collapsed parent OR inside an
//     unmaterialized stub), toast — auto-expanding parents on click
//     felt jarring during design, the toast educates users about
//     the stub/collapse model.
//
// Stub limitation is also explained in the footer chip — users see
// the model both proactively (chip) and reactively (toast on miss).

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { runQuery, type QueryMatch } from '@/lib/query/jsonpath';
import { useViewStore } from '@/state/viewStore';
import type { TreeNode } from '@/lib/tree/parse';

type Props = {
  root: TreeNode | null;
  // Invoked when the user clicks a result row that's reachable —
  // RightPane switches to the Tree tab so the focused row is
  // actually visible after the existing scroll-to-focused-row effect
  // in TreeView fires.
  onJumpToTree: () => void;
};

export function QueryPane({ root, onJumpToTree }: Props) {
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce 200ms so a held key doesn't run jsonpath-plus per
  // keystroke. Faster than the schema-tab inference cadence because
  // queries are typically smaller than full inference walks.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  const result = useMemo(() => {
    if (root === null) {
      return { ok: true as const, matches: [] as QueryMatch[] };
    }
    return runQuery(root, debounced);
  }, [root, debounced]);

  const handleResultClick = (pointer: string) => {
    const idx = flat.findIndex((r) => r.id === pointer);
    if (idx === -1) {
      // Pointer not in flat at all — pointer belongs to a stub
      // composite that hasn't been materialized. The query lib's
      // TreeNode-to-plain conversion treats stubs as null, so this
      // path is hit when the user's query happens to land on a stub
      // node directly (rare but possible for `$..lazyKey`-style).
      toast(
        'Match is inside an unmaterialized stub — expand the parent in the Tree first, then re-run the query.',
      );
      return;
    }
    // Check if any ancestor is collapsed → target row exists in
    // flat but won't render visibly. Ancestors are derived from the
    // pointer's segments.
    if (anyAncestorClosed(pointer, closed)) {
      toast(
        'Match is inside a collapsed subtree — expand parent rows in the Tree to view.',
      );
      return;
    }
    setFocusedIndex(idx);
    onJumpToTree();
  };

  const empty = root === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-3 space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="$.events[*].user.plan"
          disabled={empty}
          className="font-mono text-xs"
        />
        <div className="text-muted-foreground text-xs">
          {empty ? (
            'Load JSON to run queries.'
          ) : result.ok ? (
            <>
              <strong className="font-medium">{result.matches.length}</strong>{' '}
              match{result.matches.length === 1 ? '' : 'es'}
              {debounced === '' && ' · type a JSONPath expression to begin'}
            </>
          ) : (
            <span className="text-destructive">
              Invalid query: {result.error}
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {result.ok && result.matches.length > 0 && (
          <ul className="font-mono text-xs">
            {result.matches.map((m) => (
              <li
                key={m.pointer}
                className="border-border/40 border-b last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => handleResultClick(m.pointer)}
                  className="hover:bg-muted/60 flex w-full items-baseline gap-2 px-3 py-1.5 text-left"
                  title={m.jsonpath}
                  data-testid="query-result-row"
                >
                  <span className="text-muted-foreground truncate">
                    {m.jsonpath}
                  </span>
                  <span className="text-foreground/80 truncate">
                    {previewValue(m.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-muted-foreground border-t px-3 py-2 text-[10px] leading-tight">
        Queries match materialized spine + leaves. Matches inside
        collapsed subtrees or unmaterialized stubs (composites past
        depth&nbsp;2) are invisible — expand first to include them.
      </div>
    </div>
  );
}

// Check whether any ancestor of `pointer` is in the closed-set. The
// pointer itself is excluded — we're checking "can the row at this
// pointer be visible?" not "is this row's own collapsed state set."
function anyAncestorClosed(pointer: string, closed: Set<string>): boolean {
  // Empty pointer = root, no ancestors.
  if (pointer === '') return false;
  const segments = pointer.split('/');
  // segments[0] is '' (leading slash), the last segment is the leaf;
  // ancestors are the prefixes that themselves represent composites.
  // Also check the empty pointer (the root) which IS an ancestor of
  // every non-root pointer.
  if (closed.has('')) return true;
  for (let i = 1; i < segments.length - 1; i++) {
    const ancestor = segments.slice(0, i + 1).join('/');
    if (closed.has(ancestor)) return true;
  }
  return false;
}

function previewValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  switch (typeof value) {
    case 'string': {
      const truncated = value.length > 60 ? value.slice(0, 60) + '…' : value;
      return JSON.stringify(truncated);
    }
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'object':
      if (Array.isArray(value)) {
        return `[…${value.length}]`;
      }
      return `{…${Object.keys(value as object).length}}`;
    default:
      return '';
  }
}
