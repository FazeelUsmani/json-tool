import { useEffect, useMemo, useState } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { useDocumentStore } from '@/state/documentStore';
import { useViewStore } from '@/state/viewStore';
import {
  parseToTree,
  type ParseTreeError,
} from '@/lib/tree/parse';
import { deriveVisible, type FlatRow } from '@/lib/tree/flatten';
import { findMatches } from '@/lib/tree/search';
import { TreeNode } from './TreeNode';
import { TreeSearch } from './TreeSearch';

// W2-Mon: tree pane reads from the flat row array in viewStore. The 150ms
// debounce keeps typing in Monaco from re-parsing on every keystroke; the
// previous successful parse stays visible during the debounce window.
//
// W2-Tue: render via react-window's <List> so only visible rows are mounted.
// Row height locked at 24px; the List fills its parent via style.
//
// W2-Wed: search bar above the list. When a query is active, the `closed`
// Set is ignored for visibility (search match in a collapsed subtree should
// still show); clearing the query restores the collapse state.
const PARSE_DEBOUNCE_MS = 150;
const ROW_HEIGHT = 24;

export function TreeView() {
  const text = useDocumentStore((s) => s.text);
  const setRoot = useViewStore((s) => s.setRoot);
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  const query = useViewStore((s) => s.query);
  const [parseError, setParseError] = useState<ParseTreeError | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const listRef = useListRef(null);

  useEffect(() => {
    if (text.trim() === '') {
      setRoot(null);
      setParseError(null);
      return;
    }
    const handle = setTimeout(() => {
      const result = parseToTree(text);
      if (result.ok) {
        setRoot(result.root);
        setParseError(null);
      } else {
        setParseError(result.error);
      }
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, setRoot]);

  const { matchIndices, visibleSet } = useMemo(
    () => findMatches(flat, query),
    [flat, query],
  );

  // Reset the match cursor when the query (and therefore the match set)
  // changes. Otherwise the user clears search → types a new one → arrow
  // navigation starts from a stale index.
  useEffect(() => {
    setCurrentMatch(0);
  }, [query]);

  // Build the visible-rows array AND an id → visible-index map. Keying
  // the map by `row.id` (a JSON path) is more robust than indexing by
  // flat-array position with an identity match — a future refactor of
  // `deriveVisible` to map/clone rows wouldn't silently break jump-to-match.
  const { visibleRows, idToVisibleIdx } = useMemo(() => {
    const rows: FlatRow[] = query
      ? flat.filter((_, i) => visibleSet.has(i))
      : deriveVisible(flat, closed);
    const map = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      map.set(rows[i].id, i);
    }
    return { visibleRows: rows, idToVisibleIdx: map };
  }, [flat, closed, query, visibleSet]);

  // Memoized so react-window's internal prop-change detector doesn't
  // re-render every visible row on every parent render when the row data
  // is stable.
  const rowProps = useMemo(() => ({ rows: visibleRows }), [visibleRows]);

  const handleJump = (direction: 'next' | 'prev') => {
    if (matchIndices.length === 0) return;
    const next =
      direction === 'next'
        ? (currentMatch + 1) % matchIndices.length
        : (currentMatch - 1 + matchIndices.length) % matchIndices.length;
    setCurrentMatch(next);
    const visibleIdx = idToVisibleIdx.get(flat[matchIndices[next]].id);
    if (visibleIdx !== undefined) {
      listRef.current?.scrollToRow({ index: visibleIdx, align: 'smart' });
    }
  };

  if (text.trim() === '') {
    return (
      <Hint>Type or paste JSON in the editor to see the tree here.</Hint>
    );
  }
  if (flat.length === 0 && parseError) {
    return <ParseErrorView error={parseError} />;
  }
  if (flat.length === 0) {
    return null;
  }
  return (
    <div className="flex h-full flex-col font-mono text-xs">
      {parseError && <ParsePausedBanner error={parseError} />}
      <TreeSearch
        matchCount={matchIndices.length}
        currentMatch={currentMatch}
        onJump={handleJump}
      />
      <div className="min-h-0 flex-1">
        {query !== '' && visibleRows.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <List
            listRef={listRef}
            rowComponent={VirtualRow}
            rowCount={visibleRows.length}
            rowHeight={ROW_HEIGHT}
            rowProps={rowProps}
            overscanCount={10}
            style={{ height: '100%' }}
          />
        )}
      </div>
    </div>
  );
}

// Shows when text is non-empty AND the latest parse failed BUT we still
// have a previous-good flat array on display. Tells the user the tree
// isn't tracking their current keystrokes — without it, the stale tree
// looks like a non-reactive bug.
function ParsePausedBanner({ error }: { error: ParseTreeError }) {
  const where =
    error.line !== undefined && error.col !== undefined
      ? `line ${error.line}, col ${error.col}`
      : error.message;
  return (
    <div className="border-b border-yellow-300/50 bg-yellow-100/60 px-3 py-1 text-[11px] text-yellow-900 dark:border-yellow-700/50 dark:bg-yellow-900/30 dark:text-yellow-200">
      <span className="font-medium">Tree paused</span> — invalid JSON at{' '}
      {where}. Showing last successful parse.
    </div>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      No matches for &ldquo;{query}&rdquo;.
    </div>
  );
}

function VirtualRow({
  index,
  style,
  rows,
}: RowComponentProps<{ rows: FlatRow[] }>) {
  return (
    <div style={style}>
      <TreeNode row={rows[index]} />
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      {children}
    </div>
  );
}

function ParseErrorView({ error }: { error: ParseTreeError }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm">
      <div className="text-destructive font-medium">Invalid JSON</div>
      <div className="text-muted-foreground text-center text-xs">
        {error.line !== undefined && error.col !== undefined
          ? `Line ${error.line}, column ${error.col}`
          : error.message}
      </div>
    </div>
  );
}
