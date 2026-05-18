import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyText } from './clipboard';

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('returns true and forwards the text to navigator.clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ok = await copyText('$.users[0]');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('$.users[0]');
  });

  test('returns false when navigator.clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyText('x')).toBe(false);
  });

  test('returns false when writeText rejects (permission denied, etc.)', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    expect(await copyText('x')).toBe(false);
  });
});
