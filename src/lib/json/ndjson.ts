// NDJSON (newline-delimited JSON) detection + line-offset index.
//
// Why this matters: most "huge JSON in the wild" is actually NDJSON —
// telemetry exports, LLM training corpora, log streams, Stripe / Mongo
// dumps. Treating them as one giant JSON document forces JSON.parse on
// the whole file (impossible past ~50MB on a phone). Treating them as a
// list of independent records lets us index by line and lazy-decode just
// the lines the user is looking at.
//
// This module contains the PURE functions only — no DOM, no React, no
// worker globals. The detection runs on a 4KB head sample; the line
// index walks the full buffer. Both are byte-level so they survive any
// UTF-8 content (multibyte chars cannot contain a 0x0A byte — LF is
// strictly ASCII).
//
// CR / CRLF: a `\r` immediately before `\n` is left inside the line
// slice. JSON.parse tolerates trailing whitespace, so a CRLF-ended line
// parses identically to an LF-ended one. We don't normalize.

const LF = 0x0a;
const DEFAULT_DETECT_SAMPLE_BYTES = 4 * 1024;
// Minimum number of consecutive parseable lines in the head sample
// before we call it NDJSON. Two is enough to disambiguate from
// single-document JSON that happens to span multiple lines (where the
// first line alone wouldn't parse).
const DETECT_MIN_LINES = 2;

// Position array: positions[i] is the byte offset where line i starts.
// positions[N] (one past the last line) is the total byte length, so
// line i's bytes are positions[i]..positions[i+1] (slice end exclusive,
// including any trailing LF). Choosing Uint32Array caps file size at
// 4GB which is well past our 500MB public ceiling and keeps the index
// itself compact — for a 1M-line file the index is ~4MB, vs ~150MB if
// we stored {start, end} JS objects.
export type LineIndex = Uint32Array;

/**
 * Sample the head of a buffer and decide whether it's NDJSON. Looks for
 * at least DETECT_MIN_LINES consecutive complete lines that each
 * round-trip through JSON.parse. Returns false for empty input, single-
 * line content, or content where the first line fails to parse.
 */
export function detectNdjson(
  bytes: Uint8Array,
  sampleBytes: number = DEFAULT_DETECT_SAMPLE_BYTES,
): boolean {
  if (bytes.byteLength === 0) return false;

  const head = bytes.subarray(0, Math.min(sampleBytes, bytes.byteLength));
  const decoded = decodeUtf8Lossy(head);

  // Skip a UTF-8 BOM (the decoder may pass it through as U+FEFF).
  let cursor = decoded.charCodeAt(0) === 0xfeff ? 1 : 0;
  // Skip leading whitespace before the first record.
  while (cursor < decoded.length && isJsonWhitespace(decoded.charCodeAt(cursor))) {
    cursor++;
  }

  let parsedLines = 0;
  while (cursor < decoded.length && parsedLines < DETECT_MIN_LINES) {
    const nl = decoded.indexOf('\n', cursor);
    if (nl === -1) {
      // Reached the end of the head sample without a newline. If we've
      // already seen one complete line, the next line was truncated by
      // the sample window — not conclusive evidence either way, so
      // return based on what we have so far.
      break;
    }
    const line = decoded.slice(cursor, nl).trim();
    cursor = nl + 1;
    if (line === '') continue; // skip blank lines between records
    try {
      JSON.parse(line);
      parsedLines++;
    } catch {
      // First non-blank line that doesn't parse → definitely not NDJSON.
      return false;
    }
  }

  return parsedLines >= DETECT_MIN_LINES;
}

/**
 * Build a line-start index for the given buffer. Returned array has
 * length (lineCount + 1) so that the last entry is the buffer length,
 * making `bytes.subarray(positions[i], positions[i + 1])` always yield
 * the i-th line (including any trailing LF).
 *
 * Lines are LF-separated; a CR immediately before LF is left inside the
 * line slice and JSON.parse handles it as trailing whitespace.
 */
export function buildLineIndex(bytes: Uint8Array): LineIndex {
  if (bytes.byteLength === 0) {
    return new Uint32Array([0]);
  }
  // First pass: count newlines so we can allocate the exact-size array.
  let count = 1; // every buffer has at least one line
  for (let i = 0; i < bytes.byteLength; i++) {
    if (bytes[i] === LF) count++;
  }
  // If the final byte is LF, the trailing "line" is empty; we still
  // store its start (== bytes.byteLength) so the slice yields '' rather
  // than walking off the end.
  const positions = new Uint32Array(count + (bytes[bytes.byteLength - 1] === LF ? 0 : 1));
  positions[0] = 0;
  let idx = 1;
  for (let i = 0; i < bytes.byteLength; i++) {
    if (bytes[i] === LF) {
      positions[idx++] = i + 1;
    }
  }
  // Last slot: bytes.byteLength. If the file ends in LF, idx already
  // landed there from the loop above; otherwise we set it explicitly.
  if (idx < positions.length) {
    positions[idx] = bytes.byteLength;
  }
  return positions;
}

/** Number of lines in the index (the trailing sentinel does NOT count). */
export function lineCount(index: LineIndex): number {
  return index.length - 1;
}

/**
 * Extract line `i` as a byte view of the source. View, not copy — the
 * returned Uint8Array shares the underlying buffer.
 */
export function lineSlice(
  bytes: Uint8Array,
  index: LineIndex,
  i: number,
): Uint8Array {
  if (i < 0 || i >= lineCount(index)) {
    throw new RangeError(
      `lineSlice: index ${i} out of range [0, ${lineCount(index)})`,
    );
  }
  return bytes.subarray(index[i], index[i + 1]);
}

// ---- helpers ---------------------------------------------------------

function isJsonWhitespace(c: number): boolean {
  // Per RFC 8259: space, horizontal tab, line feed, carriage return.
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

function decodeUtf8Lossy(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
