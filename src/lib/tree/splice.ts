// Replaces a node in a TreeNode tree by path, used by W3 stub expansion to
// merge a worker-materialized subtree back into the spine.
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
  atPath: string,
  replacement: TreeNode,
): TreeNode {
  if (root.path === atPath) return replacement;

  // Early-out when atPath cannot lie under root.path: a node's children's
  // paths all extend root.path with either `.` (object key) or `[` (array
  // index). If atPath doesn't start with one of those, no descent needed.
  if (
    !atPath.startsWith(root.path + '.') &&
    !atPath.startsWith(root.path + '[')
  ) {
    return root;
  }

  if (root.kind !== 'object' && root.kind !== 'array') {
    // Stub or primitive at this position — can't descend further, but
    // atPath is supposedly inside it. Path doesn't exist; return as-is.
    return root;
  }

  let changed = false;
  const newChildren = root.children.map((child) => {
    const next = spliceSubtree(child, atPath, replacement);
    if (next !== child) changed = true;
    return next;
  });
  if (!changed) return root;
  return { ...root, children: newChildren };
}
