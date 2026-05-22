// Shared identifier-safety check for TS / Zod / future emitters that
// need to decide whether a JSON key can be used as a bare property
// name. Mirrors the JS identifier grammar (letter/$/_ start, then
// letter/digit/$/_). Anything failing this gets quoted via JSON.stringify
// in the caller.

export function isSafeIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}
