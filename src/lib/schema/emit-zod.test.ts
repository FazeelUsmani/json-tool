import { describe, expect, test } from 'vitest';
import { emitZod } from './emit-zod';
import type { IRField, IRSchema } from './types';

const PREAMBLE = "import { z } from 'zod';\n\nexport const RootSchema = ";
const POSTAMBLE = ';\n\nexport type Root = z.infer<typeof RootSchema>;\n';

function wrap(body: string): string {
  return PREAMBLE + body + POSTAMBLE;
}

describe('emitZod — source shape', () => {
  test('emits import + const + type alias', () => {
    const source = emitZod({ kind: 'null' }).source;
    expect(source).toContain("import { z } from 'zod';");
    expect(source).toContain('export const RootSchema = z.null();');
    expect(source).toContain('export type Root = z.infer<typeof RootSchema>;');
  });
});

describe('emitZod — primitives', () => {
  test('null', () => {
    expect(emitZod({ kind: 'null' }).source).toBe(wrap('z.null()'));
  });

  test('string', () => {
    expect(emitZod({ kind: 'string', nullable: false }).source).toBe(
      wrap('z.string()'),
    );
  });

  test('string nullable', () => {
    expect(emitZod({ kind: 'string', nullable: true }).source).toBe(
      wrap('z.string().nullable()'),
    );
  });

  test('number nullable', () => {
    expect(emitZod({ kind: 'number', nullable: true }).source).toBe(
      wrap('z.number().nullable()'),
    );
  });

  test('boolean', () => {
    expect(emitZod({ kind: 'boolean', nullable: false }).source).toBe(
      wrap('z.boolean()'),
    );
  });
});

describe('emitZod — array', () => {
  test('array of strings', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'string', nullable: false },
      nullable: false,
    };
    expect(emitZod(ir).source).toBe(wrap('z.array(z.string())'));
  });

  test('array nullable', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: true,
    };
    expect(emitZod(ir).source).toBe(wrap('z.array(z.number()).nullable()'));
  });

  test('array of nullable strings', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'string', nullable: true },
      nullable: false,
    };
    expect(emitZod(ir).source).toBe(wrap('z.array(z.string().nullable())'));
  });
});

describe('emitZod — object field modifiers (the .nullish() decision point)', () => {
  test('required + non-nullable → no chaining', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain('id: z.number(),');
    expect(source).not.toContain('id: z.number().');
  });

  test('required + nullable → .nullable()', () => {
    const fields = new Map<string, IRField>([
      [
        'avatar',
        { schema: { kind: 'string', nullable: true }, optional: false },
      ],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain('avatar: z.string().nullable(),');
  });

  test('optional + non-nullable → .optional()', () => {
    const fields = new Map<string, IRField>([
      [
        'nickname',
        { schema: { kind: 'string', nullable: false }, optional: true },
      ],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain('nickname: z.string().optional(),');
  });

  test('optional + nullable → .nullish() (the shorthand)', () => {
    const fields = new Map<string, IRField>([
      [
        'note',
        { schema: { kind: 'string', nullable: true }, optional: true },
      ],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain('note: z.string().nullish(),');
    // Should NOT use the chained .nullable().optional() form
    expect(source).not.toContain('.nullable().optional()');
  });
});

describe('emitZod — object', () => {
  test('flat object indents correctly', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      [
        'name',
        { schema: { kind: 'string', nullable: false }, optional: false },
      ],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain(
      'z.object({\n  id: z.number(),\n  name: z.string(),\n})',
    );
  });

  test('empty object', () => {
    const source = emitZod({
      kind: 'object',
      fields: new Map(),
      nullable: false,
    }).source;
    expect(source).toContain('z.object({})');
  });

  test('quoted key when not a safe identifier', () => {
    const fields = new Map<string, IRField>([
      [
        'my-key',
        { schema: { kind: 'string', nullable: false }, optional: false },
      ],
    ]);
    const source = emitZod({ kind: 'object', fields, nullable: false }).source;
    expect(source).toContain('"my-key": z.string(),');
  });
});

describe('emitZod — mixed (M1 cut)', () => {
  test('mixed root → z.unknown()', () => {
    expect(
      emitZod({ kind: 'mixed', observed: [], nullable: false }).source,
    ).toBe(wrap('z.unknown()'));
  });
});

describe('emitZod — nested', () => {
  test('array of objects indents correctly', () => {
    const inner: IRSchema = {
      kind: 'object',
      fields: new Map<string, IRField>([
        [
          'id',
          { schema: { kind: 'number', nullable: false }, optional: false },
        ],
      ]),
      nullable: false,
    };
    const ir: IRSchema = { kind: 'array', items: inner, nullable: false };
    const source = emitZod(ir).source;
    expect(source).toContain(
      'z.array(z.object({\n  id: z.number(),\n}))',
    );
  });
});
