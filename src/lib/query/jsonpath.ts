// JSONPath query against the parsed TreeNode tree, returning matches
// in both JSON Pointer form (for click-to-focus integration with the
// existing tree identity layer) and JSONPath form (for display).
//
// Why main-thread (not worker-routed) for v1: jsonpath-plus walks an
// in-memory JS object. The parsed tree already lives in the parser
// worker; routing the query through that worker would mean cloning
// the converted-to-plain object across the worker boundary (>200ms
// for tens of MB structured-clone), defeating the purpose. For shapes
// that already pass parse cleanly, main-thread query is faster than
// the round-trip. If a customer hits a slow query post-launch, route
// through a dedicated query.worker.ts as a follow-up slice.
//
// Stub limitation (load-bearing — must be surfaced in the UI): queries
// only see materialized spine + leaves. A query like `$..deepKey`
// against a 200 MB doc with stubs (composites past MAX_SPINE_DEPTH)
// will MISS matches inside collapsed subtrees. We mark stub nodes as
// `null` in the converted object so jsonpath-plus walks past them
// silently; the QueryPane dialog explains the limitation to the user.

import { JSONPath } from 'jsonpath-plus';
import type { TreeNode } from '@/lib/tree/parse';
import { treeNodeToPlain } from '@/lib/tree/to-plain';

export type QueryMatch = {
  // RFC 6901 JSON Pointer matching the canonical node.id used across
  // the parser + tree + table + schema + drawer subsystems. Click
  // handlers can fan out from this directly.
  pointer: string;
  // Display form (e.g. "$.events[0].user.plan"). What the user typed
  // and what they expect to see in result rows.
  jsonpath: string;
  // The matched value — primitive or composite. Used by the result
  // row for the truncated preview ("…3 items" / `"alice"` / `42`).
  value: unknown;
};

export type QueryResult =
  | { ok: true; matches: QueryMatch[] }
  | { ok: false; reason: 'invalid-query'; error: string };

export function runQuery(root: TreeNode, query: string): QueryResult {
  const trimmed = query.trim();
  if (trimmed === '') return { ok: true, matches: [] };

  let plain: unknown;
  try {
    plain = treeNodeToPlain(root);
  } catch (e) {
    return {
      ok: false,
      reason: 'invalid-query',
      error: e instanceof Error ? e.message : 'tree conversion failed',
    };
  }

  try {
    // resultType:'all' returns { value, path, pointer, parent,
    // parentProperty } per match. We only use value + pointer; path
    // is jsonpath-plus's canonical bracket form which we surface as
    // the "jsonpath" display value.
    const results = JSONPath({
      json: plain as object,
      path: trimmed,
      resultType: 'all',
      flatten: false,
    }) as Array<{ value: unknown; path: string; pointer: string }>;

    return {
      ok: true,
      matches: results.map((r) => ({
        pointer: r.pointer,
        jsonpath: r.path,
        value: r.value,
      })),
    };
  } catch (e) {
    // jsonpath-plus throws for syntax errors only when `eval` mode is
    // enabled (we don't use eval). Most malformed queries return
    // empty results instead of throwing. We still wrap in case a
    // future jsonpath-plus version changes that.
    return {
      ok: false,
      reason: 'invalid-query',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// treeNodeToPlain lives in @/lib/tree/to-plain — shared with the
// semantic-diff lib (M2 slice A) and any future TreeNode walker that
// wants a plain-JS view. See that file for stub semantics.
