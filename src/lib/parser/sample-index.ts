// Stub-sampling for byteIndex. Keeps the index size O(spine + sampled
// stubs) instead of O(stubs) — critical for 200MB+ inputs where the raw
// index would be ~135MB just for path→range entries.
//
// Rule: for each entry, find the OUTERMOST `[K]` array index in its path.
// If the enclosing array has more than THRESHOLD children, keep the entry
// only if K is divisible by N. Inner arrays (and pure-object paths) are
// always kept regardless.
//
// Why outermost-only: realistic shapes (telemetry, log streams,
// LLM-training corpora) typically have ONE huge array near the root +
// small inner arrays. Sampling the outermost catches the explosion;
// per-array (intersection) sampling adds complexity for no real benefit.
//
// NOTE: byteIndex is currently dormant infrastructure for future reverse
// lookups (byte offset → path), e.g., "scroll Monaco to bytes 1234".
// Stub expansion uses the inline byteStart/byteEnd on the TreeNode
// itself, NOT the index — so sampling preserves all current
// functionality. The day reverse lookup ships, callers must handle
// "exact path not in index" by finding the nearest sample and
// re-tokenizing forward from there. Flag in the future ticket.

import type { ByteIndexEntry } from './parser-types';

export type SamplingOptions = {
  threshold?: number; // min array size to trigger sampling
  n?: number;         // sample rate (keep every Nth array element)
};

export function sampleByteIndex(
  full: ByteIndexEntry[],
  arrayLengths: ReadonlyMap<string, number>,
  opts: SamplingOptions = {},
): ByteIndexEntry[] {
  const threshold = opts.threshold ?? 1000;
  const n = opts.n ?? 100;
  return full.filter(([path]) => keepEntry(path, arrayLengths, threshold, n));
}

function keepEntry(
  path: string,
  arrayLengths: ReadonlyMap<string, number>,
  threshold: number,
  n: number,
): boolean {
  const firstBracket = path.indexOf('[');
  if (firstBracket === -1) return true; // no array on path
  const closeBracket = path.indexOf(']', firstBracket);
  if (closeBracket === -1) return true; // malformed (defensive)
  const arrayPath = path.slice(0, firstBracket);
  const indexStr = path.slice(firstBracket + 1, closeBracket);
  const k = Number(indexStr);
  if (!Number.isInteger(k)) return true;
  const arrayLen = arrayLengths.get(arrayPath);
  if (arrayLen === undefined || arrayLen <= threshold) return true;
  return k % n === 0;
}
