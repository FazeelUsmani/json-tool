// JSON Schema draft-07 emitter. First of three IR-consumers (TS + Zod
// follow the same pattern in subsequent slices). Walks the shared IR
// (`./types.ts`) and produces:
//
//   - `schema`: a structured JSON Schema object that any validator
//     (ajv, json-schema-faker, etc.) can consume directly. Tests
//     assert on this without string-comparison brittleness.
//   - `source`: the same schema formatted for UI display + clipboard
//     copy (2-space indent, $schema header included).
//
// The two-format return is per slice 2 design refinement — separating
// structured-validation consumers from display consumers without
// either side parsing/restringifying the other.
//
// Why draft-07 over 2020-12: widest tooling support today (ajv,
// openapi-3.1, every JSON Schema validator we'd expect a user to plug
// our output into). 2020-12 is the modern spec but adoption is uneven.
// We can revisit when downstream tooling catches up.
//
// M1 mapping rules:
//   { kind: 'null' }                       → { type: 'null' }
//   { kind: 'string', nullable: false }    → { type: 'string' }
//   { kind: 'string', nullable: true }     → { type: ['string', 'null'] }
//   { kind: 'array', items, nullable }     → { type, items: emit(items) }
//   { kind: 'object', fields, nullable }   → { type, properties, required[] }
//   { kind: 'mixed', observed, nullable }  → {} with description
//                                            (empty schema allows anything)
//
// Required[] is built from fields where `optional === false`. Omitted
// entirely when no fields are required (JSON Schema convention: absent
// required is identical to required: []).

import type { IRField, IRSchema } from './types';

export type JsonSchemaEmitResult = {
  schema: Record<string, unknown>;
  source: string;
};

const SCHEMA_URI = 'http://json-schema.org/draft-07/schema#';

const MIXED_DESCRIPTION =
  'Mixed types observed during inference — refine manually (M1 cut: no unions/enums)';

export function emitJsonSchema(ir: IRSchema): JsonSchemaEmitResult {
  const body = emitNode(ir);
  const schema = { $schema: SCHEMA_URI, ...body };
  const source = JSON.stringify(schema, null, 2);
  return { schema, source };
}

function emitNode(node: IRSchema): Record<string, unknown> {
  switch (node.kind) {
    case 'null':
      return { type: 'null' };
    case 'string':
    case 'number':
    case 'boolean':
      return { type: typeOrNullable(node.kind, node.nullable) };
    case 'array':
      return {
        type: typeOrNullable('array', node.nullable),
        items: emitNode(node.items),
      };
    case 'object':
      return emitObject(node.fields, node.nullable);
    case 'mixed':
      // Empty schema (no `type`) allows anything — the safest M1
      // fallback for fields with divergent observations. Description
      // tells the user to refine manually rather than silently
      // accepting any value.
      return { description: MIXED_DESCRIPTION };
  }
}

function typeOrNullable(type: string, nullable: boolean): string | string[] {
  return nullable ? [type, 'null'] : type;
}

function emitObject(
  fields: Map<string, IRField>,
  nullable: boolean,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, field] of fields) {
    properties[key] = emitNode(field.schema);
    if (!field.optional) required.push(key);
  }
  const result: Record<string, unknown> = {
    type: typeOrNullable('object', nullable),
    properties,
  };
  if (required.length > 0) result.required = required;
  return result;
}
