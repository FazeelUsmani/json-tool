// Baseline storage for the "Compare against working sample" flow
// (M2 slice A3, closing Slice A). Persists a single JSON document
// + metadata in localStorage so the user can save a known-good
// payload, load a new one, and ask "what changed since I saved?"
//
// Why localStorage (not IndexedDB or backend): MVP scope. localStorage
// is synchronous (simpler API), per-origin, persists across sessions,
// and a 5MB-per-origin cap is plenty for a single ~2MB JSON. Backend
// + multi-baseline + named baselines are post-customer-validation
// scope (would mean an account system, infra, ongoing cost — see
// PLAN_M2.md § Branch decisions). Single baseline = single key.
//
// Direction semantics (load-bearing — the UI labels MUST match):
// baseline = BEFORE (the "working sample" the user trusts), current
// document = AFTER ("what I'm checking"). diffTrees(baseline, current)
// reports added/removed/changed relative to current. "Removed in
// current" = drift (used to have it, no longer does).

const STORAGE_KEY = 'json-tool:diff-baseline:v1';

// Cap raw JSON text at 2 MB. localStorage's per-origin limit is
// ~5 MB but other features (theme, debug flags, future settings)
// share the budget. 2 MB raw JSON also corresponds to ~10 MB+ heap
// once parsed, which is the practical UX ceiling for diff anyway.
export const MAX_BASELINE_BYTES = 2_000_000;

export type Baseline = {
  // Raw JSON text — we don't store the parsed TreeNode because (a)
  // it would balloon localStorage usage and (b) parsing on read is
  // fast + lets us re-parse with current parser semantics if the
  // tree shape evolves.
  text: string;
  // Unix ms timestamp at save. Used by the UI for relative-time
  // display ("saved 5m ago").
  savedAt: number;
  // Byte size at save time. Stored to avoid recomputing on every UI
  // render — JS string length ≈ UTF-8 bytes for ASCII JSON anyway,
  // but the precomputed number is what the UI shows.
  bytes: number;
};

export type SaveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'too-large';
      size: number;
      limit: number;
    }
  | {
      ok: false;
      reason: 'storage-error';
      message: string;
    };

export function saveBaseline(text: string): SaveResult {
  const size = text.length;
  if (size > MAX_BASELINE_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      size,
      limit: MAX_BASELINE_BYTES,
    };
  }
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.setItem !== 'function'
  ) {
    // Belt-and-suspenders: vite-react-ssg's SSR environment defines
    // localStorage as a stub object without callable methods, so
    // typeof check alone isn't enough. Verify the method we need.
    return {
      ok: false,
      reason: 'storage-error',
      message: 'localStorage unavailable',
    };
  }
  try {
    const baseline: Baseline = { text, savedAt: Date.now(), bytes: size };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseline));
    return { ok: true };
  } catch (e) {
    // QuotaExceededError if localStorage is full. Surface the
    // browser-native message so users can diagnose.
    return {
      ok: false,
      reason: 'storage-error',
      message: e instanceof Error ? e.message : 'Unknown storage error',
    };
  }
}

export function loadBaseline(): Baseline | null {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.getItem !== 'function'
  ) {
    return null;
  }
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Baseline).text !== 'string' ||
      typeof (parsed as Baseline).savedAt !== 'number' ||
      typeof (parsed as Baseline).bytes !== 'number'
    ) {
      return null;
    }
    return parsed as Baseline;
  } catch {
    // Malformed JSON in storage — corruption, manual edit, schema
    // change from a future version, etc. Return null so the UI
    // falls back to no-baseline state. Don't clear here; let the
    // caller decide (they may want to re-save and overwrite).
    return null;
  }
}

export function clearBaseline(): void {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.removeItem !== 'function'
  ) {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage errors are non-fatal here — caller already cleared
    // their UI state; whether the storage row actually deleted
    // doesn't matter for next-load behavior (we'll just overwrite).
  }
}

// Relative-time formatter for the baseline status chip. Calibrated
// for "I saved this recently" UX rather than literary dates.
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const ms = now - timestamp;
  if (ms < 0) return 'just now'; // clock skew or test fixtures
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
