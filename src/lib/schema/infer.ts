// Walker that builds the schema IR (see `./types.ts`) from a TreeNode
// root. Pure function of (root, fetchStub) — no Blob, no parser, no
// worker concerns; those land in `schema.worker.ts` and `schemaHost.ts`
// in subsequent slices.
//
// `fetchStub` is the injected dependency for resolving the raw JS
// value behind a stub-object / stub-array / ndjson-line node. In
// production: a closure that calls `blob.slice(start, end).text()`
// then `JSON.parse`. In tests: a Map<byteRange, value> lookup so the
// walker can be exercised without touching a real Blob.
//
// Sampling lives at the array level (multiple sibling elements offer
// N draws of the same shape). Object fields don't sample — a single
// object only has one occurrence of each key. Walk-all kicks in below
// 1000 elements; above that, sample 1000 random indices via the
// `sample.ts` helper.
//
// Merging is the load-bearing operation. When the walker visits N
// sibling array elements, it produces N item-schemas and merges them
// into one. Null + X promotes X to `nullable: true`; same kind keeps
// the kind; different non-null kinds collapse to `mixed` with both
// branches preserved in `observed` (for M2 union support).

import type { TreeNode } from '@/lib/tree/parse';
import type { IRField, IRSchema } from './types';
import { rangeAll, sampleIndices } from './sample';

export type FetchStubValue = (
  byteStart: number,
  byteEnd: number,
) => Promise<unknown>;

// Walk-all threshold + sampling cap. Picked so the cost of the walk
// is bounded by O(1000) JSON.parse calls regardless of source size.
// Statistical justification: 1000 samples gives >99.7% chance of
// catching any field present in >0.7% of records (1 - (1 - 0.007)^1000),
// which is enough for required/optional + nullable inference under
// the bounded scope.
export const WALK_ALL_BELOW = 1000;
export const SAMPLE_CAP = 1000;

export async function inferSchema(
  root: TreeNode,
  fetchStub: FetchStubValue,
): Promise<IRSchema> {
  return walkNode(root, fetchStub);
}

async function walkNode(
  node: TreeNode,
  fetchStub: FetchStubValue,
): Promise<IRSchema> {
  switch (node.kind) {
    case 'null':
      return { kind: 'null' };
    case 'string':
      return { kind: 'string', nullable: false };
    case 'number':
      return { kind: 'number', nullable: false };
    case 'boolean':
      return { kind: 'boolean', nullable: false };
    case 'object':
      return walkObject(node.children, fetchStub);
    case 'array':
      return walkArray(node.children, fetchStub);
    case 'stub-object':
    case 'stub-array': {
      const value = await fetchStub(node.byteStart, node.byteEnd);
      return walkValue(value);
    }
    case 'ndjson-line': {
      const value = await fetchStub(node.byteStart, node.byteEnd);
      return walkValue(value);
    }
  }
}

async function walkObject(
  children: TreeNode[],
  fetchStub: FetchStubValue,
): Promise<IRSchema> {
  const fields = new Map<string, IRField>();
  for (const child of children) {
    if (child.key === null) continue;
    const schema = await walkNode(child, fetchStub);
    fields.set(child.key, { schema, optional: false });
  }
  return { kind: 'object', fields, nullable: false };
}

async function walkArray(
  children: TreeNode[],
  fetchStub: FetchStubValue,
): Promise<IRSchema> {
  if (children.length === 0) {
    // Empty array gives no information about the items — return null
    // as the placeholder. Emitters handle this case (e.g. JSON Schema
    // emits `"items": {}` to allow anything).
    return { kind: 'array', items: { kind: 'null' }, nullable: false };
  }
  const indices =
    children.length <= WALK_ALL_BELOW
      ? rangeAll(children.length)
      : sampleIndices(children.length, SAMPLE_CAP);
  const sampled: IRSchema[] = [];
  for (const i of indices) {
    sampled.push(await walkNode(children[i], fetchStub));
  }
  return {
    kind: 'array',
    items: mergeMany(sampled),
    nullable: false,
  };
}

