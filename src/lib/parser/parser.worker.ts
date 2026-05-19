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
};

export type ParserWorkerAPI = typeof api;

Comlink.expose(api);
