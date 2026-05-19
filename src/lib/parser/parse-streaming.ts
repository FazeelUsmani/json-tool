// Streaming spine parser. Consumes a ReadableStream of UTF-8 bytes (a File's
// .stream(), or in tests a synthetic stream from a Uint8Array), produces:
//   - a TreeNode tree where the top MAX_SPINE_DEPTH levels are fully
//     materialized and deeper composites are stubs with byte ranges,
//   - a byte-offset index covering every materialized composite path.
//
// Pure: no DOM, no React, no Worker globals. Comlink wraps this on the
// worker side; vitest exercises it directly with a fake stream.
//
// Algorithm (state machine driven by @streamparser/json's Tokenizer):
//   - Track a stack of in-progress spine frames (depth < MAX_SPINE_DEPTH).
//   - When LEFT_BRACE/LEFT_BRACKET fires at depth >= MAX_SPINE_DEPTH, switch
//     into "stub-tracking" mode: remember byteStart, count immediate
//     children (commas + 1 if non-empty), increment a local depthAccum so
//     we know which RIGHT_* closes the stub.
//   - When the stub's RIGHT_* fires, attach a stub-object/stub-array node
//     to the parent spine frame and exit stub mode.
//   - Primitives in the spine attach as { kind: 'string' | ... }. In an
//     object context, STRING tokens alternate key/value based on the
//     frame's pendingKey state.

import Tokenizer from '@streamparser/json/tokenizer';
import TokenType from '@streamparser/json/utils/types/tokenType';
import type { ParsedTokenInfo } from '@streamparser/json/utils/types/parsedTokenInfo';
import type { TreeNode } from '@/lib/tree/parse';
import {
  MAX_SPINE_DEPTH,
  type ByteIndexEntry,
  type ParseError,
  type ParseProgress,
  type ParseResult,
} from './parser-types';

// Spine frame on the stack. parentKind is stored explicitly so we never
// confuse object key context with array element context — a STRING token
// inside an array is always a value, regardless of what's in pendingKey
// (which only matters for objects).
type ObjectFrame = {
  kind: 'object';
  parentKind: 'object' | 'array' | null;
  key: string | null;
  path: string;
  children: TreeNode[];
  byteStart: number;
  // Set when a STRING fires as a key (object position, no pendingKey set);
  // cleared when the corresponding value attaches.
  pendingKey: string | null;
};

type ArrayFrame = {
  kind: 'array';
  parentKind: 'object' | 'array' | null;
  key: string | null;
  path: string;
  children: TreeNode[];
  byteStart: number;
  // Index of the next element to attach. Used to build paths like $.a[0].
  elementIndex: number;
};

type Frame = ObjectFrame | ArrayFrame;

// While in stub mode, we're not building spine TreeNodes — just tracking
// depth and counting immediate children so the stub can report childCount.
// hasElement + commaCount together give exact childCount: commas + 1 if any
// element was seen, else 0. Handles {}, [], single-element, n-element
// uniformly.
type StubState = {
  kind: 'stub-object' | 'stub-array';
  key: string | null;
  path: string;
  byteStart: number;
  depthAccum: number;
  commaCount: number;
  hasElement: boolean;
};

export type ParseOptions = {
  onProgress?: (p: ParseProgress) => void;
  // Polled between chunks. Caller flips `aborted` to abort; the function
  // returns whatever it has parsed so far (root may be null/partial).
  signal?: { aborted: boolean };
  totalBytes?: number;
};

