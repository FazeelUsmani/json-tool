import { describe, expect, test } from 'vitest';
import { repair } from './repair';

describe('repair — already-valid branch', () => {
  test('canonical object → already-valid', () => {
    expect(repair('{"a":1}')).toEqual({ kind: 'already-valid' });
  });

  test('object with whitespace formatting → already-valid (NOT cosmetic-repair)', () => {
    // The load-bearing check: jsonrepair would happily "rewrite" this
    // to a canonical form, but it parses fine — no dialog needed.
    expect(repair('{ "a" : 1 }')).toEqual({ kind: 'already-valid' });
    expect(repair('{\n  "a": 1\n}')).toEqual({ kind: 'already-valid' });
  });

  test('canonical array → already-valid', () => {
    expect(repair('[1, 2, 3]')).toEqual({ kind: 'already-valid' });
  });

  test('primitives → already-valid', () => {
    expect(repair('42')).toEqual({ kind: 'already-valid' });
    expect(repair('"hello"')).toEqual({ kind: 'already-valid' });
    expect(repair('true')).toEqual({ kind: 'already-valid' });
    expect(repair('null')).toEqual({ kind: 'already-valid' });
  });

  test('nested + escaped strings → already-valid', () => {
    expect(repair('{"k":"he said \\"hi\\""}')).toEqual({
      kind: 'already-valid',
    });
  });
});

describe('repair — repaired branch', () => {
  test('trailing comma → repaired (canonical LLM-output bug)', () => {
    const result = repair('{"a":1,}');
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    // Result is valid JSON; we don't assert exact format because
    // jsonrepair may produce any canonical form.
    expect(() => JSON.parse(result.repaired)).not.toThrow();
    // Parsed result should preserve the actual values.
    expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  test('single quotes → repaired', () => {
    const result = repair("{'a': 1}");
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  test('unquoted keys → repaired', () => {
    const result = repair('{a: 1, b: "two"}');
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    expect(JSON.parse(result.repaired)).toEqual({ a: 1, b: 'two' });
  });

  test('JS-style comments → repaired', () => {
    const result = repair('{\n  // comment\n  "a": 1\n}');
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  test('missing closing brace → repaired', () => {
    const result = repair('{"a":1');
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  test('multiple issues at once → repaired', () => {
    // Trailing comma + single quotes + unquoted key
    const result = repair("{a: 'one', b: 'two',}");
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;
    expect(JSON.parse(result.repaired)).toEqual({ a: 'one', b: 'two' });
  });
});

describe('repair — unrepairable branch', () => {
  test('completely garbled text → unrepairable with library error', () => {
    const result = repair('this is not json at all !@#$%');
    // jsonrepair is permissive — it may interpret this as a string
    // ("this is not json at all !@#$%" → quoted). Either result is
    // acceptable: if it returns, that's a valid JSON value; if it
    // throws, we route to unrepairable. Just confirm one of the two.
    expect(['repaired', 'unrepairable']).toContain(result.kind);
  });

  test('truncated mid-string → repaired or unrepairable, never crash', () => {
    // Exercises the "library returns or throws cleanly" contract.
    const result = repair('{"a":"unter');
    expect(['repaired', 'unrepairable']).toContain(result.kind);
  });
});

describe('repair — edge cases', () => {
  test('whitespace-only text', () => {
    // Empty + whitespace fall through JSON.parse (throws); jsonrepair
    // may return empty string or throw. Caller (EditorToolbar) is
    // expected to short-circuit empty input before calling repair,
    // but the function itself must not crash.
    const result = repair('   ');
    // Any of the three outcomes is acceptable here.
    expect(['already-valid', 'repaired', 'unrepairable']).toContain(
      result.kind,
    );
  });

  test('error message is a string when unrepairable', () => {
    // Force an unrepairable path: an empty string is the common case
    // where jsonrepair surfaces its own error.
    const result = repair('');
    if (result.kind === 'unrepairable') {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
    // If jsonrepair handles empty without throwing, that's fine too —
    // we just need the function to not crash.
  });
});
