// Node identity helpers for the parser. Maintains two parallel
// strings on every TreeNode and FlatRow:
//
//   - `id` (JSON Pointer per RFC 6901): used as the key for every
//     Set / Map / WeakMap that tracks node identity — collapse
//     state, expandingIds, stubSearchMatches, splice targeting,
//     stub-preview cache, row-materialization cache. Collision-safe
//     under all JSON key shapes including dots, brackets, slashes,
//     and tildes (the only chars that need escaping).
//
//   - `path` (JSONPath): used purely for display — breadcrumb, copy-
//     to-clipboard, drawer title, "Showing $.events" chip. Reads the
//     way developers expect (`$.events[42].user.id`). Bracket-quotes
//     keys that can't be used as bare identifiers.
//
// Why the split: prior identity scheme reused JSONPath as both id and
// display. That collapsed `{"a.b": 1}` and `{a: {b: 1}}` into the
// same `$.a.b` string — every Set / WeakMap that keyed off path
// would conflate them, breaking collapse state, search match
// dedup, splice targeting, and cache lookups. The parallel-fields
// design fixes the correctness gap without changing what users see.
//
// Root: id = "" (RFC 6901 root), path = "$" (JSONPath root).
//
// Duplicate-key safety (`{"x": 1, "x": 2}`) is NOT addressed here —
// both children would still produce id `/x`. RFC 6901 doesn't
// describe this case and resolving it requires source-byte tracking
// the parser doesn't currently retain. M2 fix; documented for
// future-us. Rare in practice (JSON spec permits but most producers
// don't emit duplicate keys).

import { isSafeIdentifier } from '@/lib/json/identifier';

export const ROOT_ID = '';
export const ROOT_PATH = '$';

// Build a JSON Pointer child segment from a key. Numbers (array
// indices) pass through as decimal; strings escape ~ → ~0 and
// / → ~1 per RFC 6901.
export function pointerSegment(key: string | number): string {
  if (typeof key === 'number') return String(key);
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

// Append a child segment to a parent JSON Pointer.
export function appendPointer(
  parentId: string,
  key: string | number,
): string {
  return `${parentId}/${pointerSegment(key)}`;
}

// Append a child segment to a parent JSONPath display string.
// Array indices use bracket notation: `$.events[42]`. Object keys
// use dot notation when the key is a safe identifier, otherwise
// bracket-quote it: `$["weird.key"]`.
export function appendDisplayPath(
  parentPath: string,
  key: string | number,
): string {
  if (typeof key === 'number') return `${parentPath}[${key}]`;
  if (isSafeIdentifier(key)) return `${parentPath}.${key}`;
  return `${parentPath}[${JSON.stringify(key)}]`;
}
