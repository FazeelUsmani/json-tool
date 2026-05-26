import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BASELINE_BYTES,
  clearBaseline,
  formatRelativeTime,
  loadBaseline,
  saveBaseline,
} from './baseline';

// Vitest's default node environment doesn't expose localStorage.
// Mock with an in-memory Map shim via vi.stubGlobal rather than
// switching the whole file to jsdom (overkill for storage tests +
// vitest 4's per-file `@vitest-environment` annotation isn't picked
// up consistently). Reset between tests so state doesn't leak.
beforeAll(() => {
  const memStore = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memStore.set(k, v);
    },
    removeItem: (k: string) => {
      memStore.delete(k);
    },
    clear: () => {
      memStore.clear();
    },
    key: (i: number) => Array.from(memStore.keys())[i] ?? null,
    get length() {
      return memStore.size;
    },
  });
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe('saveBaseline / loadBaseline round-trip', () => {
  it('saves a small JSON and reads it back exactly', () => {
    const text = '{"hello":"world","n":42}';
    const result = saveBaseline(text);
    expect(result.ok).toBe(true);
    const loaded = loadBaseline();
    expect(loaded).not.toBeNull();
    expect(loaded?.text).toBe(text);
    expect(loaded?.bytes).toBe(text.length);
    expect(loaded?.savedAt).toBeGreaterThan(0);
    expect(loaded?.savedAt).toBeLessThanOrEqual(Date.now());
  });

  it('overwrites the previous baseline on second save', () => {
    saveBaseline('"first"');
    saveBaseline('"second"');
    const loaded = loadBaseline();
    expect(loaded?.text).toBe('"second"');
  });
});

describe('saveBaseline oversize guard', () => {
  it('rejects payloads above MAX_BASELINE_BYTES', () => {
    const huge = 'x'.repeat(MAX_BASELINE_BYTES + 1);
    const result = saveBaseline(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('too-large');
    if (result.reason !== 'too-large') return;
    expect(result.size).toBe(huge.length);
    expect(result.limit).toBe(MAX_BASELINE_BYTES);
  });

  it('does NOT write to localStorage when rejecting oversize', () => {
    saveBaseline('"existing"'); // seed
    saveBaseline('x'.repeat(MAX_BASELINE_BYTES + 1));
    const loaded = loadBaseline();
    expect(loaded?.text).toBe('"existing"'); // unchanged
  });

  it('accepts payload exactly at the limit', () => {
    const atLimit = 'x'.repeat(MAX_BASELINE_BYTES);
    const result = saveBaseline(atLimit);
    expect(result.ok).toBe(true);
  });
});

describe('clearBaseline', () => {
  it('removes the saved baseline', () => {
    saveBaseline('{"a":1}');
    expect(loadBaseline()).not.toBeNull();
    clearBaseline();
    expect(loadBaseline()).toBeNull();
  });

  it('is a no-op when no baseline exists', () => {
    expect(() => clearBaseline()).not.toThrow();
    expect(loadBaseline()).toBeNull();
  });
});

describe('loadBaseline malformed / missing', () => {
  it('returns null when storage is empty', () => {
    expect(loadBaseline()).toBeNull();
  });

  it('returns null when storage holds invalid JSON', () => {
    localStorage.setItem('json-tool:diff-baseline:v1', '{not valid');
    expect(loadBaseline()).toBeNull();
  });

  it('returns null when stored object lacks required fields', () => {
    localStorage.setItem(
      'json-tool:diff-baseline:v1',
      JSON.stringify({ text: 'hi' }), // missing savedAt + bytes
    );
    expect(loadBaseline()).toBeNull();
  });

  it('returns null when stored object has wrong field types', () => {
    localStorage.setItem(
      'json-tool:diff-baseline:v1',
      JSON.stringify({ text: 'hi', savedAt: 'not-a-number', bytes: 2 }),
    );
    expect(loadBaseline()).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const NOW = 1_000_000_000_000;

  it('returns "just now" for sub-minute durations', () => {
    expect(formatRelativeTime(NOW - 0, NOW)).toBe('just now');
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('just now');
  });

  it('returns "Nm ago" for minute-scale durations', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1m ago');
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59m ago');
  });

  it('returns "Nh ago" for hour-scale durations', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1h ago');
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe('23h ago');
  });

  it('returns "Nd ago" for day-scale durations under a week', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1d ago');
    expect(formatRelativeTime(NOW - 6 * 24 * 60 * 60_000, NOW)).toBe('6d ago');
  });

  it('falls back to absolute date for ≥7 days', () => {
    const tenDaysAgo = NOW - 10 * 24 * 60 * 60_000;
    const result = formatRelativeTime(tenDaysAgo, NOW);
    // Don't assert exact format (locale-dependent) — just that it's
    // not the relative-time form.
    expect(result).not.toMatch(/ago$/);
  });

  it('handles clock skew (timestamp in the future) gracefully', () => {
    expect(formatRelativeTime(NOW + 10_000, NOW)).toBe('just now');
  });
});
