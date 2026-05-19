import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { toast } from 'sonner';
import { useDocumentStore } from '@/state/documentStore';
import { useViewStore } from '@/state/viewStore';
import {
  parseToTree,
  type ParseTreeError,
} from '@/lib/tree/parse';
import { type FlatRow } from '@/lib/tree/flatten';
import { findMatches } from '@/lib/tree/search';
import { copyText } from '@/lib/clipboard';
import { TreeNode } from './TreeNode';
import { TreeSearch } from './TreeSearch';
import { Breadcrumb } from './Breadcrumb';
import { DetailDrawer } from './DetailDrawer';

// W2-Mon: tree pane reads from the flat row array in viewStore. The 150ms
// debounce keeps typing in Monaco from re-parsing on every keystroke; the
// previous successful parse stays visible during the debounce window.
//
// W2-Tue: render via react-window's <List> so only visible rows are mounted.
//
// W2-Wed: search bar filters with ancestor-inclusion + jump-to-match.
//
// W2-Thu: keyboard nav, breadcrumb of the focused row's path, and a detail
// drawer for primitive Enter + Info-icon clicks. Global `/` focuses the
// search input unless typing in any input/textarea.
const PARSE_DEBOUNCE_MS = 150;
const ROW_HEIGHT = 24;
const PAGE_JUMP_ROWS = 20;

export function TreeView() {
  const text = useDocumentStore((s) => s.text);
  const setRoot = useViewStore((s) => s.setRoot);
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  const query = useViewStore((s) => s.query);
  const setQuery = useViewStore((s) => s.setQuery);
  const focusedIndex = useViewStore((s) => s.focusedIndex);
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);
  const toggle = useViewStore((s) => s.toggle);
  const openDrawer = useViewStore((s) => s.openDrawer);
  const [parseError, setParseError] = useState<ParseTreeError | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setCurrentMatch(0);
  }, [query]);

  // Single-pass visibility computation: rows + parallel flat-index array +
  // id → visible-index map. The flat-index array is what keyboard nav uses
  // to convert a visible position back to the absolute flat index that
  // viewStore.focusedIndex stores.
  const { visibleRows, visibleFlatIdx, idToVisibleIdx } = useMemo(() => {
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
      // Closed always wins: even during search, a row hidden behind a
      // collapsed ancestor stays hidden. Search narrows; it does not
      // force-open. Matches inside a collapsed subtree still appear in
      // the count, but the user has to expand the parent to see them.
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

  // Memoized so react-window's internal prop-change detector doesn't
  // re-render every visible row on every parent render when the row data
  // is stable.
  const rowProps = useMemo(
    () => ({ rows: visibleRows, visibleFlatIdx }),
    [visibleRows, visibleFlatIdx],
  );

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

  // Auto-scroll the focused row into view. Fires on keyboard nav AND
  // click-to-focus; `align: 'smart'` makes the latter a no-op when the row
  // is already visible.
  //
  // rAF-coalesced: a held arrow key fires focusedIndex changes ~30/s, and
  // each scrollToRow synchronously reads layout. The cleanup cancels any
  // pending frame so only the latest focus position actually scrolls,
  // capped at one scrollToRow per paint.
  useEffect(() => {
    if (focusedIndex === null) return;
    const focusedId = flat[focusedIndex]?.id;
    if (!focusedId) return;
    const visibleIdx = idToVisibleIdx.get(focusedId);
    if (visibleIdx === undefined) return;
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToRow({ index: visibleIdx, align: 'smart' });
    });
    return () => cancelAnimationFrame(handle);
  }, [focusedIndex, flat, idToVisibleIdx, listRef]);

  // Global `/` focuses the search input — unless the user is typing in any
  // input/textarea/contenteditable, which preserves natural `/` in Monaco
  // and search field itself.
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>(
        'input[data-tree-search]',
      );
      input?.focus();
      input?.select();
    };
    document.addEventListener('keydown', onGlobalKey);
    return () => document.removeEventListener('keydown', onGlobalKey);
  }, []);

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        if (query !== '') {
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

  function handleArrowLeft() {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'open' && !closed.has(row.id)) {
      toggle(row.id);
      return;
    }
    if (row.parentIndex >= 0) setFocusedIndex(row.parentIndex);
  }

  function handleArrowRight() {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind !== 'open') return;
    if (closed.has(row.id)) {
      toggle(row.id);
      return;
    }
    // Already expanded — move to first child (the row right after the open
    // in visible order).
    const currentVisIdx = idToVisibleIdx.get(row.id);
    if (currentVisIdx !== undefined && currentVisIdx + 1 < visibleFlatIdx.length) {
      setFocusedIndex(visibleFlatIdx[currentVisIdx + 1]);
    }
  }

  function handleEnter() {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'open') {
      toggle(row.id);
    } else if (row.kind === 'leaf') {
      openDrawer(row);
    }
  }

  function handleCopyPath() {
    if (focusedIndex === null) return;
    const row = flat[focusedIndex];
    if (row.kind === 'close') return;
    void copyText(row.id).then((ok) => {
      if (ok) toast.success('Path copied', { description: row.id });
      else toast.error('Could not copy');
    });
  }

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
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={() => containerRef.current?.focus()}
      onKeyDown={onKeyDown}
      className="ring-primary/40 flex h-full flex-col font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      {parseError && <ParsePausedBanner error={parseError} />}
      <TreeSearch
        matchCount={matchIndices.length}
        currentMatch={currentMatch}
        onJump={handleJump}
      />
      <Breadcrumb />
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
      <DetailDrawer />
    </div>
  );
}

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

type VirtualRowProps = RowComponentProps<{
  rows: FlatRow[];
  visibleFlatIdx: number[];
}>;

// memo'd so a re-render of TreeView with stable rowProps doesn't re-render
// every visible slot. react-window passes a fresh `style` object per frame
// when scrolling, but during steady state (no scroll, no data change)
// memo's shallow compare skips the row entirely.
//
// The `as unknown as` cast bridges a type gap: react-window types
// `rowComponent` as `(props) => ReactElement | null`, but memo() returns a
// MemoExoticComponent whose call signature widens to ReactNode. React
// renders both identically — the cast is honest at runtime.
const VirtualRow = memo(function VirtualRow({
  index,
  style,
  rows,
  visibleFlatIdx,
}: VirtualRowProps): React.ReactElement {
  return (
    <div style={style}>
      <TreeNode row={rows[index]} flatIdx={visibleFlatIdx[index]} />
    </div>
  );
}) as unknown as (props: VirtualRowProps) => React.ReactElement;

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
