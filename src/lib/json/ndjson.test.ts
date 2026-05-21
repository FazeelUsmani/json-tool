import { describe, expect, test } from 'vitest';
import {
  buildLineIndex,
  detectNdjson,
  lineCount,
  lineSlice,
} from './ndjson';

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('detectNdjson', () => {
  test('empty buffer → not NDJSON', () => {
    expect(detectNdjson(new Uint8Array(0))).toBe(false);
  });

  test('single-line JSON document → not NDJSON', () => {
    expect(detectNdjson(enc.encode('{"a":1,"b":2}'))).toBe(false);
  });

  test('two valid JSON objects on separate lines → NDJSON', () => {
    expect(detectNdjson(enc.encode('{"a":1}\n{"b":2}\n'))).toBe(true);
  });

  test('valid + invalid line → not NDJSON (first non-parseable line decides)', () => {
    expect(detectNdjson(enc.encode('{"a":1}\nnot-json\n'))).toBe(false);
  });

  test('garbage on first line → not NDJSON', () => {
    expect(detectNdjson(enc.encode('not-json\n{"a":1}\n'))).toBe(false);
  });

  test('JSON document spread across lines → not NDJSON (line-1 alone fails)', () => {
    // `{` alone isn't valid JSON, so the multi-line pretty-printed
    // document fails the first-line parse check.
    expect(detectNdjson(enc.encode('{\n  "a": 1\n}\n'))).toBe(false);
  });

  test('UTF-8 BOM at start is tolerated', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = enc.encode('{"a":1}\n{"b":2}\n');
    const buf = new Uint8Array(bom.length + body.length);
    buf.set(bom);
    buf.set(body, bom.length);
    expect(detectNdjson(buf)).toBe(true);
  });

  test('blank lines between records are skipped', () => {
    expect(detectNdjson(enc.encode('{"a":1}\n\n{"b":2}\n'))).toBe(true);
  });

  test('CRLF line endings are tolerated', () => {
    expect(detectNdjson(enc.encode('{"a":1}\r\n{"b":2}\r\n'))).toBe(true);
  });

  test('NDJSON of primitives is recognized', () => {
    // Each line is a valid JSON value, even if not an object.
    expect(detectNdjson(enc.encode('1\n2\n3\n'))).toBe(true);
  });

  test('mixed shapes per line still count (each line is independent JSON)', () => {
    expect(detectNdjson(enc.encode('{"a":1}\n[1,2,3]\n"hello"\n'))).toBe(true);
  });

  test('only one parseable line before sample exhausts → not NDJSON', () => {
    // Sample = 12 bytes. Only the first line is fully visible; the
    // second line is mid-content (not terminated by a newline) so
    // detection cannot confirm a second valid line.
    expect(detectNdjson(enc.encode('{"a":1}\n{"b":2'), 12)).toBe(false);
  });
});

describe('buildLineIndex', () => {
  test('empty buffer → single sentinel at 0', () => {
    const idx = buildLineIndex(new Uint8Array(0));
    expect(Array.from(idx)).toEqual([0]);
    expect(lineCount(idx)).toBe(0);
  });

  test('single line no trailing LF', () => {
    const idx = buildLineIndex(enc.encode('{"a":1}'));
    expect(Array.from(idx)).toEqual([0, 7]);
    expect(lineCount(idx)).toBe(1);
  });

  test('two lines, trailing LF', () => {
    // bytes: `{"a":1}\n{"b":2}\n`
    //        0      7        15
    const idx = buildLineIndex(enc.encode('{"a":1}\n{"b":2}\n'));
    expect(Array.from(idx)).toEqual([0, 8, 16]);
    expect(lineCount(idx)).toBe(2);
  });

  test('two lines, no trailing LF', () => {
    const idx = buildLineIndex(enc.encode('{"a":1}\n{"b":2}'));
    expect(Array.from(idx)).toEqual([0, 8, 15]);
    expect(lineCount(idx)).toBe(2);
  });

  test('blank line in the middle is preserved', () => {
    // bytes: `a\n\nb\n` → lines [0..1), [2..2), [3..4)
    const idx = buildLineIndex(enc.encode('a\n\nb\n'));
    expect(Array.from(idx)).toEqual([0, 2, 3, 5]);
    expect(lineCount(idx)).toBe(3);
  });

  test('lineSlice returns the right byte view, including trailing LF', () => {
    const bytes = enc.encode('{"a":1}\n{"b":2}\n');
    const idx = buildLineIndex(bytes);
    expect(dec.decode(lineSlice(bytes, idx, 0))).toBe('{"a":1}\n');
    expect(dec.decode(lineSlice(bytes, idx, 1))).toBe('{"b":2}\n');
  });

  test('lineSlice is a view, not a copy (shares underlying buffer)', () => {
    const bytes = enc.encode('a\nb\nc\n');
    const idx = buildLineIndex(bytes);
    const slice = lineSlice(bytes, idx, 1);
    expect(slice.buffer).toBe(bytes.buffer);
  });

  test('lineSlice out of range throws RangeError', () => {
    const idx = buildLineIndex(enc.encode('a\nb\n'));
    expect(() => lineSlice(enc.encode('a\nb\n'), idx, 2)).toThrow(RangeError);
    expect(() => lineSlice(enc.encode('a\nb\n'), idx, -1)).toThrow(RangeError);
  });

  test('CRLF preserved inside the slice; LF is the separator', () => {
    const bytes = enc.encode('{"a":1}\r\n{"b":2}\r\n');
    const idx = buildLineIndex(bytes);
    expect(lineCount(idx)).toBe(2);
    // Line 0 contains everything before and including the LF, so '\r'
    // sits inside the slice. JSON.parse tolerates it as whitespace.
    expect(dec.decode(lineSlice(bytes, idx, 0))).toBe('{"a":1}\r\n');
    expect(JSON.parse(dec.decode(lineSlice(bytes, idx, 0)))).toEqual({
      a: 1,
    });
  });
});