export async function parseStreaming(
  stream: ReadableStream<Uint8Array>,
  opts: ParseOptions = {},
): Promise<ParseResult> {
  const tokenizer = new Tokenizer();
  const stack: Frame[] = [];
  const byteIndex: ByteIndexEntry[] = [];
  let stub: StubState | null = null;
  let depth = 0;
  let root: TreeNode | null = null;
  let parseError: ParseError | undefined;
  let halted = false; // set after onError; ignores further tokens

  // ----- helpers ----------------------------------------------------------

  const peek = (): Frame | null => stack[stack.length - 1] ?? null;

  // Path + key for the NEXT child the parent will attach. Reads (and for
  // objects, consumes via pendingKey) the parent's state. For the root
  // (no parent), returns the canonical '$' path.
  const nextChildIdentity = (): { key: string | null; path: string } => {
    const p = peek();
    if (p === null) return { key: null, path: '$' };
    if (p.kind === 'object') {
      // pendingKey must be set by the preceding STRING token; if it's not,
      // the input is malformed and Tokenizer should have emitted onError
      // before we got here.
      const key = p.pendingKey ?? '';
      return { key, path: `${p.path}.${key}` };
    }
    return { key: String(p.elementIndex), path: `${p.path}[${p.elementIndex}]` };
  };

  // Attach a finished TreeNode to its parent (or set as root if no parent).
  // Advances the parent's bookkeeping: clears object pendingKey, bumps
  // array elementIndex.
  const attach = (node: TreeNode) => {
    const p = peek();
    if (p === null) {
      root = node;
      return;
    }
    p.children.push(node);
    if (p.kind === 'object') {
      p.pendingKey = null;
    } else {
      p.elementIndex++;
    }
  };

  // ----- token handler ----------------------------------------------------

  tokenizer.onToken = (info: ParsedTokenInfo) => {
    if (halted) return;
    if (stub) {
      handleStubToken(info, stub);
      // The stub may have closed during this token; if so, materialize it
      // and exit stub mode.
      if (stub.depthAccum === 0) {
        const stubNode: TreeNode =
          stub.kind === 'stub-object'
            ? {
                kind: 'stub-object',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1,
                childCount:
                  stub.commaCount + (stub.hasElement ? 1 : 0),
              }
            : {
                kind: 'stub-array',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1,
                childCount:
                  stub.commaCount + (stub.hasElement ? 1 : 0),
              };
        byteIndex.push([
          stubNode.path,
          { byteStart: stubNode.byteStart, byteEnd: stubNode.byteEnd },
        ]);
        attach(stubNode);
        depth--;
        stub = null;
      }
      return;
    }

    switch (info.token) {
      case TokenType.LEFT_BRACE:
      case TokenType.LEFT_BRACKET: {
        const isObj = info.token === TokenType.LEFT_BRACE;
        const { key, path } = nextChildIdentity();
        if (depth >= MAX_SPINE_DEPTH) {
          // Switch into stub mode. depthAccum starts at 1 (we just entered
          // the stub's outermost container).
          stub = {
            kind: isObj ? 'stub-object' : 'stub-array',
            key,
            path,
            byteStart: info.offset,
            depthAccum: 1,
            commaCount: 0,
            hasElement: false,
          };
        } else {
          // Materialize a spine frame.
          const frame: Frame = isObj
            ? {
                kind: 'object',
                parentKind: peek()?.kind ?? null,
                key,
                path,
                children: [],
                byteStart: info.offset,
                pendingKey: null,
              }
            : {
                kind: 'array',
                parentKind: peek()?.kind ?? null,
                key,
                path,
                children: [],
                byteStart: info.offset,
                elementIndex: 0,
              };
          stack.push(frame);
        }
        depth++;
        break;
      }

      case TokenType.RIGHT_BRACE:
      case TokenType.RIGHT_BRACKET: {
        // Spine close. (Stub closes are handled in handleStubToken above.)
        const frame = stack.pop();
        if (!frame) {
          // Shouldn't happen on valid JSON; defensive guard.
          return;
        }
        depth--;
        const byteEnd = info.offset + 1;
        const node: TreeNode =
          frame.kind === 'object'
            ? {
                kind: 'object',
                key: frame.key,
                path: frame.path,
                children: frame.children,
              }
            : {
                kind: 'array',
                key: frame.key,
                path: frame.path,
                children: frame.children,
              };
        byteIndex.push([
          node.path,
          { byteStart: frame.byteStart, byteEnd },
        ]);
        attach(node);
        break;
      }

      case TokenType.STRING: {
        const p = peek();
        if (p && p.kind === 'object' && p.pendingKey === null) {
          // First STRING after `{` or `,` in an object position is a key.
          p.pendingKey = info.value as string;
        } else {
          // Otherwise it's a value: either array element, or object value
          // following a key (pendingKey is set).
          const { key, path } = nextChildIdentity();
          attach({ kind: 'string', key, path, value: info.value as string });
        }
        break;
      }

      case TokenType.NUMBER: {
        const { key, path } = nextChildIdentity();
        attach({ kind: 'number', key, path, value: info.value as number });
        break;
      }

      case TokenType.TRUE:
      case TokenType.FALSE: {
        const { key, path } = nextChildIdentity();
        attach({
          kind: 'boolean',
          key,
          path,
          value: info.token === TokenType.TRUE,
        });
        break;
      }

      case TokenType.NULL: {
        const { key, path } = nextChildIdentity();
        attach({ kind: 'null', key, path });
        break;
      }

      case TokenType.COLON:
      case TokenType.COMMA:
      case TokenType.SEPARATOR:
        // No spine state to update: pendingKey is set on STRING, cleared
        // on attach; arrays advance elementIndex on attach.
        break;
    }
  };

  tokenizer.onError = (err: Error) => {
    // Capture the first error; halt further token processing but DON'T
    // throw — the caller still gets whatever spine was built before the
    // bad token. This is the partial-root contract.
    if (!parseError) {
      parseError = { message: err.message };
    }
    halted = true;
  };

  // ----- stub-mode token handler -----------------------------------------

  function handleStubToken(info: ParsedTokenInfo, s: StubState) {
    switch (info.token) {
      case TokenType.LEFT_BRACE:
      case TokenType.LEFT_BRACKET:
        if (s.depthAccum === 1) s.hasElement = true;
        s.depthAccum++;
        break;
      case TokenType.RIGHT_BRACE:
      case TokenType.RIGHT_BRACKET:
        s.depthAccum--;
        // depthAccum hitting 0 here means the stub itself is closing; the
        // outer onToken handler reads s.depthAccum === 0 and materializes.
        break;
      case TokenType.COMMA:
        if (s.depthAccum === 1) s.commaCount++;
        break;
      case TokenType.STRING:
      case TokenType.NUMBER:
      case TokenType.TRUE:
      case TokenType.FALSE:
      case TokenType.NULL:
        if (s.depthAccum === 1) s.hasElement = true;
        break;
      case TokenType.COLON:
      case TokenType.SEPARATOR:
        break;
    }
  }

  // ----- drive the stream -------------------------------------------------

  const reader = stream.getReader();
  let bytesProcessed = 0;
  try {
    while (true) {
      if (opts.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        tokenizer.write(value);
        bytesProcessed += value.byteLength;
        opts.onProgress?.({
          bytesProcessed,
          totalBytes: opts.totalBytes ?? 0,
        });
      }
      if (halted) break;
    }
    if (!halted && !opts.signal?.aborted) {
      tokenizer.end();
    }
    // Tokenizer.end() doesn't surface "incomplete document" — it accepts a
    // truncated stream without erroring. Detect it ourselves: an unclosed
    // spine frame or an active stub at stream-end means the input was cut
    // short. Surface as a parseError so the UI can show "incomplete JSON"
    // instead of silently returning a partial root that looks valid.
    if (!parseError && (stack.length > 0 || stub !== null)) {
      parseError = {
        message: 'Unexpected end of input: unclosed object or array',
        byteOffset: bytesProcessed,
      };
    }
  } catch (err) {
    if (!parseError) {
      parseError = { message: (err as Error).message };
    }
  } finally {
    // Release the file handle so the browser can GC the underlying File.
    // cancel() is safe to call even if read() reached its natural end.
    try {
      reader.releaseLock();
    } catch {
      // releaseLock throws if the stream is already finished; ignore.
    }
    try {
      await stream.cancel();
    } catch {
      // cancel() on an already-completed stream is fine; swallow.
    }
  }

  return { root, byteIndex, parseError };
}

// Convenience: parse from an in-memory string (vitest, small inputs). Wraps
// the string in a single-chunk ReadableStream.
export function streamFromString(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
