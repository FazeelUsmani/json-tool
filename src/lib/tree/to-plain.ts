// Walks a TreeNode tree and produces a plain-JS object/primitive
// suitable for libraries that expect "regular" JSON (jsonpath-plus,
// semantic-diff, future query/inspection libs).
//
// Stub semantics: stub-object / stub-array / ndjson-line nodes are
// not materialized → opaque. This util returns `null` for them so
// consumers walk past silently. Consumers MUST surface this
// limitation in their UI (queries can miss matches inside stubs;
// diffs see stubs as null-equal). The footer chip in QueryPane is
// the canonical pattern.
//
// NOT a one-size-fits-all toPlain: other walkers in the codebase
// (TablePane's treeNodeToValueSync, useRowMaterialization, infer.ts
// walkValue) have different stub semantics for their domain (return
// undefined, throw, or sample from the byte range). Don't migrate
// those to this util without a per-call-site review of stub
// behavior — they're not equivalent.

import type { TreeNode } from './parse';

export function treeNodeToPlain(node: TreeNode): unknown {
  switch (node.kind) {
    case 'null':
      return null;
    case 'string':
    case 'number':
    case 'boolean':
      return node.value;
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const c of node.children) {
        if (c.key !== null) out[c.key] = treeNodeToPlain(c);
      }
      return out;
    }
    case 'array':
      return node.children.map(treeNodeToPlain);
    case 'stub-object':
    case 'stub-array':
    case 'ndjson-line':
      // See file header. Stubs are opaque → null. UI must explain
      // the limitation to the user.
      return null;
  }
}
