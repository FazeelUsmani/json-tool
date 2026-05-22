// Main-thread host for the schema inference worker. Mirrors
// `parserHost.ts` shape — lazy worker instantiation, force-terminate
// on supersede, monotonic id tracking so a later inferSchemaForRoot
// call cancels the prior one without leaking results from the stale
// walk. Same AbortError discriminator the rest of the app uses to
// distinguish cancellation from real worker failures.
//
// Lifecycle:
//   - First inferSchemaForRoot call: spin up the worker.
//   - Subsequent call: force-terminate the prior worker before
//     starting fresh. Prevents a long-running schema walk from
//     blocking the next one (user clicks Refresh, switches files,
//     etc).
//   - abortInfer(): bumps the supersede id + terminates. Any pending
//     await on the prior call's Comlink invocation surfaces as
//     AbortError when the supersede check fires.
//   - beforeunload: terminate so File handles release promptly.

import * as Comlink from 'comlink';
import type { SchemaWorkerAPI } from '@/lib/parser/schema.worker';
import type { JsonSchemaEmitResult } from '@/lib/schema/emit-json-schema';
import type { TreeNode } from '@/lib/tree/parse';

let workerInstance: Worker | null = null;
let api: Comlink.Remote<SchemaWorkerAPI> | null = null;

let activeSchemaInferId = 0;

function ensureWorker(): Comlink.Remote<SchemaWorkerAPI> {
  if (api && workerInstance) return api;
  if (typeof Worker === 'undefined') {
    throw new Error(
      'schemaHost: Worker API unavailable (running outside a browser?)',
    );
  }
  workerInstance = new Worker(
    new URL('@/lib/parser/schema.worker.ts', import.meta.url),
    { type: 'module' },
  );
  api = Comlink.wrap<SchemaWorkerAPI>(workerInstance);
  return api;
}

function terminateWorker() {
  if (workerInstance) workerInstance.terminate();
  workerInstance = null;
  api = null;
}

export async function inferSchemaForRoot(
  root: TreeNode,
  sourceBlob: Blob,
): Promise<JsonSchemaEmitResult> {
  const myId = ++activeSchemaInferId;
  terminateWorker();
  const remote = ensureWorker();
  try {
    const result = await remote.inferAndEmit(root, sourceBlob);
    if (myId !== activeSchemaInferId) {
      throw makeAbortError('inferSchema superseded');
    }
    return result;
  } catch (err) {
    // Worker termination during a superseded call may reject the
    // pending Comlink invocation. Tag those as AbortError so the
    // caller's catch can discriminate from genuine worker failures
    // (parse errors inside fetchStub, OOM, etc).
    if (myId !== activeSchemaInferId) {
      throw makeAbortError('inferSchema superseded');
    }
    throw err;
  }
}

export function abortInfer(): void {
  // Bump the id first so any pending await sees the supersede check
  // fail; terminating the worker is the actual kill signal.
  activeSchemaInferId++;
  terminateWorker();
}

function makeAbortError(message: string): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', terminateWorker);
}