// Sync walker for raw JS values returned by fetchStub. Used after
// JSON.parse on a sliced stub or NDJSON line — the byte-range
// metadata in TreeNode doesn't apply once we have the live object.
// Nested arrays inside the parsed value still respect the sampling
// cap so a sampled stub containing a 100K-element inner array
// doesn't walk all 100K children synchronously.
function walkValue(value: unknown): IRSchema {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string') return { kind: 'string', nullable: false };
  if (typeof value === 'number') return { kind: 'number', nullable: false };
  if (typeof value === 'boolean') return { kind: 'boolean', nullable: false };
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: 'array', items: { kind: 'null' }, nullable: false };
    }
    const indices =
      value.length <= WALK_ALL_BELOW
        ? rangeAll(value.length)
        : sampleIndices(value.length, SAMPLE_CAP);
    const sampled: IRSchema[] = [];
    for (const i of indices) sampled.push(walkValue(value[i]));
    return { kind: 'array', items: mergeMany(sampled), nullable: false };
  }
  if (typeof value === 'object') {
    const fields = new Map<string, IRField>();
    for (const [k, v] of Object.entries(value)) {
      fields.set(k, { schema: walkValue(v), optional: false });
    }
    return { kind: 'object', fields, nullable: false };
  }
  // function / undefined / bigint — shouldn't occur from JSON.parse
  // output. Emit a no-information mixed so callers see something
  // explicit if it ever happens (vs silently misclassifying).
  return { kind: 'mixed', observed: [], nullable: false };
}

// --- merging ---

function mergeMany(schemas: IRSchema[]): IRSchema {
  if (schemas.length === 0) return { kind: 'null' };
  let result = schemas[0];
  for (let i = 1; i < schemas.length; i++) {
    result = mergeSchemas(result, schemas[i]);
  }
  return result;
}

function mergeSchemas(a: IRSchema, b: IRSchema): IRSchema {
  // Null cases — null + anything promotes the other side's nullable bit.
  if (a.kind === 'null' && b.kind === 'null') return { kind: 'null' };
  if (a.kind === 'null') return withNullable(b, true);
  if (b.kind === 'null') return withNullable(a, true);

  // Same non-null kind — merge in place.
  if (a.kind === b.kind) {
    switch (a.kind) {
      case 'string':
      case 'number':
      case 'boolean': {
        const bSame = b as typeof a;
        return { kind: a.kind, nullable: a.nullable || bSame.nullable };
      }
      case 'array': {
        const bSame = b as typeof a;
        return {
          kind: 'array',
          items: mergeSchemas(a.items, bSame.items),
          nullable: a.nullable || bSame.nullable,
        };
      }
      case 'object':
        return mergeObjects(a, b as typeof a);
      case 'mixed': {
        const bSame = b as typeof a;
        // Concatenate observed branches. Dedupe by deep equality is
        // tempting but adds quadratic cost without a strong M1 use
        // case; emitters ignore `observed` at M1 anyway.
        return {
          kind: 'mixed',
          observed: [...a.observed, ...bSame.observed],
          nullable: a.nullable || bSame.nullable,
        };
      }
    }
  }

  // Different non-null kinds → collapse to mixed. Preserve BOTH
  // branches in `observed` so M2 unions can lift them without
  // re-walking the tree (design refinement #5).
  return {
    kind: 'mixed',
    observed: [a, b],
    nullable: a.nullable || b.nullable,
  };
}

function withNullable(s: IRSchema, n: boolean): IRSchema {
  if (s.kind === 'null') return s;
  if (!n || s.nullable) return s;
  return { ...s, nullable: true };
}

function mergeObjects(
  a: Extract<IRSchema, { kind: 'object' }>,
  b: Extract<IRSchema, { kind: 'object' }>,
): IRSchema {
  const fields = new Map<string, IRField>();
  const allKeys = new Set<string>([...a.fields.keys(), ...b.fields.keys()]);
  for (const k of allKeys) {
    const af = a.fields.get(k);
    const bf = b.fields.get(k);
    if (af !== undefined && bf !== undefined) {
      fields.set(k, {
        schema: mergeSchemas(af.schema, bf.schema),
        optional: af.optional || bf.optional,
      });
    } else {
      // Field present on one side only — strict thresholding flips
      // optional to true (per design refinement #4).
      const present = (af ?? bf) as IRField;
      fields.set(k, { schema: present.schema, optional: true });
    }
  }
  return { kind: 'object', fields, nullable: a.nullable || b.nullable };
}
