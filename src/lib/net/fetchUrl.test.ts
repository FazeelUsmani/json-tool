import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { fetchUrl } from './fetchUrl';

// Typed to fetch's signature so mockImplementation accepts the
// Promise<Response>-returning callbacks below — without the explicit
// type parameter the strict-typed lint rule no-misused-promises fires
// (default vi.fn return type is void).
type FetchMock = Mock<typeof globalThis.fetch>;

function makeResponse(
  body: BodyInit | null,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Response {
  const res = new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: init.headers,
  });
  if (init.url) {
    Object.defineProperty(res, 'url', { value: init.url });
  }
  return res;
}

// Build a Response whose body is a streamed sequence of byte chunks.
// Used to exercise the streaming byte-cap and chunked-without-CL paths.
function makeStreamingResponse(
  chunks: Uint8Array[],
  init: {
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return makeResponse(stream, init);
}

describe('fetchUrl', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  test('success: returns blob + contentType + finalUrl + bytes', async () => {
    const body = '{"hello":"world"}';
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse(body, {
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
        url: 'https://example.com/data.json',
      }),
    );

    const result = await fetchUrl('https://example.com/data.json');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.blob.text()).toBe(body);
    expect(result.contentType).toBe('application/json');
    expect(result.finalUrl).toBe('https://example.com/data.json');
    expect(result.bytes).toBe(body.length);
    expect(result.blob.type).toBe('application/json');
  });

  test('rejects when Content-Length exceeds maxBytes', async () => {
    // Default cap is 500 MiB; declared 600 MiB triggers the pre-stream
    // fast-fail without ever reading the body.
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse('', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(600 * 1024 * 1024),
        },
      }),
    );

    const result = await fetchUrl('https://example.com/big.json');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too-large');
    if (result.error.kind !== 'too-large') return;
    expect(result.error.contentLength).toBe(600 * 1024 * 1024);
    expect(result.error.max).toBe(500 * 1024 * 1024);
  });

  test('streaming cap rejects bodies past maxBytes when Content-Length is absent or lies', async () => {
    // Server claims small (or omits CL) but actually streams more than
    // maxBytes. The pre-stream check passes; the in-loop check must
    // fire and cancel the reader. Without this guard, the prior
    // implementation would await response.text() and materialize the
    // whole body before noticing.
    const chunk = new Uint8Array(64); // 64 bytes per chunk
    chunk.fill(0x20); // ' ' — well-formed UTF-8 to keep content-type happy
    const chunks: Uint8Array[] = [];
    // 6 chunks × 64 bytes = 384 bytes total against a 256-byte cap.
    for (let i = 0; i < 6; i++) chunks.push(chunk);
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeStreamingResponse(chunks, {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchUrl('https://example.com/sneaky.json', {
      maxBytes: 256,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too-large');
    if (result.error.kind !== 'too-large') return;
    // contentLength here is the running total at the point we bailed —
    // at least maxBytes + 1, never the full would-be total.
    expect(result.error.contentLength).toBeGreaterThan(256);
    expect(result.error.max).toBe(256);
  });

  test('rejects disallowed content-type', async () => {
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse('<html></html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );

    const result = await fetchUrl('https://example.com/page.html');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unsupported-content-type');
    if (result.error.kind !== 'unsupported-content-type') return;
    expect(result.error.got).toBe('text/html');
  });

  test('accepts application/json with charset suffix', async () => {
    const body = '{"ok":true}';
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse(body, {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    const result = await fetchUrl('https://example.com/data.json');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.blob.text()).toBe(body);
    expect(result.contentType).toBe('application/json; charset=utf-8');
  });

  test('missing Content-Length still succeeds (chunked transfer common)', async () => {
    const body = '{"chunked":true}';
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse(body, {
        headers: { 'content-type': 'application/json' }, // no content-length
      }),
    );

    const result = await fetchUrl('https://example.com/stream.json');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.blob.text()).toBe(body);
    // bytes is the actual streamed byte count now, not a fallback.
    expect(result.bytes).toBe(body.length);
  });

  test('HTTP 404 returns { kind: http }', async () => {
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse('not found', { status: 404, statusText: 'Not Found' }),
    );

    const result = await fetchUrl('https://example.com/missing.json');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('http');
    if (result.error.kind !== 'http') return;
    expect(result.error.status).toBe(404);
    expect(result.error.statusText).toBe('Not Found');
  });

  test('times out after timeoutMs', async () => {
    vi.useFakeTimers();
    (globalThis.fetch as FetchMock).mockImplementation((_url, init) => {
      if (!init) throw new Error('test: fetch called without init');
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const promise = fetchUrl('https://example.com/slow.json', { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('timeout');
    if (result.error.kind !== 'timeout') return;
    expect(result.error.afterMs).toBe(5000);
  });

  test('invalid URL string returns { kind: invalid-url }', async () => {
    const result = await fetchUrl('not a url');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-url');
    // fetch should never have been called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('caller AbortSignal aborts mid-flight → network error', async () => {
    (globalThis.fetch as FetchMock).mockImplementation((_url, init) => {
      if (!init) throw new Error('test: fetch called without init');
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const controller = new AbortController();
    const promise = fetchUrl('https://example.com/slow.json', {
      signal: controller.signal,
    });
    controller.abort();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Caller-initiated abort: surfaces as 'network' (not 'timeout', since the
    // internal timer didn't fire). The cause field carries the AbortError.
    expect(result.error.kind).toBe('network');
  });
});

describe('fetchUrl — security hardening', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('rejects non-http(s) protocols without calling fetch', async () => {
    const cases: Array<[string, string]> = [
      ['file:///etc/passwd', 'file:'],
      ['data:application/json,{"x":1}', 'data:'],
      ['javascript:alert(1)', 'javascript:'],
      ['blob:https://example.com/abc', 'blob:'],
      ['ftp://example.com/foo.json', 'ftp:'],
    ];
    for (const [url, expectedProtocol] of cases) {
      const result = await fetchUrl(url);
      expect(result.ok, `expected reject for ${url}`).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe('invalid-protocol');
      if (result.error.kind !== 'invalid-protocol') continue;
      expect(result.error.got).toBe(expectedProtocol);
    }
    // Fetch must never have been called for any of the above.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('rejects URLs with userinfo (https://user:pass@host/)', async () => {
    const result = await fetchUrl(
      'https://alice:secret@example.com/data.json',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('userinfo-not-allowed');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('rejects URLs with just username (no password)', async () => {
    const result = await fetchUrl('https://alice@example.com/data.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('userinfo-not-allowed');
  });

  test('fetch is called with credentials:omit + referrerPolicy:no-referrer', async () => {
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse('{}', {
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchUrl('https://example.com/data.json');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const init = (globalThis.fetch as FetchMock).mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
  });
});
