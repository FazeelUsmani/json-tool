// Intermediate representation for schema inference. Single source of
// truth between the walker (`./infer.ts`) and the per-format emitters
// (`./emit-json-schema.ts`, `./emit-typescript.ts`, `./emit-zod.ts`
// — each landing in subsequent slices). Three thin emitter functions
// convert one IR into three target strings; the walker runs once.
//
// Design boundaries (PLAN.MD W4-Mon):
//   In:  primitives, arrays, objects, nullable
//   Out: unions, enums, format detection
//
// `kind: 'mixed'` is the out-of-scope marker for type divergence. When
// a field or array item is observed with multiple incompatible types
// across samples (e.g. string in some records, number in others), the
// IR collapses to mixed. `observed` keeps the full per-branch schemas
// — not just the kind tags — so M2 union support can lift this into a
// real discriminated union without re-walking the tree. M1 emitters
// ignore `observed` and emit `unknown` / `any` / `z.unknown()` with a
// comment.
//
// Nullability lives on each schema (`nullable: boolean`), not as a
// separate union with `null`. Keeps the kind enum stable and avoids
// turning every nullable-primitive field into a `mixed`. Field-level
// optionality (key absent from the parent object on at least one
// sampled element) is tracked separately via `IRField.optional` —
// semantically distinct from value-level nullability.
//
// Strict thresholding (per design refinement #4): any single
// observation of absent flips `optional` to true; any single null
// flips `nullable` to true. False-optional is safer than
// false-required when inferring from samples.

export type IRPrimitiveKind = 'null' | 'string' | 'number' | 'boolean';

export type IRSchema =
  | { kind: 'null' }
  | { kind: 'string'; nullable: boolean }
  | { kind: 'number'; nullable: boolean }
  | { kind: 'boolean'; nullable: boolean }
  | { kind: 'array'; items: IRSchema; nullable: boolean }
  | { kind: 'object'; fields: Map<string, IRField>; nullable: boolean }
  | { kind: 'mixed'; observed: readonly IRSchema[]; nullable: boolean };

export type IRField = {
  schema: IRSchema;
  optional: boolean;
};
