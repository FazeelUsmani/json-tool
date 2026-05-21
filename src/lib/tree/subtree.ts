// Reconstructs the parsed JSON value from a TreeNode subtree. Used by the
// detail drawer to render the formatted raw subtree.
//
// The roundtrip back to JSON.stringify is lossy in one obvious way: object-
// key order matches the TreeNode children order (insertion order), which is
// what the original parse produced. That's fine for display.

import type { TreeNode } from './parse';

export function reconstructJson(node: TreeNode): unknown {
  switch (node.kind) {
    case 'null':
      return null;
    case 'string':
    case 'number':
    case 'boolean':
      return node.value;
    case 'array':
      return node.children.map(reconstructJson);
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const child of node.children) {
        if (child.key !== null) obj[child.key] = reconstructJson(child);
      }
      return obj;
    }
    case 'stub-object':
    case 'stub-array':
    case 'ndjson-line':
      // Reconstruction requires materialized children, which these kinds
      // don't have synchronously available. Callers that need the value
      // for these kinds load the byte range from sourceBlob and parse it
      // separately (DetailDrawer's NDJSON-line path; expandStub flow for
      // composite stubs). Returning undefined here is a sentinel: the
      // drawer falls back to the "raw bytes" view in those cases.
      return undefined;
  }
}
