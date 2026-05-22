// Thin wrapper around `jsonrepair` (the npm library) that decides
// up-front whether text actually NEEDS repair, vs whether it's already
// valid JSON that the user just happens to type unconventionally.
//
// Three discriminated-union outcomes:
//   - 'already-valid': text parses cleanly via JSON.parse. No dialog,
//     no repair attempt — `jsonrepair` would still cosmetically rewrite
//     valid input (whitespace normalization, quote style, etc.) and
//     the user would see a "repair this!" prompt that's actually
//     reformatting their already-correct code. False positive avoided.
//   - 'repaired': text didn't parse, but `jsonrepair` produced a valid
//     fix. Caller opens the diff dialog with `text` (before) + the
//     returned `repaired` string (after).
//   - 'unrepairable': text didn't parse AND `jsonrepair` threw. Caller
//     surfaces the library's error message in a toast — the library's
//     errors are line/col-tagged and actionable enough for the user
//     to fix manually.
//
// Validity is determined by `JSON.parse`, NOT by string equality with
// the repair output. This is the load-bearing correctness check —
// without it, valid-but-non-canonical JSON would incorrectly route
// to the "needs repair" branch.

import { jsonrepair } from 'jsonrepair';

export type RepairResult =
  | { kind: 'already-valid' }
  | { kind: 'repaired'; repaired: string }
  | { kind: 'unrepairable'; error: string };

export function repair(text: string): RepairResult {
  // (1) Already-valid check via JSON.parse. This is the only reliable
  //     signal — `jsonrepair`'s output diverging from input doesn't
  //     mean the input was broken.
  try {
    JSON.parse(text);
    return { kind: 'already-valid' };
  } catch {
    // Fall through.
  }

  // (2) Attempt repair. `jsonrepair` either returns a valid JSON string
  //     or throws with a structured error (line/col + message).
  try {
    const repaired = jsonrepair(text);
    return { kind: 'repaired', repaired };
  } catch (err) {
    return {
      kind: 'unrepairable',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
