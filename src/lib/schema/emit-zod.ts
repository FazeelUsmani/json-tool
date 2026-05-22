// Zod schema emitter. Walks the shared IR (`./types.ts`) and emits a
// runtime-validation-ready Zod schema plus an inferred TypeScript
// type alias via `z.infer`. Output drops directly into a Zod-using
// codebase — paste, install zod, validate.
//
// Modifier mapping (the slice 5 design point):
//   required + non-nullable             → z.string()
//   required + nullable                 → z.string().nullable()
//   optional + non-nullable             → z.string().optional()
//   optional + nullable                 → z.string().nullish()
//
// `.nullish()` is Zod's canonical shorthand for `.nullable().optional()`.
// Using it when both bits are true avoids the chained `.nullable().optional()`
// which produces visually heavier output for no semantic gain.
//
// At the root level (or any array-item level), `optional` doesn't
// apply — only `nullable` does — so root-or-item emission uses
// `emitWithSchemaModifiers` while object-field emission uses
// `emitWithFieldModifiers`. Two thin wrappers around `emitBase`
// keep the modifier composition explicit.
//
// `mixed` collapses to `z.unknown()` — accepts any value, M2 will
// lift this into `z.union([...])` when we add union support.

import type { IRField, IRSchema } from './types';

export type ZodEmitResult = {
  source: string;
};

const INDENT = '  ';

export function emitZod(ir: IRSchema): ZodEmitResult {
  const body = emitWithSchemaModifiers(ir, 0);
  const source = [
    "import { z } from 'zod';",
    '',
    `export const RootSchema = ${body};`,
    '',
    'export type Root = z.infer<typeof RootSchema>;',
    '',
  ].join('\n');
  return { source };
}

function emitBase(node: IRSchema, depth: number): string {
  switch (node.kind) {
    case 'null':
      return 'z.null()';
    case 'string':
      return 'z.string()';
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'array':
      return `z.array(${emitWithSchemaModifiers(node.items, depth)})`;
    case 'object':
      return emitObject(node.fields, depth);
    case 'mixed':
      return 'z.unknown()';
  }
}

// Used at root + array-item positions: only nullable applies
// (optional is a key-presence concept that doesn't exist outside an
// object's fields).
function emitWithSchemaModifiers(node: IRSchema, depth: number): string {
  const base = emitBase(node, depth);
  if (node.kind === 'null') return base;
  return node.nullable ? `${base}.nullable()` : base;
}

// Used for object field values: composes optional + nullable into
// the right Zod call. `.nullish()` is the canonical shorthand when
// both bits are true.
function emitWithFieldModifiers(field: IRField, depth: number): string {
  const base = emitBase(field.schema, depth);
  const nullable = field.schema.kind !== 'null' && field.schema.nullable;
  if (nullable && field.optional) return `${base}.nullish()`;
  if (nullable) return `${base}.nullable()`;
  if (field.optional) return `${base}.optional()`;
  return base;
}

function emitObject(fields: Map<string, IRField>, depth: number): string {
  if (fields.size === 0) return 'z.object({})';
  const fieldIndent = INDENT.repeat(depth + 1);
  const closeIndent = INDENT.repeat(depth);
  const lines: string[] = ['z.object({'];
  for (const [key, field] of fields) {
    const keyText = isSafeIdentifier(key) ? key : JSON.stringify(key);
    lines.push(
      `${fieldIndent}${keyText}: ${emitWithFieldModifiers(field, depth + 1)},`,
    );
  }
  lines.push(`${closeIndent}})`);
  return lines.join('\n');
}

function isSafeIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}
