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
  try {
    const result = await remote.parseFile(file, Comlink.proxy(cb));
    if (myId !== activeParseFileId) {
      // A later parseFile superseded us mid-flight. Caller will drop the
      // result anyway; mark as cancellation so TreeView's catch can
      // discriminate from a real failure.
      throw makeAbortError('parseFile superseded');
    }
    const ms = Math.round(performance.now() - t0);
    // eslint-disable-next-line no-console
    console.log(
      `[parser] parseFile ${(file.size / 1024 / 1024).toFixed(1)}MB → ${ms}ms (${(file.size / 1024 / 1024 / (ms / 1000)).toFixed(1)} MB/s)`,
    );
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
): Promise<ParseResult> {
  return ensureWorker().expandStub(file, byteStart, byteEnd, basePath);
}

export function abort(): void {
  // Fire-and-forget — the worker's abort sets a flag the parse loop polls.
  // No await: if the worker is busy mid-tokenize, we don't want to block
  // the caller on a round-trip.
  void api?.abort();
}

// beforeunload cleanup: terminate so File handles release promptly. Cheap
// insurance — workers normally die with the tab but Safari has been known
// to delay cleanup, which can leak the open File reference.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', terminateWorker);
}
