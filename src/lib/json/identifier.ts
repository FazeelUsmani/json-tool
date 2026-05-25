// Shared identifier-safety check for any consumer that decides
// whether a JSON key can be used as a bare property name vs needing
// to be quoted. Used by:
//   - Schema emitters (TS / Zod / future formats) to choose between
//     `foo: T` and `"weird key": T` in generated output.
//   - Parser identity layer (parser/identity.ts) to choose between
//     `$.foo` and `$["weird key"]` in JSONPath display strings.
//
// Mirrors the JS identifier grammar: letter / `$` / `_` start, then
// letter / digit / `$` / `_`. Anything failing this gets quoted via
// JSON.stringify in the caller.
//
// Previously lived at src/lib/schema/identifier.ts; promoted here
// when the parser identity layer became the third consumer (matches
// the "extract on the third consumer" rule).

export function isSafeIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}
