// Semantic diff between two TreeNodes. Walks the trees side-by-side,
// emits a flat list of DiffOps each scoped to a JSON Pointer.
//
// NOT textual diff. This is the killer feature seed for the paid
// product per PROJECT_PLAN.md § Three core differentiators #2: detect
// structural drift (added/removed keys), type changes (string →
// number, object → array), and value changes — at semantic positions
// (JSON Pointer paths), not line numbers.
//
// What's intentionally NOT here in v1:
//
//   1. Rename detection. Heuristics (neighbor similarity, value-set
//      overlap) are valuable but fuzzy; ship them only if customer-
//      discovery signal asks. v1 treats a rename as added + removed.
//
//   2. Move detection (key moved between objects). Same reasoning.
//
//   3. Stub introspection. Stub-object / stub-array / ndjson-line
//      content lives in byte ranges that haven't been materialized.
//      The diff emits 'stub-skipped' for those positions; UI surfaces
//      the limitation to the user (mirror of QueryPane's footer chip).
//
// Performance note: this is O(N) over the larger of the two trees.
// For typical M2 use (paste-both-sides, compare against a 100KB
// saved baseline), main-thread sync is fine. If a customer hits a
// slow case on huge trees, route through a query.worker.ts as a
// follow-up — same deferral logic as the JSONPath query lib.

import type { TreeNode } from '@/lib/tree/parse';
import { treeNodeToPlain } from '@/lib/tree/to-plain';

export type DiffOp =
  | { kind: 'same'; pointer: string; value: unknown }
  | {
      kind: 'value-changed';
      pointer: string;
      before: unknown;
      after: unknown;
    }
  | {
      kind: 'type-changed';
      pointer: string;
      beforeType: TreeNode['kind'];
      afterType: TreeNode['kind'];
      before: unknown;
      after: unknown;
    }
  | { kind: 'added'; pointer: string; value: unknown }
  | { kind: 'removed'; pointer: string; value: unknown }
  | {
      kind: 'stub-skipped';
      pointer: string;
      // Which side(s) had a stub at this position.
      side: 'before' | 'after' | 'both';
    };

export type DiffSummary = {
  same: number;
  valueChanged: number;
  typeChanged: number;
  added: number;
  removed: number;
  stubSkipped: number;
};

export type DiffResult = {
  ops: DiffOp[];
  summary: DiffSummary;
};

export function diffTrees(before: TreeNode, after: TreeNode): DiffResult {
  const ops: DiffOp[] = [];
  walkPair(before, after, '', ops);
  return { ops, summary: summarize(ops) };
}

