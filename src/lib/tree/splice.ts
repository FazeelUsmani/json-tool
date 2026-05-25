// Replaces a node in a TreeNode tree by JSON Pointer id, used by W3 stub
// expansion to merge a worker-materialized subtree back into the spine.
//
// Returns a NEW root with structural sharing for unchanged subtrees — only
// nodes on the path from root to the spliced location get new identities.
// This sharing benefits any code that walks the tree directly (drawer's
// reconstructJson, future tree-traversal utilities) since unchanged
// subtrees compare === across renders.
//
// IMPORTANT: structural sharing does NOT propagate into FlatRow caching.
// flattenTree rebuilds every FlatRow from scratch on each call — there's
// no per-node FlatRow memoization. If we ever add one, this sharing
// becomes load-bearing for performance; today it's just an invariant that
// keeps tree-walking code well-behaved.

import type { TreeNode } from './parse';

export function spliceSubtree(
  root: TreeNode,
  atId: string,
  replacement: TreeNode,
): TreeNode {
  // Preserve the original's key: the worker parses the subtree in
  // isolation via baseId and returns a root with key:null, which would
  // drop the array index or object-key label after the splice (e.g.
  // [41746] would collapse to a keyless `{ … } {5}` row after expand→
  // collapse). Only allocate when keys actually differ — keeps structural
  // sharing intact for callers that pre-aligned the key.
  if (root.id === atId) {
    return replacement.key === root.key
      ? replacement
      : { ...replacement, key: root.key };
  }

  // Early-out when atId cannot lie under root.id: JSON Pointer always
  // uses `/` as the separator between segments, so a descendant id
  // starts with `${root.id}/`. Root (id="") + `/` = `/`, which any
  // non-root pointer starts with, so the check covers that case too.
  if (!atId.startsWith(root.id + '/')) {
    return root;
  }

  if (root.kind !== 'object' && root.kind !== 'array') {
    // Stub or primitive at this position — can't descend further, but
    // atId is supposedly inside it. Id doesn't exist; return as-is.
    return root;
  }

  let changed = false;
  const newChildren = root.children.map((child) => {
    const next = spliceSubtree(child, atId, replacement);
    if (next !== child) changed = true;
    return next;
  });
  if (!changed) return root;
  return { ...root, children: newChildren };
}
