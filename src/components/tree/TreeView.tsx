import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { useDocumentStore } from '@/state/documentStore';
import { useViewStore } from '@/state/viewStore';
import { type ParseTreeError } from '@/lib/tree/parse';
import { type FlatRow } from '@/lib/tree/flatten';
import { collectStubRanges, findMatches } from '@/lib/tree/search';
import {
  parseFile as parseFileStreaming,
  searchStubs,
  abortSearch,
} from '@/state/parserHost';
import { recordParseStats, setParseInFlight } from '@/state/parseStats';
import { isDebugEnabled } from '@/components/debug/useDebugFlag';
import { detectNdjson } from '@/lib/json/ndjson';
import { parseNdjson } from '@/lib/parser/parse-ndjson';
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
  const source = useDocumentStore((s) => s.source);
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
  const setParseMode = useViewStore((s) => s.setParseMode);
  // NOTE: `root` intentionally NOT subscribed via useViewStore. Every
  // stub expansion replaces the root reference via spliceSubtree, which
  // would otherwise re-trigger the deep-search effect below and restart
  // a 5–10s worker scan from scratch on every expand-click. The effect
  // reads root once at start via getState(); the collected stub ranges
  // capture the tree's stub layout at search-start time. Stale entries
  // in stubSearchMatches after later expansions are harmless (matchRow
  // gates them on row.kind being stub/line, which expansion removes).
  const sourceBlob = useViewStore((s) => s.sourceBlob);
  const stubSearchMatches = useViewStore((s) => s.stubSearchMatches);
  // stubSearchProgress is consumed directly inside TreeSearch — no need
  // to subscribe at this level (would just trigger extra re-renders).
  const addStubSearchMatches = useViewStore((s) => s.addStubSearchMatches);
  const setStubSearchProgress = useViewStore((s) => s.setStubSearchProgress);
  const clearStubSearch = useViewStore((s) => s.clearStubSearch);
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
    // Empty text + no file means there's truly nothing to parse. Viewer-
    // only file drops set text='' but pass the File through, so we DO
    // want to parse on that branch (the worker reads via file.stream()).
    if (text.trim() === '' && !file) {
      setRoot(null);
      setParseError(null);
      return;
    }

    let cancelled = false;
    // Debounce exists to coalesce keystrokes mid-typing; file / URL /
    // sample loads have a known terminal value, so parse immediately.
    // Saves a visible 150ms of "did the drop register?" on huge files.
    const debounceMs = source?.kind === 'paste' ? PARSE_DEBOUNCE_MS : 0;
    const handle = setTimeout(() => {
      const parseSource =
        file ?? new Blob([text], { type: 'application/json' });
      // Retain the blob in viewStore so expandStub can re-slice byte
      // ranges later. Stored BEFORE the parse Promise resolves so a
      // stub click that races the parse can still see a source.
      setSourceBlob(parseSource);

      // Detect NDJSON before dispatching — read the head, decide path,
      // then route through the right parser. Detection sample is 4KB
      // so the slice/decode is cheap even on huge files.
      const head = parseSource.slice(0, 4 * 1024);
      head
        .bytes
        ? head.bytes().then((b) => detectAndParse(parseSource, b))
        : head
            .arrayBuffer()
            .then((ab) => detectAndParse(parseSource, new Uint8Array(ab)));

      function detectAndParse(blob: Blob, headBytes: Uint8Array) {
        if (cancelled) return;
        const isNdjson = detectNdjson(headBytes);
        setParseMode(isNdjson ? 'ndjson' : 'json');
        if (isNdjson) {
          // parseNdjson runs main-thread and doesn't go through parserHost's
          // worker boundary, so the wall-clock timing has to be captured
          // here — matches what parserHost.parseFile does internally for
          // the JSON path. recordParseStats writes the shared HUD store
          // either way.
          const t0 = performance.now();
          setParseInFlight(true);
          parseNdjson(blob)
            .then((result) => {
              if (cancelled) return;
              const ms = Math.round(performance.now() - t0);
              const mbPerSec = blob.size / 1024 / 1024 / (ms / 1000);
              if (isDebugEnabled()) {
                // eslint-disable-next-line no-console
                console.log(
                  `[parser] parseNdjson ${(blob.size / 1024 / 1024).toFixed(1)}MB → ${ms}ms (${mbPerSec.toFixed(1)} MB/s)`,
                );
              }
              recordParseStats({
                ms,
                bytes: blob.size,
                mbPerSec,
                completedAt: performance.now(),
              });
              setRoot(result.root);
              setParseError(null);
            })
            .catch((err: Error) => {
              if (cancelled) return;
              setParseError({ message: err.message });
            })
            .finally(() => {
              // Mirrors parserHost.parseFile's supersede guard: only
              // flip the HUD flag if THIS parse is still the active
              // one. Without the cancelled check, a superseded NDJSON
              // parse resolving after its replacement started would
              // incorrectly clear inFlight while the replacement is
              // still in flight — HUD briefly reports idle.
              if (!cancelled) setParseInFlight(false);
            });
          return;
        }
        parseFileStreaming(blob)
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
          .catch((err: unknown) => {
            if (cancelled) return;
            // parserHost tags supersede-by-later-call rejections with
            // name='AbortError'. Anything else is a genuine worker
            // failure (OOM, postMessage clone too large, internal
            // crash) and was previously swallowed silently — surface it
            // now so the user sees what happened instead of an empty
            // tree pane with no signal.
            const isAbort =
              err instanceof Error && err.name === 'AbortError';
            if (isAbort) return;
            const message =
              err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error('[parser] parseFile failed:', err);
            setParseError({ message });
          });
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [text, file, source, setRoot, setSourceBlob, setParseMode]);

  const { matchIndices, visibleSet } = useMemo(
    () => findMatches(flat, query, stubSearchMatches),
    [flat, query, stubSearchMatches],
  );

  useEffect(() => {
    setCurrentMatch(0);
  }, [query]);

  // Defensive clamp: if matchIndices shrinks below currentMatch (e.g.
  // a parse swap or future "remove stale stub-matches" code path),
  // snap back inside range so the displayed N/M never reads as
  // "199999 / 160003". Trigger is matchIndices.length, not the array
  // reference, so a stable count doesn't loop the effect.
  useEffect(() => {
    if (
      matchIndices.length > 0 &&
      currentMatch >= matchIndices.length
    ) {
      setCurrentMatch(matchIndices.length - 1);
    }
  }, [matchIndices.length, currentMatch]);

  // Worker-side content scan over stubs and NDJSON lines. The sync
  // findMatches above handles keys + leaf primitives instantly; this
  // effect fires the deep scan whose results stream back into
  // stubSearchMatches and re-trigger findMatches via the dep above.
  //
  // Concurrency: when the user types fast, the previous query's worker
  // is aborted and its in-flight batches are dropped (the next effect
  // clears stubSearchMatches before kicking off the new search). The
  // worker's `await Promise.resolve()` between abort-check windows
  // gives the abortSearch() postMessage a chance to land before each
  // batch — so a typed-too-fast loop doesn't queue up scans.
  useEffect(() => {
    if (query.trim() === '') {
      clearStubSearch();
      return;
    }
    if (!sourceBlob) return;
    // Read root via getState() rather than from the closure so the
    // effect's dep list can exclude `root` — see the comment on the
    // selector hook above for why.
    const rootSnapshot = useViewStore.getState().root;
    if (!rootSnapshot) return;
    const ranges = collectStubRanges(rootSnapshot);
    if (ranges.length === 0) return;

    // Reset to the new query's empty state, kick off the worker scan.
    clearStubSearch();
    setStubSearchProgress({ scanned: 0, total: ranges.length });

    let cancelled = false;
    searchStubs(sourceBlob, ranges, query, (batch, scanned) => {
      if (cancelled) return;
      if (batch.length > 0) {
        addStubSearchMatches(batch.map((b) => b.path));
      }
      // Clear progress directly on the terminal tick instead of waiting
      // for the worker's Promise to resolve via `.then` below — the
      // Comlink return message is queued behind all the onBatch
      // postMessages, and React render time on the matches Set updates
      // can delay .then by several seconds. The user sees the spinner
      // "stuck at 100%" during that drain. Doing it here cuts the
      // perceived latency to zero.
      if (scanned >= ranges.length) {
        setStubSearchProgress(null);
      } else {
        setStubSearchProgress({ scanned, total: ranges.length });
      }
    })
      .then(() => {
        // Backup path: covers the aborted-mid-flight case where the
        // terminal onBatch never fired.
        if (!cancelled) setStubSearchProgress(null);
      })
      .catch(() => {
        if (!cancelled) setStubSearchProgress(null);
      });

    return () => {
      cancelled = true;
      abortSearch();
    };
  }, [
    query,
    sourceBlob,
    addStubSearchMatches,
    setStubSearchProgress,
    clearStubSearch,
  ]);

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

  // Empty-flat states: distinguish "truly nothing loaded" from
  // "loading / paused / errored" so viewer-only file drops (text='' +
  // file=set + populated flat) render the tree instead of the
  // first-time hint. Order matters: parse error wins over hint;
  // hint requires BOTH no text AND no file (viewer-only sets text=''
  // intentionally — that's not the empty state).
  if (flat.length === 0) {
    if (parseError) return <ParseErrorView error={parseError} />;
    if (text.trim() === '' && !file) {
      return (
        <Hint>Type or paste JSON in the editor to see the tree here.</Hint>
      );
    }
    // Transient: parse in flight or stale empty-tree state.
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
