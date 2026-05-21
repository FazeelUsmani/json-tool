import { describe, expect, test } from 'vitest';
import { parseNdjson } from './parse-ndjson';

function blobOf(text: string): Blob {
  return new Blob([text], { type: 'application/x-ndjson' });
}

describe('parseNdjson', () => {
  test('empty blob → empty array root', async () => {
    const r = await parseNdjson(blobOf(''));
    expect(r.lineCount).toBe(0);
    if (r.root.kind !== 'array') throw new Error('unreachable');
    expect(r.root.children).toEqual([]);
  });

  test('two lines, LF-terminated → 2 ndjson-line children with paths $[0], $[1]', async () => {
    const r = await parseNdjson(blobOf('{"a":1}\n{"b":2}\n'));
    expect(r.lineCount).toBe(2);
    if (r.root.kind !== 'array') throw new Error('unreachable');
    const [a, b] = r.root.children;
    if (a.kind !== 'ndjson-line') throw new Error('unreachable');
    if (b.kind !== 'ndjson-line') throw new Error('unreachable');
    expect(a.path).toBe('$[0]');
    expect(b.path).toBe('$[1]');
  });

  test('byte ranges exclude trailing LF / CRLF', async () => {
    const text = '{"a":1}\n{"b":2}\r\n';
    const r = await parseNdjson(blobOf(text));
    const bytes = new TextEncoder().encode(text);
    if (r.root.kind !== 'array') throw new Error('unreachable');
    const [a, b] = r.root.children;
    if (a.kind !== 'ndjson-line' || b.kind !== 'ndjson-line') {
      throw new Error('unreachable');
    }
    expect(new TextDecoder().decode(bytes.subarray(a.byteStart, a.byteEnd))).toBe(
      '{"a":1}',
    );
    expect(new TextDecoder().decode(bytes.subarray(b.byteStart, b.byteEnd))).toBe(
      '{"b":2}',
    );
  });

  test('blank lines between records are skipped', async () => {
    const r = await parseNdjson(blobOf('{"a":1}\n\n{"b":2}\n'));
    expect(r.lineCount).toBe(2);
    if (r.root.kind !== 'array') throw new Error('unreachable');
    // keys reflect the dense position (no gap for the blank line)
    expect((r.root.children[0] as { key: string }).key).toBe('0');
    expect((r.root.children[1] as { key: string }).key).toBe('1');
  });

  test('last line without trailing LF is still captured', async () => {
    const r = await parseNdjson(blobOf('{"a":1}\n{"b":2}'));
    expect(r.lineCount).toBe(2);
  });

  test('byte slice round-trips through JSON.parse for each line', async () => {
    const text = '{"id":0}\n{"id":1}\n{"id":2}\n';
    const r = await parseNdjson(blobOf(text));
    const bytes = new TextEncoder().encode(text);
    if (r.root.kind !== 'array') throw new Error('unreachable');
    const parsed = r.root.children.map((c) => {
      if (c.kind !== 'ndjson-line') throw new Error('unreachable');
      return JSON.parse(
        new TextDecoder().decode(bytes.subarray(c.byteStart, c.byteEnd)),
      );
    });
    expect(parsed).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
  });
});
