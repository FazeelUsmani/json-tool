// Worker boundary tests for the parser worker — exercise searchStubs
// batching + abort without spinning up a real Worker.
//
// Pattern: vi.mock Comlink before the import, then call the exported
// `api` object directly. The algorithm itself is independent of the
// Worker postMessage boundary; testing it at this layer pins the
// batching / abort contract without the brittleness of real worker
// integration tests.

import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('comlink', () => ({
  expose: vi.fn(),
}));

import { api } from './parser.worker';

function makeBlob(text: string): Blob {
  return new Blob([text], { type: 'text/plain' });
}

// Range covering an entire string fixture. Used to drive searchStubs
// against a single-blob input where every range maps to a slice.
function ranges(
  byteStarts: number[],
  rangeLen: number,
): { id: string; byteStart: number; byteEnd: number }[] {
  return byteStarts.map((start, i) => ({
    id: `/r${i}`,
    byteStart: start,
    byteEnd: start + rangeLen,
  }));
}

describe('parser.worker — searchStubs', () => {
  beforeEach(() => {
    // Reset the module-level abort flag between tests. searchStubs
    // recreates it at entry so explicit reset isn't strictly needed,
    // but keeps test order independence airtight.
    api.abortSearch();
  });

  test('matches across ranges and posts a terminal batch', async () => {
    // Five 16-byte ranges. Range 1 + range 3 contain "needle"; the
    // other three don't. Expect onBatch to be called at least once,
    // with the terminal call including scanned === total.
    const text = ''.padEnd(80, 'x');
    const withNeedle = text.slice(0, 16) + 'needleAB' + 'cdefghij' +
      text.slice(32, 48) + 'needleAB' + 'klmnopqr' + text.slice(64);
    // Construct ranges so r1 and r3 cover the needle locations.
    const rs = ranges([0, 16, 32, 48, 64], 16);
    const calls: Array<{ batch: { id: string }[]; scanned: number }> = [];
    await api.searchStubs(makeBlob(withNeedle), rs, 'needle', (batch, scanned) =>
      calls.push({ batch: [...batch], scanned }),
    );
    // Terminal tick fires at scanned === ranges.length.
    const terminal = calls[calls.length - 1];
    expect(terminal.scanned).toBe(rs.length);
    // The two matching ids should appear across all batches combined.
    const matchedIds = calls.flatMap((c) => c.batch.map((b) => b.id));
    expect(matchedIds).toContain('/r1');
    expect(matchedIds).toContain('/r3');
    expect(matchedIds).not.toContain('/r0');
  });

  test('empty needle returns without firing onBatch', async () => {
    const onBatch = vi.fn();
    await api.searchStubs(makeBlob('content'), ranges([0], 7), '', onBatch);
    expect(onBatch).not.toHaveBeenCalled();
  });

  test('empty ranges returns without firing onBatch', async () => {
    const onBatch = vi.fn();
    await api.searchStubs(makeBlob('content'), [], 'x', onBatch);
    expect(onBatch).not.toHaveBeenCalled();
  });

  test('case-insensitive: NEEDLE in haystack matches "needle" query', async () => {
    // ASCII lowercase is applied in-place to the buffer; haystack
    // can be mixed case.
    const text = 'xx NEEDLE yy';
    const rs = ranges([0], text.length);
    const calls: Array<{ batch: { id: string }[]; scanned: number }> = [];
    await api.searchStubs(makeBlob(text), rs, 'needle', (batch, scanned) =>
      calls.push({ batch: [...batch], scanned }),
    );
    const matchedIds = calls.flatMap((c) => c.batch.map((b) => b.id));
    expect(matchedIds).toContain('/r0');
  });

  test('abortSearch mid-flight stops further batches', async () => {
    // To exercise the abort path we need onBatch to actually fire
    // mid-loop, which only happens when batch.length >= BATCH_SIZE
    // (2000). Construct a haystack with 2500 ranges that each match,
    // so a batch overflows around iteration 2000; the onBatch callback
    // sets abort, and the next ABORT_CHECK_EVERY=256 boundary returns.
    // Resulting `scanned` should be well under 2500.
    const NEEDLE = 'NEEDLE!!';
    const text = NEEDLE.repeat(2500); // 2500 × 8 chars = 20000 bytes
    const rs: { id: string; byteStart: number; byteEnd: number }[] = [];
    for (let i = 0; i < 2500; i++) {
      rs.push({ id: `/r${i}`, byteStart: i * 8, byteEnd: (i + 1) * 8 });
    }
    const calls: Array<{ scanned: number }> = [];
    let aborted = false;
    const onBatch = (_batch: { id: string }[], scanned: number) => {
      calls.push({ scanned });
      if (!aborted) {
        api.abortSearch();
        aborted = true;
      }
    };
    await api.searchStubs(makeBlob(text), rs, 'needle', onBatch);
    // At least one batch fired (the one that triggered our abort).
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // No terminal tick at full range count — abort prevents it.
    const lastScanned = calls[calls.length - 1].scanned;
    expect(lastScanned).toBeLessThan(rs.length);
  });
});
