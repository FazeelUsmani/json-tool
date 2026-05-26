// Read-only sortable table view of the loaded JSON. Activates when
// the top-level value is an array. Each row is one array element;
// columns are derived from the union of keys across the first 100
// sampled rows (see `@/lib/table/columns`).
//
// Two cost-aware behaviors:
//   - Lazy row materialization: stub-backed rows fetch their JS
//     value on viewport mount via `useRowMaterialization`, mirroring
//     `useStubPreview`'s WeakMap-cached blob.slice pattern.
//   - Sort-disable above threshold: when `rows.length >
//     SORT_DISABLE_THRESHOLD` AND the first row is stub-backed,
//     sorting would require materializing every stub (tens of
//     seconds + hundreds of MB transient memory at 2.25M rows).
//     Header is disabled with a tooltip explaining; users use search
//     to filter instead.
//
// Below the threshold, sort click materializes all rows (cached so
// subsequent sorts on the same data are fast) and then applies the
// type-aware comparator from `@/lib/table/sort`. The "Sorting…"
// spinner covers the materialize-all window.

import { useEffect, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  COLUMN_SAMPLE_SIZE,
  VALUE_COLUMN_KEY,
  deriveColumns,
  type Column,
} from '@/lib/table/columns';
import { SORT_DISABLE_THRESHOLD, sortRows } from '@/lib/table/sort';
import type { TreeNode } from '@/lib/tree/parse';
import {
  fetchRowValue,
  peekRowCache,
  useRowMaterialization,
} from './useRowMaterialization';

const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 150;
const HEADER_HEIGHT = 28;

type SortDir = 'asc' | 'desc';
type SortState = { key: string; direction: SortDir } | null;

type Props = {
  // Children of the "primary array" — found by findPrimaryArray
  // upstream in RightPane. Either the root array's children or the
  // largest array-valued child of a root object (e.g., events
  // inside `{"events": [...]}`).
  rows: TreeNode[];
  // JSONPath-style locator of the array we're showing. Surfaced as
  // a small chip in the table header so users see which array is
  // being tabled when the root is wrapped.
  path: string;
  // True when the primary array is a stub-array (depth ≥ MAX_SPINE_DEPTH
  // composite that hasn't been expanded). `rows` is empty in that case
  // — not because the data is empty, but because nothing's been
  // materialized yet. Different empty-state copy follows.
  stubBacked?: boolean;
  sourceBlob: Blob | null;
};

export function TablePane({
  rows,
  path,
  stubBacked = false,
  sourceBlob,
}: Props) {
  return (
    <TableBody
      rows={rows}
      path={path}
      stubBacked={stubBacked}
      sourceBlob={sourceBlob}
    />
  );
}

