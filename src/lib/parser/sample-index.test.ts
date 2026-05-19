import { describe, expect, test } from 'vitest';
import { sampleByteIndex } from './sample-index';
import type { ByteIndexEntry } from './parser-types';

const range = (a: number, b: number) => ({ byteStart: a, byteEnd: b });

describe('sampleByteIndex', () => {
  test('empty input → empty output', () => {
    expect(sampleByteIndex([], new Map())).toEqual([]);
  });

  test('no arrays exceed threshold → identity (all entries kept)', () => {
    // 500 elements is below the default threshold of 1000.
    const arrayLengths = new Map([['$.things', 500]]);
    const entries: ByteIndexEntry[] = [
      ['$', range(0, 100)],
      ['$.things', range(10, 90)],
      ['$.things[0]', range(11, 20)],
      ['$.things[250]', range(40, 50)],
      ['$.things[499]', range(80, 90)],
    ];
    expect(sampleByteIndex(entries, arrayLengths)).toEqual(entries);
  });

  test('large array → only K divisible by N retained', () => {
    // 200 elements > threshold (default 1000)? No — set threshold low so we
    // exercise the sampling branch with a small fixture.
    const arrayLengths = new Map([['$.events', 200]]);
    const entries: ByteIndexEntry[] = [
      ['$.events[0]', range(0, 1)],
      ['$.events[1]', range(1, 2)],
      ['$.events[10]', range(10, 11)],
      ['$.events[100]', range(100, 101)],
      ['$.events[150]', range(150, 151)],
      ['$.events[199]', range(199, 200)],
    ];
    const kept = sampleByteIndex(entries, arrayLengths, {
      threshold: 100,
      n: 100,
    });
    expect(kept.map(([p]) => p)).toEqual([
      '$.events[0]',
      '$.events[100]',
    ]);
  });

  test('nested arrays: outermost K controls sampling; inner array kept', () => {
    // $.outer is 5000 elements (>threshold). $.outer[0].inner is small (5
    // elements). Sampling decides by the FIRST [K] in the path, which is
    // $.outer's K. Inner arrays come along for the ride.
    const arrayLengths = new Map([
      ['$.outer', 5000],
      ['$.outer[100].inner', 5],
    ]);
    const entries: ByteIndexEntry[] = [
      ['$.outer[0].inner[0]', range(0, 1)],
      ['$.outer[1].inner[2]', range(2, 3)],
      ['$.outer[100].inner[3]', range(100, 101)],
      ['$.outer[150].inner[0]', range(150, 151)],
    ];
    const kept = sampleByteIndex(entries, arrayLengths);
    expect(kept.map(([p]) => p)).toEqual([
      '$.outer[0].inner[0]',
      '$.outer[100].inner[3]',
    ]);
  });

  test('mixed: pure-object paths kept, array paths sampled', () => {
    const arrayLengths = new Map([['$.events', 2000]]);
    const entries: ByteIndexEntry[] = [
      ['$', range(0, 1000)],
      ['$.events', range(10, 990)],
      ['$.metadata', range(990, 999)],
      ['$.metadata.tag', range(991, 998)],
      ['$.events[0]', range(11, 50)],
      ['$.events[5]', range(60, 80)],
      ['$.events[100]', range(200, 220)],
    ];
    const kept = sampleByteIndex(entries, arrayLengths);
    const ids = kept.map(([p]) => p);
    // Pure-object/root paths: all kept.
    expect(ids).toContain('$');
    expect(ids).toContain('$.events');
    expect(ids).toContain('$.metadata');
    expect(ids).toContain('$.metadata.tag');
    // Array element paths: only K=0 and K=100 kept (K=5 dropped).
    expect(ids).toContain('$.events[0]');
    expect(ids).toContain('$.events[100]');
    expect(ids).not.toContain('$.events[5]');
  });

  test('does not mutate input array', () => {
    // Important for `parseStreaming`'s contract: callers may inspect the
    // returned ParseResult.byteIndex before sampling logic runs. Sampling
    // must produce a new array, not splice the original.
    const arrayLengths = new Map([['$.a', 2000]]);
    const entries: ByteIndexEntry[] = [
      ['$.a[0]', range(0, 1)],
      ['$.a[5]', range(5, 6)],
    ];
    const snapshot = [...entries];
    sampleByteIndex(entries, arrayLengths);
    expect(entries).toEqual(snapshot);
  });
});
