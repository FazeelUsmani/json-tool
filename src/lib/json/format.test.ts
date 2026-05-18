import { describe, expect, test } from 'vitest';
import { formatJson, minifyJson, sortKeysJson } from './format';

describe('formatJson', () => {
  test('pretty-prints valid JSON with 2-space default indent', () => {
    const result = formatJson('{"a":1,"b":2}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  test('honours custom indent', () => {
    const result = formatJson('{"a":1}', { indent: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{\n    "a": 1\n}');
  });

  test('invalid JSON returns line + col', () => {
    const result = formatJson('{"a":1,}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
    // V8 reports the trailing comma somewhere — line:col may come from the
    // message directly or from the position fallback. We just assert that
    // at least one of them was extracted (proves the locator works on the
    // current Node runtime).
    expect(result.error.line ?? result.error.col).toBeDefined();
  });

  test('empty string is invalid', () => {
    const result = formatJson('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
    expect(result.error.message).toMatch(/empty/i);
  });

  test('top-level primitives are valid JSON', () => {
    expect(formatJson('42')).toEqual({ ok: true, text: '42' });
    expect(formatJson('"hello"')).toEqual({ ok: true, text: '"hello"' });
    expect(formatJson('null')).toEqual({ ok: true, text: 'null' });
    expect(formatJson('true')).toEqual({ ok: true, text: 'true' });
  });
});

describe('minifyJson', () => {
  test('strips whitespace from a formatted JSON', () => {
    const input = '{\n  "a": 1,\n  "b": [1, 2, 3]\n}';
    const result = minifyJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{"a":1,"b":[1,2,3]}');
  });

  test('rejects invalid JSON', () => {
    const result = minifyJson('not json');
    expect(result.ok).toBe(false);
  });
});

describe('sortKeysJson', () => {
  test('sorts object keys alphabetically, recursively', () => {
    const input = '{"z":1,"a":{"y":2,"b":3}}';
    const result = sortKeysJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}');
  });

  test('preserves array element order (sorting elements would change meaning)', () => {
    const input = '{"items":[3,1,2]}';
    const result = sortKeysJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('"items": [\n    3,\n    1,\n    2\n  ]');
  });

  test('sorts keys inside objects nested in arrays', () => {
    const input = '[{"z":1,"a":2}]';
    const result = sortKeysJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('[\n  {\n    "a": 2,\n    "z": 1\n  }\n]');
  });
});

describe('round-trip invariants', () => {
  test('format(minify(text)) equals format(text) for valid JSON', () => {
    const samples = [
      '{"a":1,"b":[2,3]}',
      '[1,2,3]',
      '{"nested":{"deep":{"value":null}}}',
      '"just a string"',
    ];
    for (const sample of samples) {
      const min = minifyJson(sample);
      expect(min.ok).toBe(true);
      if (!min.ok) continue;
      const formattedFromMin = formatJson(min.text);
      const formattedFromOriginal = formatJson(sample);
      expect(formattedFromMin).toEqual(formattedFromOriginal);
    }
  });
});
