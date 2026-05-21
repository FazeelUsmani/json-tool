// Web Worker entrypoint. Wraps parse-streaming behind a Comlink-exposed
// API surface so the main thread can call parseFile / expandStub without
// blocking the UI thread. The algorithm itself lives in parse-streaming.ts
// (which has no Worker globals, so vitest can exercise it directly).

import * as Comlink from 'comlink';
import { parseStreaming } from './parse-streaming';
import type { ParseProgress, ParseResult } from './parser-types';

// Shared abort flag. parseStreaming polls signal.aborted between chunks;
// flipping it from the main thread via api.abort() lets a long parse exit
// cleanly without terminating the worker. Recreated per parse so a prior
// abort doesn't leak into the next call.
let abortFlag: { aborted: boolean } = { aborted: false };

// Separate flag for searchStubs so a long-running search can be aborted
// (user typed a new query) without affecting any in-flight parseFile /
// expandStub. Recreated per searchStubs call.
let searchAbortFlag: { aborted: boolean } = { aborted: false };

const api = {
  // Accepts any Blob (which includes File). Text input synthesizes a Blob
  // via `new Blob([text])` on the main side; drag-dropped files arrive as
  // File. Both round-trip through Comlink's structured clone and expose
  // .stream() + .size identically.
  async parseFile(
    file: Blob,
    onProgress: (p: ParseProgress) => void,
  ): Promise<ParseResult> {
    abortFlag = { aborted: false };
    return parseStreaming(file.stream(), {
      onProgress,
      signal: abortFlag,
      totalBytes: file.size,
    });
  },

  // Re-parse a byte slice of `file` as if it were rooted at `basePath`,
  // shifting all reported offsets by `byteStart` so they remain absolute
  // file coordinates. The result's root TreeNode REPLACES the stub at
  // basePath in the main thread's tree.
  async expandStub(
    file: Blob,
    byteStart: number,
    byteEnd: number,
    basePath: string,
  ): Promise<ParseResult> {
    abortFlag = { aborted: false };
    const slice = file.slice(byteStart, byteEnd);
    return parseStreaming(slice.stream(), {
      signal: abortFlag,
      totalBytes: slice.size,
      basePath,
      byteOffsetBase: byteStart,
    });
  },

  abort(): void {
    abortFlag.aborted = true;
  },

  // Worker-side scan over the byte ranges of unmaterialized stubs and
  // NDJSON lines. The main-thread synchronous search only matches against
  // FlatRow node.key / leaf-primitive values — content inside stubs is
  // invisible to it (the parser deliberately leaves stubs as byte refs to
  // keep RSS bounded). This scan decodes each range, case-insensitive
  // includes-checks, and posts matching paths back in batches.
  //
  // Strategy: read the full Blob bytes once (one ArrayBuffer alloc) and
  // sub-decode per range. Cheaper than 900K Blob.slice().text() awaits;
  // the buffer is released when this function returns. Bail-on-first-
  // match per range (option ii) — we record the stub's path, not every
  // hit position. The user click-expands to drill in.
  //
  // Cancellation: the main thread re-creates searchAbortFlag at entry,
  // sets it true via abortSearch(). The worker checks on every batch
  // boundary AND every ABORT_CHECK_EVERY iterations within a batch so a
  // typing-driven rapid abort/restart loop doesn't queue work.
  async searchStubs(
    file: Blob,
    ranges: readonly {
      path: string;
      byteStart: number;
      byteEnd: number;
    }[],
    needle: string,
    onBatch: (batch: { path: string }[], scanned: number) => void,
  ): Promise<void> {
    searchAbortFlag = { aborted: false };
    const lowerNeedle = needle.toLowerCase();
    if (lowerNeedle === '' || ranges.length === 0) return;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder('utf-8', { fatal: false });

    const BATCH_SIZE = 2000;
    const ABORT_CHECK_EVERY = 256;
    const batch: { path: string }[] = [];

    for (let i = 0; i < ranges.length; i++) {
      if ((i & (ABORT_CHECK_EVERY - 1)) === 0) {
        // Microtask yield so the main thread's abortSearch() postMessage
        // can deliver before we continue. Without this, the worker can
        // burn through all ranges before a typed-too-fast abort lands.
        await Promise.resolve();
        if (searchAbortFlag.aborted) return;
      }
      const r = ranges[i];
      const text = decoder
        .decode(bytes.subarray(r.byteStart, r.byteEnd))
        .toLowerCase();
      if (text.includes(lowerNeedle)) {
        batch.push({ path: r.path });
        if (batch.length >= BATCH_SIZE) {
          onBatch(batch.slice(), i + 1);
          batch.length = 0;
        }
      }
    }
    if (!searchAbortFlag.aborted && batch.length > 0) {
      onBatch(batch, ranges.length);
    }
  },

  abortSearch(): void {
    searchAbortFlag.aborted = true;
  },
};

export type ParserWorkerAPI = typeof api;

Comlink.expose(api);
