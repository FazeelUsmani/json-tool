// Inline preview helpers for closed composites. Generates short, single-
// line summaries from already-materialized children: the same visual
// shape StubRow shows from sourceBlob slices, but for nodes that are
// fully in memory (root + spine composites, or stubs that have been
// expanded). Nested composites collapse to `{…}` / `[…]` so the
// preview stays one line; CSS truncate handles overflow on long values.

import type { TreeNode } from './parse';

type CompositeNode = Extract<TreeNode, { kind: 'object' | 'array' }>;

// Cap matches StubRow's three-element capture so the two rendering
// paths produce consistent-looking output for the same data.
export const PREVIEW_CHILD_LIMIT = 3;

/**
 * First up-to-3 children rendered as compact JSON-ish fragments,
 * comma-joined. For object nodes each fragment is `"key":value`; for
 * arrays just `value`. Nested composites collapse to `{…}` / `[…]`
 * rather than recursing.
 */
export function previewFromChildren(node: CompositeNode): string {
  const isObj = node.kind === 'object';
  const limit = Math.min(node.children.length, PREVIEW_CHILD_LIMIT);
  const parts: string[] = [];
  for (let i = 0; i < limit; i++) {
    const c = node.children[i];
    parts.push(
      isObj ? `"${c.key}":${previewChildValue(c)}` : previewChildValue(c),
    );
  }
  return parts.join(', ');
}

/** Compact one-token-per-value rendering used inside previews. */
export function previewChildValue(node: TreeNode): string {
  switch (node.kind) {
    case 'string':
      return JSON.stringify(node.value);
    case 'number':
    case 'boolean':
      return String(node.value);
    case 'null':
      return 'null';
    case 'object':
    case 'stub-object':
      return '{…}';
    case 'array':
    case 'stub-array':
      return '[…]';
  }
}
