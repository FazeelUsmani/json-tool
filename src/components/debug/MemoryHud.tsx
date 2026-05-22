// Opt-in diagnostic overlay surfaced via `?debug=1`. Bottom-right,
// dimmed-then-bright-on-hover. Reads from viewStore + parserHost +
// performance.memory non-reactively — subscribing to viewStore via the
// hook would cause one HUD render per stub expansion / search batch
// (≥100 renders for a typical 2-second expand spree), which would
// itself show up in the metrics. Instead, a rAF loop polls snapshots
// every ≥100ms (~10Hz cap) and that's the only thing that triggers
// re-renders.
//
// Worker liveness derives from three signals checked in priority order:
//   1. parserHost.isParsing()           → "parsing"
//   2. viewStore.stubSearchProgress     → "searching" (+ scan progress)
//   3. viewStore.expandingPaths.size>0  → "expanding N stub(s)"
//   else                                → "idle"
//
// `performance.memory.usedJSHeapSize` (Chromium only) reflects the main
// thread's heap only — workers have their own heap, invisible from
// here. Labeled "Main heap" so users in ?debug=1 mode aren't misled
// into reading total memory.

import { useEffect, useRef, useState } from 'react';
import { useViewStore } from '@/state/viewStore';
import {
  getLastParseStats,
  isParsing,
  type LastParseStats,
} from '@/state/parseStats';
import { computeSpineMetrics, type SpineMetrics } from '@/lib/tree/metrics';
import type { TreeNode } from '@/lib/tree/parse';

const TICK_INTERVAL_MS = 100; // 10Hz cap on HUD re-renders

type WorkerStatus =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  | { kind: 'searching'; scanned: number; total: number }
  | { kind: 'expanding'; count: number };

type Snapshot = {
  parse: LastParseStats | null;
  blobBytes: number | null;
  flatCount: number;
  metrics: SpineMetrics;
  parseMode: 'json' | 'ndjson';
  worker: WorkerStatus;
  mainHeapBytes: number | null;
};

const INITIAL: Snapshot = {
  parse: null,
  blobBytes: null,
  flatCount: 0,
  metrics: { spineCount: 0, stubCount: 0, leafCount: 0, ndjsonLineCount: 0 },
  parseMode: 'json',
  worker: { kind: 'idle' },
  mainHeapBytes: null,
};

// performance.memory is a non-standard Chromium extension. Feature-
// detect once at module load so each tick is a cheap property read.
type PerformanceMemory = { usedJSHeapSize: number };
function readMainHeap(): number | null {
  if (typeof performance === 'undefined') return null;
  const mem = (performance as unknown as { memory?: PerformanceMemory }).memory;
  return mem?.usedJSHeapSize ?? null;
}

function deriveWorkerStatus(
  parsing: boolean,
  searchProgress: { scanned: number; total: number } | null,
  expandingCount: number,
): WorkerStatus {
  if (parsing) return { kind: 'parsing' };
  if (searchProgress !== null) {
    return {
      kind: 'searching',
      scanned: searchProgress.scanned,
      total: searchProgress.total,
    };
  }
  if (expandingCount > 0) return { kind: 'expanding', count: expandingCount };
  return { kind: 'idle' };
}

function workerEqual(a: WorkerStatus, b: WorkerStatus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'searching' && b.kind === 'searching') {
    return a.scanned === b.scanned && a.total === b.total;
  }
  if (a.kind === 'expanding' && b.kind === 'expanding') {
    return a.count === b.count;
  }
  return true;
}

function snapshotEqual(a: Snapshot, b: Snapshot): boolean {
  return (
    a.parse === b.parse &&
    a.blobBytes === b.blobBytes &&
    a.flatCount === b.flatCount &&
    a.metrics === b.metrics &&
    a.parseMode === b.parseMode &&
    a.mainHeapBytes === b.mainHeapBytes &&
    workerEqual(a.worker, b.worker)
  );
}

