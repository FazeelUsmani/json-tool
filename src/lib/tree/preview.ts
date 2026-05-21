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

/**
 * Compact one-token-per-value rendering used inside previews.
 *
 * Arrays recurse one level: `[1, 2, 3]` stays itself, `[{…}, {…}]`
 * becomes `[{"id":0}, {"id":1}]` (first key of each element shown).
 * Objects at depth 0 stay as `{…}` so previewFromChildren on a top-
 * level object doesn't blow up into nested content — only array
 * elements get the deeper rendering, which matches the user's
 * specific ask (the most common pain point: looking at an array of
 * 900K identical-looking event objects).
 *
 * Hard ceiling at depth 2: even pathologically nested arrays render
 * `[…]` past the first descent. Keeps the preview a single visual
 * line.
 */
export function previewChildValue(node: TreeNode): string {
  return renderValue(node, 0);
}

function renderValue(node: TreeNode, depth: number): string {
  switch (node.kind) {
    case 'string':
      return JSON.stringify(node.value);
    case 'number':
    case 'boolean':
      return String(node.value);
    case 'null':
      return 'null';
    case 'object':
      // depth 0 (top-level value inside a parent's preview): shorthand.
      // depth 1 (inside an array we descended into): show first KV pair.
      // depth >= 2: shorthand again.
      if (depth !== 1 || node.children.length === 0) return '{…}';
      {
        const c = node.children[0];
        const more = node.children.length > 1 ? ', …' : '';
        return `{"${c.key}":${renderValue(c, depth + 1)}${more}}`;
      }
    case 'stub-object':
      return '{…}';
    case 'array':
      // depth 0: descend into the first up-to-3 elements.
      // depth >= 1: shorthand (avoid runaway nesting).
      if (depth >= 1 || node.children.length === 0) return '[…]';
      {
        const limit = Math.min(PREVIEW_CHILD_LIMIT, node.children.length);
        const parts: string[] = [];
        for (let i = 0; i < limit; i++) {
          parts.push(renderValue(node.children[i], depth + 1));
        }
        const tail = node.children.length > limit ? ', …' : '';
        return `[${parts.join(', ')}${tail}]`;
      }
    case 'stub-array':
      return '[…]';
    case 'ndjson-line':
      // Lines don't have a synchronously-available value (their content
      // lives in the source blob, decoded lazily). Render the same
      // ellipsis as a generic-content placeholder — used inside an
      // outer array preview, never standalone (LineRow renders the
      // actual line content).
      return '…';
  }
}