// Internal: walks one position. Both sides defined here — the
// undefined-side cases (added/removed) are handled at child
// recursion sites where we have parent context for the pointer.
function walkPair(
  before: TreeNode,
  after: TreeNode,
  pointer: string,
  ops: DiffOp[],
): void {
  // Stub handling first — opaque on either side aborts the recursion
  // at this position.
  const beforeStub = isStub(before);
  const afterStub = isStub(after);
  if (beforeStub && afterStub) {
    ops.push({ kind: 'stub-skipped', pointer, side: 'both' });
    return;
  }
  if (beforeStub) {
    ops.push({ kind: 'stub-skipped', pointer, side: 'before' });
    return;
  }
  if (afterStub) {
    ops.push({ kind: 'stub-skipped', pointer, side: 'after' });
    return;
  }

  // Type comparison. Includes the composite-shape case
  // (object → array) per `structurally-drifted` framing — emitted as
  // type-changed with both subtree values for UI to render rich diff.
  if (before.kind !== after.kind) {
    ops.push({
      kind: 'type-changed',
      pointer,
      beforeType: before.kind,
      afterType: after.kind,
      before: treeNodeToPlain(before),
      after: treeNodeToPlain(after),
    });
    return;
  }

  switch (before.kind) {
    case 'null':
      ops.push({ kind: 'same', pointer, value: null });
      return;
    case 'string':
    case 'number':
    case 'boolean': {
      const afterPrim = after as typeof before;
      if (before.value === afterPrim.value) {
        ops.push({ kind: 'same', pointer, value: before.value });
      } else {
        ops.push({
          kind: 'value-changed',
          pointer,
          before: before.value,
          after: afterPrim.value,
        });
      }
      return;
    }
    case 'object': {
      const afterObj = after as Extract<TreeNode, { kind: 'object' }>;
      const beforeKeys = new Map<string, TreeNode>();
      for (const c of before.children) {
        if (c.key !== null) beforeKeys.set(c.key, c);
      }
      const afterKeys = new Map<string, TreeNode>();
      for (const c of afterObj.children) {
        if (c.key !== null) afterKeys.set(c.key, c);
      }
      // Iterate union of keys in a deterministic order — before's
      // first, then after's missing-from-before. Stable enough for
      // snapshot-style tests and predictable UI rendering.
      const seen = new Set<string>();
      for (const key of beforeKeys.keys()) {
        seen.add(key);
        const childPointer = pointer + '/' + escapePointerSegment(key);
        const beforeChild = beforeKeys.get(key);
        const afterChild = afterKeys.get(key);
        if (beforeChild && afterChild) {
          walkPair(beforeChild, afterChild, childPointer, ops);
        } else if (beforeChild) {
          ops.push({
            kind: 'removed',
            pointer: childPointer,
            value: treeNodeToPlain(beforeChild),
          });
        }
      }
      for (const key of afterKeys.keys()) {
        if (seen.has(key)) continue;
        const childPointer = pointer + '/' + escapePointerSegment(key);
        const afterChild = afterKeys.get(key)!;
        ops.push({
          kind: 'added',
          pointer: childPointer,
          value: treeNodeToPlain(afterChild),
        });
      }
      return;
    }
    case 'array': {
      const afterArr = after as Extract<TreeNode, { kind: 'array' }>;
      const maxLen = Math.max(before.children.length, afterArr.children.length);
      for (let i = 0; i < maxLen; i++) {
        const childPointer = pointer + '/' + i;
        const beforeChild = before.children[i];
        const afterChild = afterArr.children[i];
        if (beforeChild !== undefined && afterChild !== undefined) {
          walkPair(beforeChild, afterChild, childPointer, ops);
        } else if (beforeChild !== undefined) {
          ops.push({
            kind: 'removed',
            pointer: childPointer,
            value: treeNodeToPlain(beforeChild),
          });
        } else if (afterChild !== undefined) {
          ops.push({
            kind: 'added',
            pointer: childPointer,
            value: treeNodeToPlain(afterChild),
          });
        }
      }
      return;
    }
    // Stub cases handled above — exhaustive switch.
    case 'stub-object':
    case 'stub-array':
    case 'ndjson-line':
      return;
  }
}

function isStub(node: TreeNode): boolean {
  return (
    node.kind === 'stub-object' ||
    node.kind === 'stub-array' ||
    node.kind === 'ndjson-line'
  );
}

// RFC 6901 pointer-segment escape: `~` → `~0`, `/` → `~1`. Order
// matters — `~` first so `~1` doesn't become `~01`.
function escapePointerSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

function summarize(ops: DiffOp[]): DiffSummary {
  const s: DiffSummary = {
    same: 0,
    valueChanged: 0,
    typeChanged: 0,
    added: 0,
    removed: 0,
    stubSkipped: 0,
  };
  for (const op of ops) {
    switch (op.kind) {
      case 'same':
        s.same++;
        break;
      case 'value-changed':
        s.valueChanged++;
        break;
      case 'type-changed':
        s.typeChanged++;
        break;
      case 'added':
        s.added++;
        break;
      case 'removed':
        s.removed++;
        break;
      case 'stub-skipped':
        s.stubSkipped++;
        break;
    }
  }
  return s;
}
