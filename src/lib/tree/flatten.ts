// Converts the recursive TreeNode tree into a flat array of rows, one entry
// per rendered line. This is the data structure that W2-Tue's react-window
// will consume — visible-row count drives render cost, not total node count.
//
// IDs are JSON paths (e.g. `$.users[0].name`) so the viewStore's `closed`
// Set survives reparses: a user editing one part of the document keeps
// their unrelated collapsed subtrees collapsed.
//
// Each composite emits an `open` row + recursive children + a `close` row.
// Empty composites collapse to a single `leaf` row (rendered inline as
// `{}` or `[]`). This is the same visual structure today's recursive
// renderer produces — the refactor is internal, not user-visible.

import type { TreeNode } from './parse';

type CompositeNode = Extract<TreeNode, { kind: 'object' | 'array' }>;
type StubNode = Extract<TreeNode, { kind: 'stub-object' | 'stub-array' }>;
type NdjsonLineNode = Extract<TreeNode, { kind: 'ndjson-line' }>;

export type ParentKind = 'object' | 'array' | 'root';

export type FlatRow =
  | {
      kind: 'open';
      id: string;
      depth: number;
      node: CompositeNode;
      parentKind: ParentKind;
      parentIndex: number;
    }
  | {
      kind: 'close';
      id: string;
      depth: number;
      closeBracket: '}' | ']';
      parentIndex: number;
    }
  | {
      kind: 'leaf';
      id: string;
      depth: number;
      // Stubs route to the 'stub' row type below, ndjson-lines to 'line';
      // narrow the leaf node type so downstream switches don't re-check.
      node: Exclude<TreeNode, StubNode | NdjsonLineNode>;
      parentKind: ParentKind;
      parentIndex: number;
    }
  // Stubs from the W3 streaming parser: composite values at depth >=
  // MAX_SPINE_DEPTH that haven't been materialized yet. One flat row per
  // stub (no open/close pair) — renders as a collapsed composite with a
  // childCount pill. Step 7 wires click-to-expand; until then they're
  // visually present but inert.
  | {
      kind: 'stub';
      id: string;
      depth: number;
      node: StubNode;
      parentKind: ParentKind;
      parentIndex: number;
    }
  // W3-Thu NDJSON: one row per line. Leaf-shaped (no children); preview
  // text loads lazily from sourceBlob in LineRow. Click opens detail
  // drawer with the line's parsed JSON (v1). In-place expansion is the
  // v2 follow-up.
  | {
      kind: 'line';
      id: string;
      depth: number;
      node: NdjsonLineNode;
      parentKind: ParentKind;
      parentIndex: number;
    };

export function flattenTree(root: TreeNode): FlatRow[] {
  const out: FlatRow[] = [];
  walk(root, 'root', 0, -1, out);
  return out;
}

function walk(
  node: TreeNode,
  parentKind: ParentKind,
  depth: number,
  parentIndex: number,
  out: FlatRow[],
): void {
  if (node.kind === 'stub-object' || node.kind === 'stub-array') {
    out.push({
      kind: 'stub',
      id: node.path,
      depth,
      node,
      parentKind,
      parentIndex,
    });
    return;
  }
  if (node.kind === 'ndjson-line') {
    out.push({
      kind: 'line',
      id: node.path,
      depth,
      node,
      parentKind,
      parentIndex,
    });
    return;
  }
  if (node.kind === 'object' || node.kind === 'array') {
    if (node.children.length === 0) {
      // Empty `{}` / `[]` renders as one row, no open/close pair.
      out.push({
        kind: 'leaf',
        id: node.path,
        depth,
        node,
        parentKind,
        parentIndex,
      });
      return;
    }
    const openIndex = out.length;
    out.push({
      kind: 'open',
      id: node.path,
      depth,
      node,
      parentKind,
      parentIndex,
    });
    const childParent: ParentKind = node.kind === 'object' ? 'object' : 'array';
    for (const child of node.children) {
      walk(child, childParent, depth + 1, openIndex, out);
    }
    out.push({
      kind: 'close',
      // Suffix on close-row IDs only — React key uniqueness; close rows
      // aren't toggleable so this ID never enters the `closed` Set.
      id: `${node.path}#close`,
      depth,
      closeBracket: node.kind === 'object' ? '}' : ']',
      parentIndex: openIndex,
    });
    return;
  }
  out.push({
    kind: 'leaf',
    id: node.path,
    depth,
    node,
    parentKind,
    parentIndex,
  });
}

// Returns the subset of rows whose parent chain has no closed composite.
// O(N × avgDepth) per call — fine through W2; if W2-Fri profiling shows it
// as the bottleneck the fix is an incrementally-maintained visible-set
// updated on toggle. Don't pre-optimize.
export function deriveVisible(
  flat: FlatRow[],
  closed: ReadonlySet<string>,
): FlatRow[] {
  if (closed.size === 0) return flat;
  return flat.filter((row) => {
    let p = row.parentIndex;
    while (p >= 0) {
      if (closed.has(flat[p].id)) return false;
      p = flat[p].parentIndex;
    }
    return true;
  });
}
