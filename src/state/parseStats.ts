// Shared writeback for parse-time telemetry. Two paths produce parse
// stats — `parserHost.parseFile` (JSON streaming via worker) and
// `parseNdjson` (main-thread, dispatched from TreeView when format
// detection says NDJSON) — and the HUD wants to surface either
// uniformly. This module owns the state; both writers call
// `recordParseStats` on completion. Keeping the store outside
// parserHost avoids inverting the layer ordering (TreeView wraps
// parseNdjson and can't import parserHost internals to write).
//
// Module-level singletons are fine here: there's only one document at
// a time, and the HUD reads via a getter on each ~100ms tick, so we
// don't need React state semantics for this.

export type LastParseStats = {
  ms: number;
  bytes: number;
  mbPerSec: number;
  completedAt: number;
};

let lastParseStats: LastParseStats | null = null;
let parseInFlight = false;

export function getLastParseStats(): LastParseStats | null {
  return lastParseStats;
}

export function isParsing(): boolean {
  return parseInFlight;
}

export function setParseInFlight(value: boolean): void {
  parseInFlight = value;
}

export function recordParseStats(stats: LastParseStats): void {
  lastParseStats = stats;
}
