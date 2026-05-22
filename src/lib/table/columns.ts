// Column derivation for the table view. Walks the first N sampled
// rows and produces a list of `Column` entries — one per discovered
// key (for arrays of objects) or a single "value" column (for arrays
// of primitives / mixed shapes).
//
// Why sample 100 by default: matches `quicktype`'s sampling default
// for type inference; large enough to catch any field present in
// >3% of records but small enough to keep derivation O(100). Unlike
// the schema-inference walker (where missing a key produces broken
// generated types), missing a rare column here just means a few
// fewer visible columns — lower stakes, simpler fixed-size sample.
//
// Type collapse rules (`null` + X → X is the load-bearing case):
//   - All sampled values share one type → that type
//   - Sampled values are exactly {null, X} for some X → X
//     (treats null as a nullability bit, not a distinct kind)
//   - Anything else → 'mixed'
//
// First-encounter key order is preserved so the rendered column
// order matches the user's mental model (the order keys appear in
// the first few records they see).

export type ColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'mixed'
  | 'object'
  | 'array';

export type Column = {
  key: string;
  type: ColumnType;
};

export const COLUMN_SAMPLE_SIZE = 100;

// Special key used when the array contains non-object elements
// (primitives or mixed). One column whose values are the raw row
// values themselves.
export const VALUE_COLUMN_KEY = '$value';

export function deriveColumns(
  rows: ReadonlyArray<unknown>,
  sampleSize: number = COLUMN_SAMPLE_SIZE,
): Column[] {
  const limit = Math.min(rows.length, sampleSize);
  if (limit === 0) return [];

  // Branch on whether every sampled row is a plain object. If any
  // row is a primitive / array / null, fall back to single-column
  // mode — sorting and rendering still work, just on the row value
  // as a whole.
  let allPlainObjects = true;
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      allPlainObjects = false;
      break;
    }
  }

  if (!allPlainObjects) {
    const types = new Set<ColumnType>();
    for (let i = 0; i < limit; i++) types.add(classifyValue(rows[i]));
    return [{ key: VALUE_COLUMN_KEY, type: collapseTypes(types) }];
  }

  const keyTypes = new Map<string, Set<ColumnType>>();
  const keyOrder: string[] = [];
  for (let i = 0; i < limit; i++) {
    const obj = rows[i] as Record<string, unknown>;
    for (const k in obj) {
      // Guard against prototype keys; only own properties matter.
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      let bucket = keyTypes.get(k);
      if (bucket === undefined) {
        bucket = new Set();
        keyTypes.set(k, bucket);
        keyOrder.push(k);
      }
      bucket.add(classifyValue(obj[k]));
    }
  }

  return keyOrder.map((key) => ({
    key,
    type: collapseTypes(keyTypes.get(key) as Set<ColumnType>),
  }));
}

function classifyValue(v: unknown): ColumnType {
  if (v === null) return 'null';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  // function / undefined / bigint shouldn't arise from JSON.parse
  // output — collapse to 'mixed' as a no-information signal.
  return 'mixed';
}

function collapseTypes(types: Set<ColumnType>): ColumnType {
  if (types.size === 1) return types.values().next().value as ColumnType;
  // Treat {null, X} as nullable X — the column renders + sorts as X,
  // with null values understood as missing data.
  if (types.size === 2 && types.has('null')) {
    for (const t of types) if (t !== 'null') return t;
  }
  return 'mixed';
}
