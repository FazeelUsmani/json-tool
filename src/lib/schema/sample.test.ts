import { describe, expect, test } from 'vitest';
import { sampleIndices } from './sample';

describe('sampleIndices', () => {
  test('empty when n is 0', () => {
    expect(sampleIndices(0, 10)).toEqual([]);
  });

  test('empty when k is 0', () => {
    expect(sampleIndices(100, 0)).toEqual([]);
  });

  test('walks all indices when k >= n (k > n branch)', () => {
    expect(sampleIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
  });

  test('walks all indices when k === n (boundary; would infinite-loop random-set)', () => {
    expect(sampleIndices(5, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  test('samples exactly k indices when k < n', () => {
    expect(sampleIndices(1000, 100).length).toBe(100);
  });

  test('all sampled indices are in [0, n)', () => {
    const result = sampleIndices(1000, 100);
    for (const i of result) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(1000);
    }
  });

  test('all sampled indices are unique', () => {
    const result = sampleIndices(1000, 100);
    expect(new Set(result).size).toBe(result.length);
  });

  test('handles k near n without infinite loop (collision-heavy zone)', () => {
    // K=100 of N=110 means the last ~10 picks each collide ~90% of the
    // time. Set-based algorithm grinds but completes; this test confirms
    // bounded latency.
    const t0 = performance.now();
    const result = sampleIndices(110, 100);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(result.length).toBe(100);
    expect(new Set(result).size).toBe(100);
  });

  test('large-N small-K (the design target) stays fast', () => {
    // 1000 samples from 2.25M — the worst-case spec from the design
    // sketch. Collision rate is trivial here; entire pick should
    // complete in single-digit ms on modern hardware.
    const t0 = performance.now();
    const result = sampleIndices(2_250_000, 1000);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(result.length).toBe(1000);
    expect(new Set(result).size).toBe(1000);
  });
});
