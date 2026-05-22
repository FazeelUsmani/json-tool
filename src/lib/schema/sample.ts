// Random sampling of array-index sets for schema inference.
//
// Use case: pick K random indices out of N array elements without
// allocating an N-element index buffer first (Fisher-Yates style).
// Critical at N ≫ K — sampling 1000 indices out of a 2.25M-element
// array via Fisher-Yates allocates 2.25M entries to discard 99.96%;
// the random-set approach below picks 1000 with ~0.04% collision per
// draw at that ratio, expected ≈0.22 total redraws across 1000 picks
// (sum_{i=0}^{K-1} i/(N-i) for K=1000, N=2.25M).
//
// When K >= N we walk all indices (no sampling needed); the branch
// also dodges the infinite loop the random-set algorithm would
// otherwise enter when collision rate hits 100%.
//
// Sampling is uniform random without replacement. Statistical
// properties match Fisher-Yates over the same domain — every
// K-element subset of [0..N) has equal probability of selection.

export function sampleIndices(n: number, k: number): number[] {
  if (n <= 0 || k <= 0) return [];
  if (k >= n) return rangeAll(n);
  const set = new Set<number>();
  while (set.size < k) {
    set.add(Math.floor(Math.random() * n));
  }
  return [...set];
}

export function rangeAll(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}
