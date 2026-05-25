// Main-thread host for the streaming parser worker. Owns a single worker
// instance, exposes typed parseFile / expandStub / abort. Lazy-instantiates
// the worker so SSR / vite-react-ssg's static build pass never tries to
// construct one (Node has no Worker global).
//
// Lifecycle:
//   - First parseFile / expandStub call: spin up the worker.
//   - Subsequent parseFile call: force-terminate the prior worker before
//     starting fresh. Prevents a stuck parse from blocking the next file.
//   - expandStub: reuses the existing worker (continues the session).
//   - beforeunload: terminate the worker so File handles can GC promptly.
//   - abort(): polled inside the worker between chunks; cooperative cancel
//     without termination.

import * as Comlink from 'comlink';
import type { ParserWorkerAPI } from '@/lib/parser/parser.worker';
import type {
  ParseProgress,
  ParseResult,
} from '@/lib/parser/parser-types';
import { isDebugEnabled } from '@/components/debug/useDebugFlag';
import { recordParseStats, setParseInFlight } from './parseStats';

let workerInstance: Worker | null = null;
let api: Comlink.Remote<ParserWorkerAPI> | null = null;

// Monotonic id incremented at the start of every parseFile. When a call
// finishes (success or failure) and its id no longer matches, a later
// parseFile has superseded it — the result is stale and the rejection
// (if any) is a cancellation, not a real failure. Lets TreeView's catch
// handler discriminate cancellation from genuine worker errors so it can
// log the latter without swallowing the former.
let activeParseFileId = 0;

function ensureWorker(): Comlink.Remote<ParserWorkerAPI> {
  if (api && workerInstance) return api;
  if (typeof Worker === 'undefined') {
    throw new Error(
      'parserHost: Worker API unavailable (running outside a browser?)',
    );
  }
  workerInstance = new Worker(
    new URL('@/lib/parser/parser.worker.ts', import.meta.url),
    { type: 'module' },
  );
  api = Comlink.wrap<ParserWorkerAPI>(workerInstance);
  return api;
}

function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
  }
  workerInstance = null;
  api = null;
}

export async function parseFile(
  file: Blob,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParseResult> {
  // Force-terminate any in-flight parse before starting a new one. The
  // worker is cheap to respin (~50ms) and we avoid queuing complexity.
  const myId = ++activeParseFileId;
  terminateWorker();
  const remote = ensureWorker();
  const cb = onProgress ?? (() => {});
  const t0 = performance.now();
  setParseInFlight(true);
  try {
    const result = await remote.parseFile(file, Comlink.proxy(cb));
    if (myId !== activeParseFileId) {
      // A later parseFile superseded us mid-flight. Caller will drop the
      // result anyway; mark as cancellation so TreeView's catch can
      // discriminate from a real failure.
      throw makeAbortError('parseFile superseded');
    }
    const ms = Math.round(performance.now() - t0);
    const mbPerSec = file.size / 1024 / 1024 / (ms / 1000);
    if (isDebugEnabled()) {
      console.log(
        `[parser] parseFile ${(file.size / 1024 / 1024).toFixed(1)}MB → ${ms}ms (${mbPerSec.toFixed(1)} MB/s)`,
      );
    }
    recordParseStats({
      ms,
      bytes: file.size,
      mbPerSec,
      completedAt: performance.now(),
    });
    return result;
  } catch (err) {
    // Worker termination during a superseded call may reject the pending
    // Comlink call (depending on browser / Comlink version). Tag those
    // rejections as AbortError too so they don't get logged as real
    // failures downstream.
    if (myId !== activeParseFileId) {
      throw makeAbortError('parseFile superseded');
    }
    throw err;
  } finally {
    // Only clear the flag if we're still the current parse. A superseded
    // call shouldn't flip the flag off while a newer parse is mid-flight.
    if (myId === activeParseFileId) setParseInFlight(false);
  }
}

function makeAbortError(message: string): Error {
  // DOMException is available in browsers and modern Node (>= 17). The
  // name discriminator is what callers key on (matches the AbortSignal
  // convention).
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

export async function expandStub(
  file: Blob,
  byteStart: number,
  byteEnd: number,
  basePath: string,
  baseId: string,
): Promise<ParseResult> {
  return ensureWorker().expandStub(file, byteStart, byteEnd, basePath, baseId);
}

export function abort(): void {
  // Fire-and-forget — the worker's abort sets a flag the parse loop polls.
  // No await: if the worker is busy mid-tokenize, we don't want to block
  // the caller on a round-trip.
  void api?.abort();
}

// Wraps the worker's searchStubs scan. Used by TreeView when the search
// query changes — the synchronous findMatches gets key/leaf matches
// instantly; this worker pass adds content matches inside collapsed
// stubs and NDJSON lines that findMatches can't see. Streaming via
// `onBatch`: every ~2000 ranges scanned the worker posts a batch of
// matching paths + scanned count, the main thread merges them into
// viewStore.stubSearchMatches and updates progress.
export async function searchStubs(
  file: Blob,
  ranges: readonly {
    id: string;
    byteStart: number;
    byteEnd: number;
  }[],
  needle: string,
  onBatch: (batch: { id: string }[], scanned: number) => void,
): Promise<void> {
  const remote = ensureWorker();
  await remote.searchStubs(file, ranges, needle, Comlink.proxy(onBatch));
}

export function abortSearch(): void {
  void api?.abortSearch();
}

// beforeunload cleanup: terminate so File handles release promptly. Cheap
// insurance — workers normally die with the tab but Safari has been known
// to delay cleanup, which can leak the open File reference.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', terminateWorker);
}
