// Hardened URL fetcher for the `?url=` load handler.
//
// Constraints:
//   - client-side fetch only (no proxy)
//   - http: / https: only — `file:`, `data:`, `javascript:`, `blob:` all
//     rejected at the URL-parse boundary
//   - reject URLs carrying userinfo (`https://user:pass@host/`) — those
//     leak credentials to history / referrer / analytics scripts
//   - `credentials: 'omit'` + `referrerPolicy: 'no-referrer'` on every
//     fetch — no cookies, no token leaks via Referer
//   - byte cap enforced DURING the body stream, not just on
//     Content-Length. Servers that omit or lie about the header can no
//     longer force unbounded materialization (Mahira §2 Red Flag #3)
//   - allowlist application/json + JSON Lines variants + text/plain
//   - 30s timeout (composable with caller AbortSignal)
//   - HTTP errors mapped to typed result, not exceptions
//
// Returns a `Blob` rather than a string so the streaming parser (in the
// worker) can consume `blob.stream()` without the main thread ever
// materializing the full body as a JS string. For 500 MB JSON loads
// this is the difference between ~1.5 GB peak RSS (string + Blob +
// parsed) and ~500 MB peak (Blob only). The caller decides whether to
// decode for Monaco (`await blob.text()` for sub-10MB) or skip Monaco
// and route the Blob straight at the parser worker (viewer-only mode).
//
// Discriminated-union result: caller pattern-matches on `result.ok` then
// `result.error.kind`. No exceptions are thrown for *expected* failures
// (timeout, 404, too-large, invalid-protocol, etc.) — those are values.
// Exceptions escape only for genuine bugs.
//
// Redirect note: PLAN.MD calls for "max 3 redirects." Browser fetch cannot
// reliably limit redirects from client JS for cross-origin requests
// (`redirect: 'manual'` hides the Location header via CORS). We accept the
// browser default (~20-redirect cap) and surface the post-redirect URL via
// `finalUrl` so the caller can display "loaded from X" before parsing.

export type FetchUrlResult =
  | {
      ok: true;
      blob: Blob;
      contentType: string;
      finalUrl: string;
      bytes: number;
    }
  | { ok: false; error: FetchUrlError };

export type FetchUrlError =
  | { kind: 'invalid-url' }
  | { kind: 'invalid-protocol'; got: string }
  | { kind: 'userinfo-not-allowed' }
  | { kind: 'too-large'; contentLength: number; max: number }
  | { kind: 'unsupported-content-type'; got: string; allowed: readonly string[] }
  | { kind: 'timeout'; afterMs: number }
  | { kind: 'http'; status: number; statusText: string }
  | { kind: 'network'; cause: unknown };

export interface FetchUrlOptions {
  /** Max bytes to read from the response body before bailing. Default 500 MiB. */
  maxBytes?: number;
  /** Hard timeout. Default 30_000 (30s). */
  timeoutMs?: number;
  /** Content-Type allowlist (base type only; charset suffix is stripped before compare). */
  allowedContentTypes?: readonly string[];
  /** Caller-provided AbortSignal. Composed with the internal timeout. */
  signal?: AbortSignal;
}

// Matches the file-drop hero claim (500 MB ceiling in MonacoPane).
// The streaming Tokenizer.onToken parser consumes blob.stream() in the
// worker — no main-thread string materialization, so the cap can sit
// at the same level as local file drops.
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 MiB
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_CONTENT_TYPES: readonly string[] = [
  'application/json',
  'application/x-ndjson',
  'application/jsonlines',
  'text/plain',
];
const ALLOWED_PROTOCOLS: readonly string[] = ['http:', 'https:'];

