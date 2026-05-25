// Lazy load of inline preview text for a row whose content lives in
// `sourceBlob` as a byte range (stub-object / stub-array preview ranges
// or an entire NDJSON line). Both StubRow and LineRow share the same
// data-loading shape; this hook factors out:
//
//   - synchronous cache lookup on initial mount (avoids one render
//     flash through `null` for re-mounted virtualized rows),
//   - derived-state-from-props reset when react-window recycles the
//     component slot for a different row.id,
//   - Promise-cache join so concurrent / re-mounted instances attach
//     to one in-flight Blob.slice().text() instead of duplicating it,
//   - rejection-cleanup so a failed read doesn't poison the cache.
//
// Two module-level WeakMaps keyed by `sourceBlob` so new file loads
// auto-GC the caches once the old Blob is unreferenced.

import { useEffect, useState } from 'react';

const previewCache = new WeakMap<Blob, Map<string, string>>();
const previewLoaders = new WeakMap<Blob, Map<string, Promise<string>>>();

function getCachedPreview(blob: Blob, id: string): string | undefined {
  return previewCache.get(blob)?.get(id);
}

function setCachedPreview(blob: Blob, id: string, text: string): void {
  let inner = previewCache.get(blob);
  if (!inner) {
    inner = new Map();
    previewCache.set(blob, inner);
  }
  inner.set(id, text);
}

function getLoader(blob: Blob, id: string): Promise<string> | undefined {
  return previewLoaders.get(blob)?.get(id);
}

function setLoader(blob: Blob, id: string, loader: Promise<string>): void {
  let inner = previewLoaders.get(blob);
  if (!inner) {
    inner = new Map();
    previewLoaders.set(blob, inner);
  }
  inner.set(id, loader);
}

function clearLoader(blob: Blob, id: string): void {
  const inner = previewLoaders.get(blob);
  if (!inner) return;
  inner.delete(id);
  if (inner.size === 0) previewLoaders.delete(blob);
}

export type PreviewRange = { byteStart: number; byteEnd: number };

/**
 * Lazy-load preview text for `rowId`'s byte range from `sourceBlob`.
 * Returns the decoded string once loaded, `null` while pending or when
 * `range === null` (caller signals "no preview to show").
 *
 * The caller owns the "what byte range to load" decision — including
 * clamping for max length, or returning `null` to skip the load
 * entirely. The hook owns caching, race protection, and lifecycle.
 */
export function useStubPreview(
  sourceBlob: Blob | null,
  rowId: string,
  range: PreviewRange | null,
): string | null {
  // Initial state: cache hit (instant render) or null (waiting on async).
  const [previewText, setPreviewText] = useState<string | null>(() =>
    sourceBlob ? (getCachedPreview(sourceBlob, rowId) ?? null) : null,
  );
  // Derived-state-from-props: react-window recycles instances; reset
  // synchronously on row.id change so the previous occupant's text
  // never reaches the DOM for one frame.
  const [prevRowId, setPrevRowId] = useState(rowId);
  if (prevRowId !== rowId) {
    setPrevRowId(rowId);
    setPreviewText(
      sourceBlob ? (getCachedPreview(sourceBlob, rowId) ?? null) : null,
    );
  }

  useEffect(() => {
    if (!sourceBlob || range === null) {
      setPreviewText(null);
      return;
    }
    const cached = getCachedPreview(sourceBlob, rowId);
    if (cached !== undefined) {
      setPreviewText(cached);
      return;
    }
    // Join an in-flight read for this row OR start a new one. Without
    // this, virtualization-recycled rows that re-mount before their
    // first read resolves would each kick off a duplicate slice and
    // the cancelled effect path would discard the result.
    let loader = getLoader(sourceBlob, rowId);
    if (loader === undefined) {
      loader = sourceBlob.slice(range.byteStart, range.byteEnd).text();
      setLoader(sourceBlob, rowId, loader);
    }
    let cancelled = false;
    loader
      .then((text) => {
        setCachedPreview(sourceBlob, rowId, text);
        clearLoader(sourceBlob, rowId);
        if (!cancelled) setPreviewText(text);
      })
      .catch(() => {
        // Drop the failed loader so a retry on next mount can start
        // fresh instead of re-awaiting a permanently-rejected Promise.
        clearLoader(sourceBlob, rowId);
      });
    return () => {
      cancelled = true;
    };
    // range is identity-stable when caller wraps with useMemo; otherwise
    // the byteStart/byteEnd will be the actual change driver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBlob, rowId, range?.byteStart, range?.byteEnd]);

  return previewText;
}
