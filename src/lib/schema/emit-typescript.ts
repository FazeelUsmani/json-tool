// TypeScript type-alias emitter. Walks the shared IR (`./types.ts`)
// and emits a single `export type Root = ...` declaration with
// inline object literals — no nested type aliases, no interfaces.
// Mirrors the shape `quicktype --just-types --no-runtime-typecheck`
// produces for "give me the type I can paste into my project."
//
// Mapping rules:
//   null primitive          → null
//   string (nullable: false) → string
//   string (nullable: true)  → string | null
//   ...same for number, boolean
//   array                    → Array<items>  (with `| null` suffix when nullable)
//   object                   → { key: T; key?: T; key: T | null; … }
//   mixed                    → unknown  (with JSDoc when used as an object field)
//
// Object-field modifiers:
//   required + non-nullable   → `key: T;`
//   required + nullable       → `key: T | null;`
//   optional + non-nullable   → `key?: T;`
//   optional + nullable       → `key?: T | null;`
//
// Mixed-field disclosure: when a field's schema is `mixed`, a JSDoc
// comment above the property tells the reader the type collapsed
// because of cross-sample divergence. Comments inside type literals
// aren't legal TS, so the disclosure has to land at the field level
// rather than inline next to `unknown`.
//
// `Array<T>` over `T[]` everywhere: avoids paren-juggling for
// complex item types (e.g. `(string | null)[]` vs `Array<string | null>`)
// and keeps the emitter generator simple.

import type { IRField, IRSchema } from './types';

export type TypeScriptEmitResult = {
  source: string;
};

const MIXED_COMMENT = 'Mixed types observed during inference — refine manually';
const INDENT = '  ';

export function emitTypeScript(ir: IRSchema): TypeScriptEmitResult {
  const body = emitNode(ir, 0);
  const source = `export type Root = ${body};\n`;
  return { source };
}

function emitNode(node: IRSchema, depth: number): string {
  switch (node.kind) {
    case 'null':
      return 'null';
    case 'string':
      return nullableSuffix('string', node.nullable);
    case 'number':
      return nullableSuffix('number', node.nullable);
    case 'boolean':
      return nullableSuffix('boolean', node.nullable);
    case 'array':
      return nullableSuffix(
        `Array<${emitNode(node.items, depth)}>`,
        node.nullable,
      );
    case 'object':
      return emitObject(node.fields, node.nullable, depth);
    case 'mixed':
      return nullableSuffix('unknown', node.nullable);
  }
}

function nullableSuffix(type: string, nullable: boolean): string {
  return nullable ? `${type} | null` : type;
}

function emitObject(
  fields: Map<string, IRField>,
  nullable: boolean,
  depth: number,
): string {
  if (fields.size === 0) {
    return nullableSuffix('{}', nullable);
  }
  const fieldIndent = INDENT.repeat(depth + 1);
  const closeIndent = INDENT.repeat(depth);
  const lines: string[] = ['{'];
  for (const [key, field] of fields) {
    if (field.schema.kind === 'mixed') {
      lines.push(`${fieldIndent}/** ${MIXED_COMMENT} */`);
    }
    const opt = field.optional ? '?' : '';
    const keyText = isSafeIdentifier(key) ? key : JSON.stringify(key);
    lines.push(
      `${fieldIndent}${keyText}${opt}: ${emitNode(field.schema, depth + 1)};`,
    );
  }
  lines.push(`${closeIndent}}`);
  return nullableSuffix(lines.join('\n'), nullable);
}

// JS identifiers: letters, digits, `_`, `$`, can't start with a
// digit. Anything else gets JSON.stringify'd which wraps it in
// double quotes with the right escaping.
function isSafeIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}
