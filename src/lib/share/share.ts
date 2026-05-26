// Share-link encode/decode. Compresses the user's JSON text with
// lz-string's URL-safe variant and produces a `#json=<encoded>` hash
// the existing load-on-mount flow can consume.
//
// Why hash (not query): the fragment never reaches the server, never
// touches edge proxies / CDN access logs, and isn't read by deferred
// analytics scripts. Matches the "we never see your data" privacy
// claim symmetrically — the sender's bytes go straight into the
// recipient's address bar with no intermediary.
//
// Why lz-string `compressToEncodedURIComponent`: URL-safe out of the
// box (no manual `encodeURIComponent` wrap), ~5× compression on
// typical JSON, synchronous (no worker needed), 4 KB lib weight.
//
// Why an encoded-char ceiling, not a raw-byte ceiling: the limiting
// factor is URL length, not JSON size. Chrome's address bar accepts
// ~32K but edge proxies (Cloudflare, nginx defaults) drop ≥ 8K.
// DEFAULT_ENCODED_LIMIT = 7500 keeps the full URL safely under 8K
// even with a long origin + path prefix. Whether that compresses
// from 10 KB or 40 KB of raw JSON depends on entropy — we report
// both numbers so the UI can show "x KB → y KB encoded" to the user.

// Default-import + destructure rather than named import: lz-string
// ships as a CommonJS module (no proper "exports" map), and Node's
// native ESM (used by vite-react-ssg's SSR build pass) refuses
// `import { x } from 'cjs-module'`. Vite's client bundler is more
// forgiving, but the SSG pass evaluates this module too because
// useShareHashLoad is mounted in App.tsx. Default-import works in
// both — Node treats the whole CJS export object as the default.
import lzString from 'lz-string';
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } =
  lzString;

export const DEFAULT_ENCODED_LIMIT = 7500;

export type EncodeResult =
  | {
      ok: true;
      hash: string;
      rawBytes: number;
      encodedChars: number;
    }
  | {
      ok: false;
      reason: 'too-large';
      rawBytes: number;
      encodedChars: number;
      limit: number;
    };

export type DecodeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no-hash' | 'invalid' };

export function encodeForShare(
  text: string,
  options: { encodedLimit?: number } = {},
): EncodeResult {
  const encodedLimit = options.encodedLimit ?? DEFAULT_ENCODED_LIMIT;
  const encoded = compressToEncodedURIComponent(text);
  const rawBytes = new Blob([text]).size;
  const encodedChars = encoded.length;
  if (encodedChars > encodedLimit) {
    return {
      ok: false,
      reason: 'too-large',
      rawBytes,
      encodedChars,
      limit: encodedLimit,
    };
  }
  return {
    ok: true,
    hash: `#json=${encoded}`,
    rawBytes,
    encodedChars,
  };
}

export function decodeShareHash(hash: string): DecodeResult {
  // Accept hash with or without leading `#` so callers can pass
  // `window.location.hash` directly or a hash-stripped fragment.
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!stripped.startsWith('json=')) {
    return { ok: false, reason: 'no-hash' };
  }
  const encoded = stripped.slice('json='.length);
  if (encoded === '') {
    return { ok: false, reason: 'invalid' };
  }
  // decompressFromEncodedURIComponent returns null on malformed input,
  // empty string for an empty payload. We treat both as 'invalid' —
  // a successful share can't have an empty document anyway.
  const text = decompressFromEncodedURIComponent(encoded);
  if (text === null || text === '') {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, text };
}