export function MemoryHud() {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL);
  // Memoize computeSpineMetrics across ticks: if root identity is
  // unchanged from the previous tick, reuse the prior metrics object
  // instead of re-walking the tree (which could be millions of nodes).
  const lastRootRef = useRef<TreeNode | null>(null);
  const lastMetricsRef = useRef<SpineMetrics>(INITIAL.metrics);

  useEffect(() => {
    let rafId: number;
    let lastTick = 0;
    const tick = (now: number) => {
      if (now - lastTick >= TICK_INTERVAL_MS) {
        lastTick = now;
        const view = useViewStore.getState();
        let metrics = lastMetricsRef.current;
        if (view.root !== lastRootRef.current) {
          metrics = computeSpineMetrics(view.root);
          lastRootRef.current = view.root;
          lastMetricsRef.current = metrics;
        }
        const next: Snapshot = {
          parse: getLastParseStats(),
          blobBytes: view.sourceBlob?.size ?? null,
          flatCount: view.flat.length,
          metrics,
          parseMode: view.parseMode,
          worker: deriveWorkerStatus(
            isParsing(),
            view.stubSearchProgress,
            view.expandingPaths.size,
          ),
          mainHeapBytes: readMainHeap(),
        };
        // Skip setState on no-change ticks (idle viewer). Without
        // this, the HUD re-renders 10×/s forever even when nothing
        // moved, and that churn itself shows up in the metrics.
        setSnapshot((prev) => (snapshotEqual(prev, next) ? prev : next));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      role="complementary"
      aria-label="Debug HUD"
      className="border-border/60 bg-background/85 text-muted-foreground hover:text-foreground pointer-events-auto fixed right-3 bottom-3 z-50 min-w-[16rem] rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed opacity-50 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100"
    >
      <Row label="Parse" value={fmtParse(snapshot.parse, snapshot.blobBytes)} />
      <Row label="Source" value={fmtBytes(snapshot.blobBytes)} />
      <Row label="Spine" value={fmtCount(snapshot.metrics.spineCount)} />
      <Row
        label={snapshot.parseMode === 'ndjson' ? 'Lines' : 'Stubs'}
        value={fmtCount(
          snapshot.parseMode === 'ndjson'
            ? snapshot.metrics.ndjsonLineCount
            : snapshot.metrics.stubCount,
        )}
      />
      <Row label="Visible rows" value={fmtCount(snapshot.flatCount)} />
      <Row label="Worker" value={fmtWorker(snapshot.worker)} />
      <Row label="Main heap" value={fmtHeap(snapshot.mainHeapBytes)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );
}

// Formatters intentionally avoid Intl.NumberFormat at this size — the
// HUD is monospaced and we want predictable widths. `tabular-nums`
// handles digit alignment.

function fmtCount(n: number): string {
  if (n === 0) return '0';
  // Group with commas: 1234567 → "1,234,567"
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtParse(parse: LastParseStats | null, blobBytes: number | null): string {
  if (parse === null) return '—';
  // If the parsed-byte size matches the current blob, skip showing
  // bytes (avoid redundancy with the Source row right below).
  const sizePart =
    blobBytes !== null && blobBytes === parse.bytes
      ? ''
      : ` · ${fmtBytes(parse.bytes)}`;
  return `${parse.ms}ms · ${parse.mbPerSec.toFixed(1)} MB/s${sizePart}`;
}

function fmtWorker(w: WorkerStatus): string {
  switch (w.kind) {
    case 'idle':
      return 'idle';
    case 'parsing':
      return 'parsing';
    case 'searching': {
      const pct = w.total > 0 ? Math.floor((w.scanned / w.total) * 100) : 0;
      return `searching · ${fmtCount(w.scanned)} / ${fmtCount(w.total)} (${pct}%)`;
    }
    case 'expanding':
      return w.count === 1 ? 'expanding 1 stub' : `expanding ${w.count} stubs`;
  }
}

function fmtHeap(bytes: number | null): string {
  if (bytes === null) return 'unavailable';
  return fmtBytes(bytes);
}
