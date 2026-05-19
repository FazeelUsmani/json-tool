// Types shared between the streaming parser, its worker entrypoint, and the
// main-thread host. No DOM / React / Worker imports — must be safe to import
// from either side of the Comlink boundary.

import type { TreeNode } from '@/lib/tree/parse';

export type ParseProgress = {
  bytesProcessed: number;
  totalBytes: number;
};

// Pair of byte offsets [start, end) into the original input. Used by the
// byte index and (inline) by stub TreeNodes.
export type ByteRange = { byteStart: number; byteEnd: number };

// Entry in the byte-offset index. Tuple form (not Map) so structured-clone
// across the Comlink boundary is cheap; the main side can rebuild a Map if
// it wants O(1) lookup.
export type ByteIndexEntry = readonly [path: string, range: ByteRange];

export type ParseError = {
  message: string;
  line?: number;
  col?: number;
  byteOffset?: number;
};

// `root` may be PARTIAL when parseError is set — whatever the tokenizer
// emitted before hitting the bad token is preserved so the user sees what
// parsed instead of an empty pane.
export type ParseResult = {
  root: TreeNode | null;
  byteIndex: ByteIndexEntry[];
  parseError?: ParseError;
};

// Top 3 levels (depths 0, 1, 2) are fully materialized in the spine.
// Composites at depth >= MAX_SPINE_DEPTH become stubs with byte ranges; the
// user expands them on demand. PLAN.MD W3 architecture.
export const MAX_SPINE_DEPTH = 3;
