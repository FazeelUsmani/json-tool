import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENCODED_LIMIT,
  decodeShareHash,
  encodeForShare,
} from './share';

describe('encodeForShare → decodeShareHash round-trip', () => {
  it('round-trips a small JSON object exactly', () => {
    const input = JSON.stringify({ hello: 'world', n: 42, nested: [1, 2, 3] });
    const encoded = encodeForShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.hash.startsWith('#json=')).toBe(true);

    const decoded = decodeShareHash(encoded.hash);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.text).toBe(input);
  });

  it('round-trips multi-byte UTF-8 (emoji, CJK)', () => {
    const input = JSON.stringify({ greeting: '你好世界 🌍', author: 'café' });
    const encoded = encodeForShare(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeShareHash(encoded.hash);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.text).toBe(input);
  });

  it('rawBytes counts UTF-8 byte length, not character count', () => {
    // 4-char ASCII string → 4 bytes.
    const ascii = encodeForShare('"hi!"');
    expect(ascii.ok).toBe(true);
    if (!ascii.ok) return;
    expect(ascii.rawBytes).toBe(5);

    // Emoji (4-byte UTF-8) inside JSON string.
    const emoji = encodeForShare('"🌍"');
    expect(emoji.ok).toBe(true);
    if (!emoji.ok) return;
    // `"` + 4 bytes for 🌍 + `"` = 6.
    expect(emoji.rawBytes).toBe(6);
  });
});

describe('encodeForShare oversize guard', () => {
  it('rejects payload whose encoded length exceeds the configured limit', () => {
    // Use a small explicit limit so a small input crosses it — avoids
    // having to defeat lz-string's compression with a pathological
    // payload (which is brittle anyway since lz-string handles even
    // moderate randomness well).
    const json = JSON.stringify({ payload: 'x'.repeat(500) });
    const result = encodeForShare(json, { encodedLimit: 20 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('too-large');
    expect(result.encodedChars).toBeGreaterThan(20);
    expect(result.limit).toBe(20);
    expect(result.rawBytes).toBeGreaterThan(500);
  });

  it('DEFAULT_ENCODED_LIMIT is sized to fit under 8 KB URL ceiling', () => {
    // Sanity: the default should leave ~500 chars of headroom for
    // origin + path + `#json=` prefix (typical 30-80 chars in prod).
    expect(DEFAULT_ENCODED_LIMIT).toBeLessThan(8000);
    expect(DEFAULT_ENCODED_LIMIT).toBeGreaterThan(7000);
  });

  it('accepts a higher explicit limit', () => {
    let medium = '';
    for (let i = 0; i < 10000; i++) {
      medium += String.fromCharCode(33 + (i % 90));
    }
    const json = JSON.stringify(medium);
    const tight = encodeForShare(json, { encodedLimit: 1000 });
    expect(tight.ok).toBe(false);

    const loose = encodeForShare(json, { encodedLimit: 100_000 });
    expect(loose.ok).toBe(true);
  });

  it('compresses repetitive JSON well — large repetitive payload still under limit', () => {
    // 30 KB of highly compressible JSON should fit comfortably.
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      type: 'event',
      status: 'ok',
    }));
    const json = JSON.stringify(items);
    expect(json.length).toBeGreaterThan(20_000);
    const result = encodeForShare(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.encodedChars).toBeLessThan(DEFAULT_ENCODED_LIMIT);
  });
});

describe('decodeShareHash error paths', () => {
  it('rejects hash without #json= prefix', () => {
    expect(decodeShareHash('#url=foo').ok).toBe(false);
    expect(decodeShareHash('json=foo').ok).toBe(false); // missing `#` is ok but missing key isn't
    expect(decodeShareHash('').ok).toBe(false);
    const r = decodeShareHash('#other=xyz');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-hash');
  });

  it('rejects empty payload', () => {
    const r = decodeShareHash('#json=');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('rejects corrupted encoded payload', () => {
    const r = decodeShareHash('#json=this-is-not-valid-lz-string-output-!!!');
    // lz-string returns null on malformed input → we surface as
    // 'invalid' rather than throwing.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('accepts hash without leading #', () => {
    const encoded = encodeForShare('{"x":1}');
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const stripped = encoded.hash.slice(1); // drop leading `#`
    const decoded = decodeShareHash(stripped);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.text).toBe('{"x":1}');
  });
});