export async function fetchUrl(
  url: string,
  opts: FetchUrlOptions = {},
): Promise<FetchUrlResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedContentTypes =
    opts.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;

  // (1) URL parse + protocol allowlist + userinfo rejection.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: { kind: 'invalid-url' } };
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      ok: false,
      error: { kind: 'invalid-protocol', got: parsed.protocol },
    };
  }
  // `new URL("https://user:pass@host/")` parses; we reject because the
  // userinfo would otherwise be sent in the Authorization header on
  // redirect, logged in browser history, and visible in the toolbar's
  // "Loaded from" chip. Same defense pattern as curl --proto-default.
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, error: { kind: 'userinfo-not-allowed' } };
  }

  // (2) Compose timeout with caller signal.
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const signal = combineSignals(
    opts.signal ? [opts.signal, timeoutController.signal] : [timeoutController.signal],
  );

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      // No cookies / Authorization tokens on cross-origin fetches.
      credentials: 'omit',
      // No Referer header — keeps signed/tokenized originating URLs
      // off the wire to third parties.
      referrerPolicy: 'no-referrer',
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (timedOut) {
      return { ok: false, error: { kind: 'timeout', afterMs: timeoutMs } };
    }
    return { ok: false, error: { kind: 'network', cause: err } };
  }

  // (3) HTTP status.
  if (!response.ok) {
    clearTimeout(timeoutHandle);
    return {
      ok: false,
      error: {
        kind: 'http',
        status: response.status,
        statusText: response.statusText,
      },
    };
  }

  // (4) Declared size fast-fail (Content-Length header). This is the
  // pre-stream check — it lets us reject without burning bandwidth on
  // a known-too-large response. The streaming loop below catches the
  // remaining case where the header lies or is absent.
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader != null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      clearTimeout(timeoutHandle);
      return {
        ok: false,
        error: { kind: 'too-large', contentLength, max: maxBytes },
      };
    }
  }

  // (5) Content-Type allowlist (case-insensitive, strip charset suffix).
  const contentTypeHeader = response.headers.get('content-type') ?? '';
  const contentTypeBase = contentTypeHeader.split(';')[0].trim().toLowerCase();
  const allowed = allowedContentTypes.some(
    (a) => a.toLowerCase() === contentTypeBase,
  );
  if (!allowed) {
    clearTimeout(timeoutHandle);
    return {
      ok: false,
      error: {
        kind: 'unsupported-content-type',
        got: contentTypeHeader,
        allowed: allowedContentTypes,
      },
    };
  }

  // (6) Stream the body, accumulating chunks into a Blob and enforcing
  // the byte cap during read. The cap is checked on each chunk so a
  // chunked / lying-Content-Length response cannot force unbounded
  // memory growth (Mahira §2 Red Flag #3). On overflow we cancel the
  // reader (releases the underlying stream) and return too-large with
  // the byte count we got to before bailing.
  if (response.body === null) {
    // Shouldn't happen for a real fetch — defensive for edge runtimes.
    clearTimeout(timeoutHandle);
    return { ok: false, error: { kind: 'network', cause: 'no body' } };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        // Release the underlying stream. We don't await — at this point
        // the result is decided; letting cancel run in the background is
        // fine and avoids a second await-roundtrip.
        void reader.cancel();
        clearTimeout(timeoutHandle);
        return {
          ok: false,
          error: { kind: 'too-large', contentLength: totalBytes, max: maxBytes },
        };
      }
      chunks.push(value);
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (timedOut) {
      return { ok: false, error: { kind: 'timeout', afterMs: timeoutMs } };
    }
    return { ok: false, error: { kind: 'network', cause: err } };
  }

  clearTimeout(timeoutHandle);

  // Construct the Blob from the accumulated chunks. Type is the server's
  // Content-Type so downstream `blob.type` reads cleanly; if absent we
  // leave it empty (matches new Blob() default). Cast through BlobPart[]
  // because TS strictness flags Uint8Array<ArrayBufferLike> vs the Blob
  // ctor's narrower Uint8Array<ArrayBuffer> expectation — runtime is fine.
  const blob = new Blob(
    chunks as unknown as BlobPart[],
    contentTypeHeader ? { type: contentTypeHeader } : {},
  );

  return {
    ok: true,
    blob,
    contentType: contentTypeHeader,
    finalUrl: response.url || url,
    // True byte count from the stream — no more TextEncoder fallback or
    // Content-Length trust.
    bytes: totalBytes,
  };
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  // Native AbortSignal.any (Node 20+, modern browsers).
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  // Fallback: wire each into a controller that aborts on the first trigger.
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), {
      once: true,
    });
  }
  return controller.signal;
}
