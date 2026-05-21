// Counts node kinds across a TreeNode subtree. Read by the debug HUD
// (?debug=1) to surface "how big is this thing actually?" without
// computing it ad-hoc in the render loop. The walk is iterative (explicit
// stack) so a 150-deep tree doesn't overflow the JS call stack — same
// reason flatten / splice avoid recursion.
//
// Returned counts:
//   spineCount       — materialized composites (object + array)
//   stubCount        — unexpanded subtree pointers (stub-object + stub-array)
//   leafCount        — string / number / boolean / null
//   ndjsonLineCount  — NDJSON line entries
//
// In NDJSON mode the root is typically an array whose children are
// ndjson-line nodes, so spineCount=1 and ndjsonLineCount=N is the
// expected shape. In JSON streaming mode spineCount and stubCount
// together describe the visible-vs-deferred split of the document.

import type { TreeNode } from './parse';

export type SpineMetrics = {
  spineCount: number;
  stubCount: number;
  leafCount: number;
  ndjsonLineCount: number;
};

const EMPTY: SpineMetrics = {
  spineCount: 0,
  stubCount: 0,
  leafCount: 0,
  ndjsonLineCount: 0,
};

export function computeSpineMetrics(root: TreeNode | null): SpineMetrics {
  if (root === null) return EMPTY;
  let spineCount = 0;
  let stubCount = 0;
  let leafCount = 0;
  let ndjsonLineCount = 0;
  // Iterative DFS. Push children onto the stack rather than recursing.
  // For a 1M-element flat array the stack holds at most ~1M entries —
  // acceptable for a debug-only one-shot count.
  const stack: TreeNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    switch (n.kind) {
      case 'object':
      case 'array':
        spineCount++;
        for (let i = 0; i < n.children.length; i++) stack.push(n.children[i]);
        break;
      case 'stub-object':
      case 'stub-array':
        stubCount++;
        break;
      case 'ndjson-line':
        ndjsonLineCount++;
        break;
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
        leafCount++;
        break;
    }
  }
  return { spineCount, stubCount, leafCount, ndjsonLineCount };
}
