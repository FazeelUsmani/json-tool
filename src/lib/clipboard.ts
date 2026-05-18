// Thin wrapper around navigator.clipboard.writeText. Returns a boolean so
// the caller decides which toast to fire — keeps sonner imports out of this
// layer.
//
// No execCommand fallback: CF Pages ships HTTPS by default, localhost works,
// and execCommand is deprecated. If the API is unavailable we fail loud
// (caller fires an error toast).

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
