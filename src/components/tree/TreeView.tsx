import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { useDocumentStore } from '@/state/documentStore';
import { useViewStore } from '@/state/viewStore';
import { type ParseTreeError } from '@/lib/tree/parse';
import { type FlatRow } from '@/lib/tree/flatten';
import { findMatches } from '@/lib/tree/search';
import { parseFile as parseFileStreaming } from '@/state/parserHost';
import { useStubExpansion } from '@/state/useStubExpansion';
import { TreeNode } from './TreeNode';
import { TreeSearch } from './TreeSearch';
import { Breadcrumb } from './Breadcrumb';
import { DetailDrawer } from './DetailDrawer';
import { useVisibleRows } from './useVisibleRows';
import { useTreeKeyboardNav } from './useTreeKeyboardNav';

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
//
// W2-Fri: visibility derivation + keyboard nav extracted to dedicated hooks
// (useVisibleRows, useTreeKeyboardNav) so TreeView is composition only.
const PARSE_DEBOUNCE_MS = 150;
const ROW_HEIGHT = 24;

export function TreeView() {
  const text = useDocumentStore((s) => s.text);
  const file = useDocumentStore((s) => s.file);
  const setRoot = useViewStore((s) => s.setRoot);
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  const query = useViewStore((s) => s.query);
  const setQuery = useViewStore((s) => s.setQuery);
  const focusedIndex = useViewStore((s) => s.focusedIndex);
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);
  const toggle = useViewStore((s) => s.toggle);
  const openDrawer = useViewStore((s) => s.openDrawer);
  const setSourceBlob = useViewStore((s) => s.setSourceBlob);
  const expandingPaths = useViewStore((s) => s.expandingPaths);
  const setExpanding = useViewStore((s) => s.setExpanding);
  const expandStubRow = useStubExpansion();
  const [parseError, setParseError] = useState<ParseTreeError | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // W3-Wed close-out: streaming worker is the only parse path. Sync
  // parseToTree was removed once the depth-2 spine + sampling validated
  // out — anything above ~5MB hung the main thread on the old path, so
  // there was no surviving reason to keep it as a fallback.
  //
  // Prefer the original dropped File when documentStore has one — lets
  // the worker call file.stream() on the actual file bytes instead of
  // re-encoding the editor text string. For pastes / URL loads / sample
  // loads there's no File, so synthesize a Blob from the text.
  useEffect(() => {
    if (text.trim() === '') {
      setRoot(null);
      setParseError(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      const source =
        file ?? new Blob([text], { type: 'application/json' });
      // Retain the blob in viewStore so expandStub can re-slice byte
      // ranges later. Stored BEFORE the parse Promise resolves so a
      // stub click that races the parse can still see a source.
      setSourceBlob(source);
      parseFileStreaming(source)
        .then((result) => {
          if (cancelled) return;
          setRoot(result.root);
          if (result.parseError) {
            setParseError({
              message: result.parseError.message,
              line: result.parseError.line,
              col: result.parseError.col,
            });
          } else {
            setParseError(null);
          }
        })
        .catch(() => {
          // Worker termination on rapid re-parse rejects the prior
          // Promise. That's the cancel path — don't surface it as a
          // user-visible error.
        });
    }, PARSE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [text, file, setRoot, setSourceBlob]);

  const { matchIndices, visibleSet } = useMemo(
    () => findMatches(flat, query),
    [flat, query],
  );

  useEffect(() => {
    setCurrentMatch(0);
  }, [query]);

  const { visibleRows, visibleFlatIdx, idToVisibleIdx } = useVisibleRows(
    flat,
    closed,
    query,
    visibleSet,
  );

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

  const { onKeyDown } = useTreeKeyboardNav({
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
    clearExpanding: (path) => setExpanding(path, false),
  });

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
