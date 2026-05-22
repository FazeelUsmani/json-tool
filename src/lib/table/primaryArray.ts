// Find the "primary array" to display in the table view, given a
// document root. Three cases:
//
//   - Root is an array         → use the root itself, path "$"
//   - Root is an object whose
//     children include arrays  → use the largest array child,
//                                 path "$.{key}"
//   - Anything else            → no primary array (table disabled)
//
// "Largest" means most children. Heuristic: in real-world JSON
// (`{"events": [100k]}`, `{"users": [10k], "metadata": {...}}`) the
// meaningful data is almost always the biggest array nested under
// the root object. Tie-breaking by first-encountered when sizes
// match.
//
// Originally M1 scoped to root-array-only, but the most common JSON
// shape in the wild is the wrapped-array (LLM outputs, API responses,
// telemetry exports — all `{"events": [...]}` or similar). The
// design's "M1 deferred: multi-array support" was a simplification
// that didn't survive the first real fixture test; the wrapped-array
// case is the practical default, not a stretch.

import type { TreeNode } from '@/lib/tree/parse';

type ArrayNode = Extract<TreeNode, { kind: 'array' }>;

export type PrimaryArrayResult = {
  node: ArrayNode;
  // JSONPath-style locator: "$" for root, "$.<key>" for a child of a
  // root object. Surfaced in the table UI so users see which array
  // they're looking at when the root is wrapped.
  path: string;
};

export function findPrimaryArray(
  root: TreeNode | null,
): PrimaryArrayResult | null {
  if (root === null) return null;
  if (root.kind === 'array') {
    return { node: root, path: '$' };
  }
  if (root.kind !== 'object') return null;

  let best: { node: ArrayNode; key: string; count: number } | null = null;
  for (const child of root.children) {
    if (child.kind !== 'array' || child.key === null) continue;
    const count = child.children.length;
    if (best === null || count > best.count) {
      best = { node: child, key: child.key, count };
    }
  }
  if (best === null) return null;
  return { node: best.node, path: `$.${best.key}` };
}
