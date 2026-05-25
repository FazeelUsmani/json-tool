import { describe, expect, test } from 'vitest';
import {
  ROOT_ID,
  ROOT_PATH,
  appendDisplayPath,
  appendPointer,
  pointerSegment,
} from './identity';

describe('pointerSegment — RFC 6901 escapes', () => {
  test('plain string passes through', () => {
    expect(pointerSegment('events')).toBe('events');
  });

  test('number becomes decimal string', () => {
    expect(pointerSegment(0)).toBe('0');
    expect(pointerSegment(42)).toBe('42');
  });

  test('tilde escapes to ~0', () => {
    expect(pointerSegment('a~b')).toBe('a~0b');
  });

  test('slash escapes to ~1', () => {
    expect(pointerSegment('a/b')).toBe('a~1b');
  });

  test('tilde + slash both escape (order matters: ~ first)', () => {
    // Per RFC 6901: encode ~ before /, so ~/ → ~0~1 not ~01
    expect(pointerSegment('~/')).toBe('~0~1');
  });

  test('dots and brackets pass through (not separators in JSON Pointer)', () => {
    expect(pointerSegment('a.b')).toBe('a.b');
    expect(pointerSegment('[0]')).toBe('[0]');
  });

  test('empty string is a valid segment (empty key)', () => {
    expect(pointerSegment('')).toBe('');
  });

  test('whitespace + special chars pass through', () => {
    expect(pointerSegment('with space')).toBe('with space');
    expect(pointerSegment('$@!')).toBe('$@!');
  });
});

describe('appendPointer — RFC 6901 path building', () => {
  test('root + child', () => {
    expect(appendPointer(ROOT_ID, 'events')).toBe('/events');
  });

  test('chained children', () => {
    let p = ROOT_ID;
    p = appendPointer(p, 'events');
    p = appendPointer(p, 42);
    p = appendPointer(p, 'user');
    p = appendPointer(p, 'id');
    expect(p).toBe('/events/42/user/id');
  });

  test('child with dot does NOT collide with nested', () => {
    const a = appendPointer(ROOT_ID, 'a.b'); // single key "a.b"
    let b = ROOT_ID;
    b = appendPointer(b, 'a');
    b = appendPointer(b, 'b'); // nested {a: {b}}
    expect(a).not.toBe(b);
    expect(a).toBe('/a.b');
    expect(b).toBe('/a/b');
  });

  test('child with bracket does NOT collide with array index', () => {
    const a = appendPointer(ROOT_ID, '[0]'); // key literally "[0]"
    const b = appendPointer(ROOT_ID, 0); // array index 0
    expect(a).not.toBe(b);
    expect(a).toBe('/[0]');
    expect(b).toBe('/0');
  });

  test('empty-string key produces /', () => {
    // Empty key under root: id is `/` (root + empty segment).
    expect(appendPointer(ROOT_ID, '')).toBe('/');
  });
});

describe('appendDisplayPath — JSONPath display', () => {
  test('root + safe identifier', () => {
    expect(appendDisplayPath(ROOT_PATH, 'events')).toBe('$.events');
  });

  test('root + array index', () => {
    expect(appendDisplayPath(ROOT_PATH, 0)).toBe('$[0]');
  });

  test('chained: object → array → object', () => {
    let p = ROOT_PATH;
    p = appendDisplayPath(p, 'events');
    p = appendDisplayPath(p, 42);
    p = appendDisplayPath(p, 'user');
    expect(p).toBe('$.events[42].user');
  });

  test('non-identifier key bracket-quotes', () => {
    expect(appendDisplayPath(ROOT_PATH, 'a.b')).toBe('$["a.b"]');
    expect(appendDisplayPath(ROOT_PATH, '[0]')).toBe('$["[0]"]');
    expect(appendDisplayPath(ROOT_PATH, 'with space')).toBe(
      '$["with space"]',
    );
    expect(appendDisplayPath(ROOT_PATH, '')).toBe('$[""]');
  });

  test('key starting with digit bracket-quotes', () => {
    // "1abc" is a valid JSON key but not a JS identifier
    expect(appendDisplayPath(ROOT_PATH, '1abc')).toBe('$["1abc"]');
  });

  test('underscore/dollar safe', () => {
    expect(appendDisplayPath(ROOT_PATH, '_priv')).toBe('$._priv');
    expect(appendDisplayPath(ROOT_PATH, '$jq')).toBe('$.$jq');
  });

  test('escaped quotes in key round-trip through JSON.stringify', () => {
    expect(appendDisplayPath(ROOT_PATH, 'has "quotes"')).toBe(
      '$["has \\"quotes\\""]',
    );
  });
});

describe('id vs path — the load-bearing distinction', () => {
  test('keys with dots, brackets, slashes produce distinct ids but readable paths', () => {
    type Case = { key: string; expectedId: string; expectedPath: string };
    const cases: Case[] = [
      { key: 'a.b', expectedId: '/a.b', expectedPath: '$["a.b"]' },
      { key: '[0]', expectedId: '/[0]', expectedPath: '$["[0]"]' },
      { key: 'a/b', expectedId: '/a~1b', expectedPath: '$["a/b"]' },
      { key: 'a~b', expectedId: '/a~0b', expectedPath: '$["a~b"]' },
    ];
    for (const c of cases) {
      expect(appendPointer(ROOT_ID, c.key)).toBe(c.expectedId);
      expect(appendDisplayPath(ROOT_PATH, c.key)).toBe(c.expectedPath);
    }
  });
});
