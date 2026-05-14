import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchUrl } from './fetchUrl';

type FetchMock = ReturnType<typeof vi.fn>;

function makeResponse(
  body: string,
  init: { status?: number; statusText?: string; headers?: Record<string, string>; url?: string } = {},
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

describe('fetchUrl', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  test('success: returns text + contentType + finalUrl + bytes', async () => {
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
    expect(result.text).toBe(body);
    expect(result.contentType).toBe('application/json');
    expect(result.finalUrl).toBe('https://example.com/data.json');
    expect(result.bytes).toBe(body.length);
  });

  test('rejects when Content-Length exceeds maxBytes', async () => {
    (globalThis.fetch as FetchMock).mockResolvedValue(
      makeResponse('', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(200 * 1024 * 1024),
        },
      }),
    );

    const result = await fetchUrl('https://example.com/big.json');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too-large');
    if (result.error.kind !== 'too-large') return;
    expect(result.error.contentLength).toBe(200 * 1024 * 1024);
    expect(result.error.max).toBe(100 * 1024 * 1024);
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
    expect(result.text).toBe(body);
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
    expect(result.text).toBe(body);
    // bytes falls back to JS string length when Content-Length is absent
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
    (globalThis.fetch as FetchMock).mockImplementation((_url: string, init: RequestInit) => {
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
    (globalThis.fetch as FetchMock).mockImplementation((_url: string, init: RequestInit) => {
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
