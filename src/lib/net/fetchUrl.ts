// Hardened URL fetcher for the `?url=` load handler.
//
// Constraints (PLAN.MD W1 Tue):
//   - client-side fetch only (no proxy)
//   - reject Content-Length > 100 MiB
//   - allowlist application/json + text/plain
//   - 30s timeout (composable with caller AbortSignal)
//   - HTTP errors mapped to typed result, not exceptions
//
// Discriminated-union result: caller pattern-matches on `result.ok` then
// `result.error.kind`. No exceptions are thrown for *expected* failures
// (timeout, 404, too-large, etc.) — those are values. Exceptions escape only
// for genuine bugs.
//
// Redirect note: PLAN.MD calls for "max 3 redirects." Browser fetch cannot
// reliably limit redirects from client JS for cross-origin requests
// (`redirect: 'manual'` hides the Location header via CORS). We accept the
// browser default (~20-redirect cap) and surface the post-redirect URL via
// `finalUrl` so the caller can display "loaded from X" before parsing.

export type FetchUrlResult =
  | {
      ok: true;
      text: string;
      contentType: string;
      finalUrl: string;
      bytes: number;
    }
  | { ok: false; error: FetchUrlError };

export type FetchUrlError =
  | { kind: 'invalid-url' }
  | { kind: 'too-large'; contentLength: number; max: number }
  | { kind: 'unsupported-content-type'; got: string; allowed: readonly string[] }
  | { kind: 'timeout'; afterMs: number }
  | { kind: 'http'; status: number; statusText: string }
  | { kind: 'network'; cause: unknown };

export interface FetchUrlOptions {
  /** Max declared Content-Length to accept. Default 100 MiB. */
  maxBytes?: number;
  /** Hard timeout. Default 30_000 (30s). */
  timeoutMs?: number;
  /** Content-Type allowlist (base type only; charset suffix is stripped before compare). */
  allowedContentTypes?: readonly string[];
  /** Caller-provided AbortSignal. Composed with the internal timeout. */
  signal?: AbortSignal;
}

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MiB
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_CONTENT_TYPES: readonly string[] = [
  'application/json',
  'text/plain',
];

export async function fetchUrl(
  url: string,
  opts: FetchUrlOptions = {},
): Promise<FetchUrlResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedContentTypes =
    opts.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;

  // (1) URL parse — rejects "not a url" before we touch fetch.
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return { ok: false, error: { kind: 'invalid-url' } };
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
    response = await fetch(url, { signal });
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

  // (4) Declared size check (Content-Length header).
  // TODO(W2/W3): enforce maxBytes during stream consumption for
  // chunked / no-Content-Length responses. Currently a server can omit the
  // header (or lie about it) and we would download the full body before
  // noticing. Acceptable for M1 because the typical bad case is a slow load,
  // not a memory blow-up — but harden before launch.
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

  // (6) Read body.
  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (timedOut) {
      return { ok: false, error: { kind: 'timeout', afterMs: timeoutMs } };
    }
    return { ok: false, error: { kind: 'network', cause: err } };
  }

  clearTimeout(timeoutHandle);

  // `bytes` is the server-declared length when available, falling back to JS
  // string length (UTF-16 code units, not strict UTF-8 bytes). Good enough for
  // UI display; if the caller needs exact byte count they can run TextEncoder.
  const declared = contentLengthHeader != null ? Number(contentLengthHeader) : NaN;
  const bytes = Number.isFinite(declared) ? declared : text.length;

  return {
    ok: true,
    text,
    contentType: contentTypeHeader,
    finalUrl: response.url || url,
    bytes,
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
