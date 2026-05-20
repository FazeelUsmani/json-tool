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

// Deep imports use .js so TypeScript resolves them through the package's
// `./*` exports map (which only matches with the extension).
import Tokenizer from '@streamparser/json/tokenizer.js';
import TokenType from '@streamparser/json/utils/types/tokenType.js';
import type { ParsedTokenInfo } from '@streamparser/json/utils/types/parsedTokenInfo.js';
import type { TreeNode } from '@/lib/tree/parse';
import {
  MAX_SPINE_DEPTH,
  type ByteIndexEntry,
  type ParseError,
  type ParseProgress,
  type ParseResult,
} from './parser-types';
import { sampleByteIndex, type SamplingOptions } from './sample-index';

// Spine frame on the stack. The STRING-as-key vs STRING-as-value
// disambiguation reads `peek().kind` directly — the current frame's own
// kind tells us whether we're in object position (key context) or array
// position (value context). pendingKey only matters for object frames.
type ObjectFrame = {
  kind: 'object';
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
//
// W3-Wed Part B: previewStarts/previewEnds collect byte ranges of the
// first up-to-3 immediate children (KV pairs for objects, elements for
// arrays). StubRow later slices sourceBlob with these to render an inline
// preview. awaitingElement is the small state machine that distinguishes
// "next token starts a new element" (true after open or after a COMMA at
// depthAccum=1) from "we're inside an element" (false).
type StubState = {
  kind: 'stub-object' | 'stub-array';
  key: string | null;
  path: string;
  byteStart: number;
  depthAccum: number;
  commaCount: number;
  hasElement: boolean;
  previewStarts: number[];
  previewEnds: number[];
  awaitingElement: boolean;
};

export type ParseOptions = {
  onProgress?: (p: ParseProgress) => void;
  // Polled between chunks. Caller flips `aborted` to abort; the function
  // returns whatever it has parsed so far (root may be null/partial).
  signal?: { aborted: boolean };
  totalBytes?: number;
  // For stub expansion: re-parse a byte slice as if it were rooted at
  // `basePath` instead of '$', with all reported byte offsets in the
  // result shifted by `byteOffsetBase` so they point into the ORIGINAL
  // file (not the slice). Defaults '$' / 0 — top-level parse uses these.
  basePath?: string;
  byteOffsetBase?: number;
  // byteIndex stub sampling. Defaults to threshold=1000, n=100. Pass
  // { threshold: Infinity } to disable for callers that need the full
  // index (e.g., the dormant-reverse-lookup work when it lands).
  sampling?: SamplingOptions;
};

export async function parseStreaming(
  stream: ReadableStream<Uint8Array>,
  opts: ParseOptions = {},
): Promise<ParseResult> {
  const tokenizer = new Tokenizer();
  const stack: Frame[] = [];
  const byteIndex: ByteIndexEntry[] = [];
  // Per-array child counts collected during parse — fed to sampleByteIndex
  // after the parse finishes so we can drop redundant stub entries when
  // an enclosing array is large. Spine arrays populate on close (real
  // children.length); stub-arrays populate at the same moment from the
  // tracked childCount.
  const arrayLengths = new Map<string, number>();
  let stub: StubState | null = null;
  let depth = 0;
  let root: TreeNode | null = null;
  let parseError: ParseError | undefined;
  let halted = false; // set after onError; ignores further tokens

  const basePath = opts.basePath ?? '$';
  const byteOffsetBase = opts.byteOffsetBase ?? 0;

  // ----- helpers ----------------------------------------------------------

  const peek = (): Frame | null => stack[stack.length - 1] ?? null;

  // Path + key for the NEXT child the parent will attach. Reads (and for
  // objects, consumes via pendingKey) the parent's state. For the root
  // (no parent), returns the basePath ('$' for top-level parse, the stub
  // path for expansion).
  const nextChildIdentity = (): { key: string | null; path: string } => {
    const p = peek();
    if (p === null) return { key: null, path: basePath };
    if (p.kind === 'object') {
      // Tokenizer invariant: in an object frame, every value token is
      // preceded by a key STRING token that sets pendingKey. If pendingKey
      // is null here, something is very wrong — fail loud rather than
      // silently emit `$.` paths.
      if (p.pendingKey === null) {
        throw new Error(
          'parser invariant violated: object frame missing pendingKey',
        );
      }
      const key = p.pendingKey;
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
        // Close out the final element's preview range if one was still
        // open — the last element has no COMMA after it; it ends at the
        // closing bracket's offset.
        if (
          !stub.awaitingElement &&
          stub.previewEnds.length < stub.previewStarts.length
        ) {
          stub.previewEnds.push(info.offset + byteOffsetBase);
        }
        const preview: { byteStart: number; byteEnd: number }[] = [];
        for (let i = 0; i < stub.previewEnds.length; i++) {
          preview.push({
            byteStart: stub.previewStarts[i],
            byteEnd: stub.previewEnds[i],
          });
        }

        const childCount = stub.commaCount + (stub.hasElement ? 1 : 0);
        const stubNode: TreeNode =
          stub.kind === 'stub-object'
            ? {
                kind: 'stub-object',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1 + byteOffsetBase,
                childCount,
                preview,
              }
            : {
                kind: 'stub-array',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1 + byteOffsetBase,
                childCount,
                preview,
              };
        byteIndex.push([
          stubNode.path,
          { byteStart: stubNode.byteStart, byteEnd: stubNode.byteEnd },
        ]);
        if (stub.kind === 'stub-array') {
          arrayLengths.set(stub.path, childCount);
        }
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
          // Progressive disclosure: do NOT walk into this subtree. The
          // initial parse only materializes the top MAX_SPINE_DEPTH levels;
          // anything deeper waits for an explicit expandStub call. Without
          // this gate, 200MB inputs balloon to multi-GB RSS from spine
          // FlatRows / TreeNodes. If you ever refactor to "fully
          // materialize on expand," remember the user is on a phone with
          // 4GB RAM total.
          //
          // Switch into stub mode. depthAccum starts at 1 (we just entered
          // the stub's outermost container).
          stub = {
            kind: isObj ? 'stub-object' : 'stub-array',
            key,
            path,
            byteStart: info.offset + byteOffsetBase,
            depthAccum: 1,
            commaCount: 0,
            hasElement: false,
            previewStarts: [],
            previewEnds: [],
            awaitingElement: true,
          };
        } else {
          // Materialize a spine frame.
          const frame: Frame = isObj
            ? {
                kind: 'object',
                key,
                path,
                children: [],
                byteStart: info.offset + byteOffsetBase,
                pendingKey: null,
              }
            : {
                kind: 'array',
                key,
                path,
                children: [],
                byteStart: info.offset + byteOffsetBase,
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
        const byteEnd = info.offset + 1 + byteOffsetBase;
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
        if (frame.kind === 'array') {
          arrayLengths.set(frame.path, frame.children.length);
        }
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
    // Preview tracking happens at depthAccum === 1 (immediate children of
    // the stub). Must run BEFORE depth updates so we read the pre-update
    // depth context. Caps starts at 3; ends always track to match.
    if (s.depthAccum === 1) {
      switch (info.token) {
        case TokenType.COMMA:
          if (
            !s.awaitingElement &&
            s.previewEnds.length < s.previewStarts.length
          ) {
            s.previewEnds.push(info.offset + byteOffsetBase);
          }
          s.awaitingElement = true;
          break;
        case TokenType.STRING:
        case TokenType.NUMBER:
        case TokenType.TRUE:
        case TokenType.FALSE:
        case TokenType.NULL:
        case TokenType.LEFT_BRACE:
        case TokenType.LEFT_BRACKET:
          if (s.awaitingElement) {
            if (s.previewStarts.length < 3) {
              s.previewStarts.push(info.offset + byteOffsetBase);
            }
            s.awaitingElement = false;
          }
          break;
      }
    }

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
    // Tokenizer.end() surfaces some incomplete states (mid-token) via
    // onError but accepts unclosed-bracket inputs silently. Catch the
    // silent case ourselves: unclosed spine frames or an active stub at
    // stream-end means the input was cut short.
    if (!parseError && (stack.length > 0 || stub !== null)) {
      parseError = {
        message: 'Unexpected end of input: unclosed object or array',
        byteOffset: bytesProcessed + byteOffsetBase,
      };
    }
  } catch (err) {
    if (!parseError) {
      parseError = { message: (err as Error).message };
    }
  } finally {
    // Partial-root contract: when parsing errored or ended early, the
    // spine frames still on the stack haven't been materialized into
    // TreeNodes (only complete close-tokens do that). Drain the stack
    // from innermost outward, materializing each frame with whatever
    // children it accumulated, so the user sees what parsed instead of
    // an empty `root: null`. The active stub (if any) is discarded — it
    // never reached a coherent boundary, so emitting a half-stub TreeNode
    // would mislead.
    if (parseError) {
      while (stack.length > 0) {
        const frame = stack.pop()!;
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
        attach(node);
      }
    }
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

  // Post-parse: sample the byteIndex to keep it bounded at scale. Stub
  // TreeNodes carry their own byteStart/byteEnd inline and are untouched —
  // only the path→range index is thinned. See sample-index.ts for rule.
  const sampledIndex = sampleByteIndex(byteIndex, arrayLengths, opts.sampling);

  return { root, byteIndex: sampledIndex, parseError };
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
