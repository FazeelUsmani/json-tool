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
  terminateWorker();
  const remote = ensureWorker();
  const cb = onProgress ?? (() => {});
  return remote.parseFile(file, Comlink.proxy(cb));
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