function TableBody({
  rows,
  path,
  stubBacked,
  sourceBlob,
}: {
  rows: TreeNode[];
  path: string;
  stubBacked: boolean;
  sourceBlob: Blob | null;
}) {
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>(null);
  const [sortInFlight, setSortInFlight] = useState(false);

  const firstRowIsStub =
    rows.length > 0 &&
    (rows[0].kind === 'stub-object' ||
      rows[0].kind === 'stub-array' ||
      rows[0].kind === 'ndjson-line');
  const sortDisabled =
    firstRowIsStub && rows.length > SORT_DISABLE_THRESHOLD;

  // Derive columns from the first 100 rows. For stub-backed rows
  // we fetch via blob.slice; the same cache feeds the visible-row
  // hooks below so no row is fetched twice.
  useEffect(() => {
    let cancelled = false;
    if (rows.length === 0) {
      setColumns([]);
      return;
    }
    const sample = rows.slice(0, COLUMN_SAMPLE_SIZE);
    Promise.all(sample.map((node) => fetchRowValue(sourceBlob, node)))
      .then((values) => {
        if (cancelled) return;
        setColumns(deriveColumns(values));
        setColumnsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setColumnsError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [rows, sourceBlob]);

  // Sorted index array. Identity = the original index in `rows`;
  // when sort is active, this array is a permutation of [0..rows.length).
  // Cell values come from the WeakMap cache (populated by column
  // derivation + the sort click's materialize-all pass).
  const sortedIndices = useMemo<number[]>(() => {
    const identity: number[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) identity[i] = i;
    if (sortState === null || columns === null) return identity;
    const column = columns.find((c) => c.key === sortState.key);
    if (!column) return identity;

    // Read each row's cell value. Materialized rows compute sync;
    // stub-backed rows pull from the WeakMap cache (which was filled
    // by the sort click handler before we got here). Cache misses
    // resolve to `undefined` and get sorted to the end per the
    // null-at-end policy.
    return sortRows(
      identity,
      (i) => getCellValueFromCache(sourceBlob, rows[i], column.key),
      column.type,
      sortState.direction,
    );
  }, [rows, sortState, columns, sourceBlob]);

  const handleHeaderClick = async (column: Column) => {
    if (sortDisabled || sortInFlight) return;

    let nextState: SortState;
    if (sortState === null || sortState.key !== column.key) {
      nextState = { key: column.key, direction: 'asc' };
    } else if (sortState.direction === 'asc') {
      nextState = { key: column.key, direction: 'desc' };
    } else {
      nextState = null;
    }

    if (nextState === null) {
      setSortState(null);
      return;
    }

    // Materialize all rows before sorting. Cached after the first
    // pass — subsequent sorts on the same data are sync against the
    // WeakMap. Materialized rows resolve immediately via
    // fetchRowValue's sync branch.
    setSortInFlight(true);
    try {
      await Promise.all(rows.map((node) => fetchRowValue(sourceBlob, node)));
      setSortState(nextState);
    } catch {
      // Best-effort: if a row fails to fetch, abandon the sort
      // rather than partially sorting. Toast would be loud — silent
      // failure is fine; user clicks again to retry.
    } finally {
      setSortInFlight(false);
    }
  };

  if (columnsError) {
    return (
      <div className="text-destructive flex h-full items-center justify-center p-4 text-sm">
        Couldn't build table: {columnsError}
      </div>
    );
  }
  if (columns === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Building table…
      </div>
    );
  }
  if (columns.length === 0 || rows.length === 0) {
    if (stubBacked) {
      return (
        <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
          This array is collapsed (large composite, not yet expanded).
          Open the Tree tab, click the array to expand it, then return
          here to see the table.
        </div>
      );
    }
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No rows.
      </div>
    );
  }

  const totalWidth = columns.length * COLUMN_WIDTH;

  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-xs">
      <div className="text-muted-foreground bg-muted/30 border-b px-3 py-1 text-xs">
        Showing{' '}
        <span className="text-foreground font-mono">{path}</span>
        {' · '}
        {rows.length.toLocaleString()} rows
      </div>
      <div className="overflow-x-auto">
        <div style={{ width: totalWidth }}>
          <Header
            columns={columns}
            sortState={sortState}
            sortDisabled={sortDisabled}
            sortInFlight={sortInFlight}
            rowCount={rows.length}
            onHeaderClick={(col) => {
              void handleHeaderClick(col);
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div style={{ width: totalWidth, height: '100%' }}>
          <List
            rowComponent={VirtualTableRow}
            rowCount={sortedIndices.length}
            rowHeight={ROW_HEIGHT}
            overscanCount={5}
            rowProps={{ rows, sortedIndices, columns, sourceBlob }}
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  columns,
  sortState,
  sortDisabled,
  sortInFlight,
  rowCount,
  onHeaderClick,
}: {
  columns: Column[];
  sortState: SortState;
  sortDisabled: boolean;
  sortInFlight: boolean;
  rowCount: number;
  onHeaderClick: (col: Column) => void;
}) {
  return (
    <div
      className="bg-muted/50 border-border/60 flex border-b"
      style={{ height: HEADER_HEIGHT }}
    >
      {columns.map((col) => {
        const isSorted = sortState?.key === col.key;
        const arrow = !isSorted ? null : sortState!.direction === 'asc' ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        );

        const button = (
          <button
            type="button"
            onClick={() => onHeaderClick(col)}
            disabled={sortDisabled || sortInFlight}
            className="hover:bg-muted/60 disabled:cursor-not-allowed flex h-full w-full items-center gap-1 truncate border-r px-2 py-1 text-left text-xs font-semibold disabled:opacity-70"
            title={col.key === VALUE_COLUMN_KEY ? '(value)' : col.key}
            style={{ width: COLUMN_WIDTH }}
          >
            <span className="truncate">
              {col.key === VALUE_COLUMN_KEY ? '(value)' : col.key}
            </span>
            {arrow}
            {sortInFlight && isSorted && (
              <Loader2 className="size-3 animate-spin" />
            )}
          </button>
        );

        if (!sortDisabled) return <div key={col.key}>{button}</div>;
        return (
          <Tooltip key={col.key}>
            <TooltipTrigger asChild>
              <div>{button}</div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Sort disabled — {rowCount.toLocaleString()} rows would require
              materializing every stub. Use search to filter instead.
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

type RowProps = {
  rows: TreeNode[];
  sortedIndices: number[];
  columns: Column[];
  sourceBlob: Blob | null;
};

function VirtualTableRow({
  index,
  style,
  rows,
  sortedIndices,
  columns,
  sourceBlob,
}: RowComponentProps<RowProps>) {
  const originalIndex = sortedIndices[index] ?? index;
  const node = rows[originalIndex];
  if (!node) return null;
  return (
    <div
      style={style}
      className="border-border/30 flex border-b"
    >
      <TableRow node={node} columns={columns} sourceBlob={sourceBlob} />
    </div>
  );
}

function TableRow({
  node,
  columns,
  sourceBlob,
}: {
  node: TreeNode;
  columns: Column[];
  sourceBlob: Blob | null;
}) {
  const state = useRowMaterialization(sourceBlob, node);
  if (state.kind === 'loading') {
    return (
      <>
        {columns.map((col) => (
          <div
            key={col.key}
            className="text-muted-foreground/40 truncate border-r px-2 py-1"
            style={{ width: COLUMN_WIDTH }}
          >
            …
          </div>
        ))}
      </>
    );
  }
  if (state.kind === 'error') {
    return (
      <div
        className="text-destructive truncate px-2 py-1"
        style={{ width: columns.length * COLUMN_WIDTH }}
        title={state.message}
      >
        Error: {state.message}
      </div>
    );
  }
  return (
    <>
      {columns.map((col) => (
        <Cell
          key={col.key}
          value={extractCell(state.value, col.key)}
          width={COLUMN_WIDTH}
          columnKey={col.key}
        />
      ))}
    </>
  );
}

function Cell({
  value,
  width,
  columnKey,
}: {
  value: unknown;
  width: number;
  columnKey: string;
}) {
  return (
    <div
      // Stable e2e selector — per-column testid lets specs target a
      // specific column's cells without conflating with other numeric
      // columns (e.g., id vs. score in tablepane-sort).
      data-testid={`cell-${columnKey}`}
      className="truncate border-r px-2 py-1"
      style={{ width }}
      title={typeof value === 'string' ? value : undefined}
    >
      {formatCell(value)}
    </div>
  );
}

// Render a single cell. Primitives display as their string form;
// composites collapse to `{…}` / `[…]` for the M1 read-only view
// (drill-down comes in a polish pass).
function formatCell(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'object':
      return Array.isArray(value) ? '[…]' : '{…}';
    default:
      return '';
  }
}

function extractCell(rowValue: unknown, key: string): unknown {
  if (key === VALUE_COLUMN_KEY) return rowValue;
  if (rowValue === null || typeof rowValue !== 'object') return undefined;
  return (rowValue as Record<string, unknown>)[key];
}

// Helper for the sort comparator — reads a row's cell value from
// cache (set by column derivation + the materialize-all pass on
// sort click). Materialized rows compute sync. Stubs missing from
// cache return undefined, which sortRows treats as null (end).
function getCellValueFromCache(
  blob: Blob | null,
  node: TreeNode,
  key: string,
): unknown {
  // Defer to the same logic the row hook uses, but synchronously.
  if (
    node.kind === 'stub-object' ||
    node.kind === 'stub-array' ||
    node.kind === 'ndjson-line'
  ) {
    if (!blob) return undefined;
    // Cache check — replicate the WeakMap lookup. We can't import
    // the private cache directly so we read via the sync subset of
    // fetchRowValue: not awaiting a Promise means cache-only.
    // For uncached stubs, we return undefined (sort end).
    // The sort-click handler awaits fetchRowValue for every row
    // BEFORE setting sortState, so by the time this runs every
    // stub should be cached.
    // Cache is keyed by node.id (RFC 6901 pointer); using node.path
    // here silently misses every stub-backed row → null-at-end sort
    // → broken order. Missed in the c05d030 identity migration.
    const cached = peekRowCache(blob, node.id);
    if (cached === undefined) return undefined;
    if (key === VALUE_COLUMN_KEY) return cached;
    return (cached as Record<string, unknown> | null)?.[key];
  }
  // Materialized: walk the tree node. For object rows, find the
  // child with the matching key.
  if (node.kind === 'object') {
    for (const c of node.children) {
      if (c.key === key) return treeNodeToValueSync(c);
    }
    return undefined;
  }
  if (key === VALUE_COLUMN_KEY) return treeNodeToValueSync(node);
  return undefined;
}

// Local copy of treeNodeToValue from useRowMaterialization — used for
// sort-time sync access to materialized rows. Kept local rather than
// exported because the consumer count is one (this file).
function treeNodeToValueSync(node: TreeNode): unknown {
  switch (node.kind) {
    case 'null':
      return null;
    case 'string':
    case 'number':
    case 'boolean':
      return node.value;
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const c of node.children) {
        if (c.key !== null) out[c.key] = treeNodeToValueSync(c);
      }
      return out;
    }
    case 'array':
      return node.children.map(treeNodeToValueSync);
    case 'stub-object':
    case 'stub-array':
    case 'ndjson-line':
      return undefined;
  }
}
