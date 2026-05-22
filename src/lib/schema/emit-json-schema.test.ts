import { describe, expect, test } from 'vitest';
import { emitJsonSchema } from './emit-json-schema';
import type { IRField, IRSchema } from './types';

// --- return shape contract ---

describe('emitJsonSchema — return shape', () => {
  test('returns both structured schema object and formatted source string', () => {
    const result = emitJsonSchema({ kind: 'null' });
    expect(typeof result.schema).toBe('object');
    expect(typeof result.source).toBe('string');
  });

  test('source is the schema JSON.stringified with 2-space indent', () => {
    const result = emitJsonSchema({ kind: 'string', nullable: false });
    expect(JSON.parse(result.source)).toEqual(result.schema);
    // 2-space indent inherent in the format; spot-check the first line break
    expect(result.source).toMatch(/^{\n {2}/);
  });

  test('schema has the draft-07 $schema header', () => {
    const result = emitJsonSchema({ kind: 'null' });
    expect(result.schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });
});

// --- primitives ---

describe('emitJsonSchema — primitives', () => {
  test('null root', () => {
    const { schema } = emitJsonSchema({ kind: 'null' });
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'null',
    });
  });

  test('string (not nullable) → type: string', () => {
    const { schema } = emitJsonSchema({ kind: 'string', nullable: false });
    expect(schema.type).toBe('string');
  });

  test('string (nullable) → type: [string, null]', () => {
    const { schema } = emitJsonSchema({ kind: 'string', nullable: true });
    expect(schema.type).toEqual(['string', 'null']);
  });

  test('number (nullable) → type: [number, null]', () => {
    const { schema } = emitJsonSchema({ kind: 'number', nullable: true });
    expect(schema.type).toEqual(['number', 'null']);
  });

  test('boolean (not nullable) → type: boolean', () => {
    const { schema } = emitJsonSchema({ kind: 'boolean', nullable: false });
    expect(schema.type).toBe('boolean');
  });
});

// --- array ---

describe('emitJsonSchema — array', () => {
  test('array of numbers', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: false,
    };
    const { schema } = emitJsonSchema(ir);
    expect(schema).toMatchObject({
      type: 'array',
      items: { type: 'number' },
    });
  });

  test('array nullable + items nullable propagate independently', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'string', nullable: true },
      nullable: true,
    };
    const { schema } = emitJsonSchema(ir);
    expect(schema.type).toEqual(['array', 'null']);
    expect((schema.items as Record<string, unknown>).type).toEqual([
      'string',
      'null',
    ]);
  });

  test('array of arrays', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: {
        kind: 'array',
        items: { kind: 'number', nullable: false },
        nullable: false,
      },
      nullable: false,
    };
    const { schema } = emitJsonSchema(ir);
    expect(schema).toMatchObject({
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'number' },
      },
    });
  });
});

// --- object ---

describe('emitJsonSchema — object', () => {
  test('flat object with required fields lists them in required[]', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      ['name', { schema: { kind: 'string', nullable: false }, optional: false }],
    ]);
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields,
      nullable: false,
    });
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
      required: ['id', 'name'],
    });
  });

  test('optional field excluded from required[]', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      ['nickname', { schema: { kind: 'string', nullable: false }, optional: true }],
    ]);
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields,
      nullable: false,
    });
    expect(schema.required).toEqual(['id']);
    expect((schema.properties as Record<string, unknown>).nickname).toEqual({
      type: 'string',
    });
  });

  test('all-optional object omits required key entirely (JSON Schema convention)', () => {
    const fields = new Map<string, IRField>([
      ['nick', { schema: { kind: 'string', nullable: false }, optional: true }],
    ]);
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields,
      nullable: false,
    });
    expect(schema.required).toBeUndefined();
  });

  test('nullable field handled at schema level, optional bit separate', () => {
    const fields = new Map<string, IRField>([
      ['avatar', { schema: { kind: 'string', nullable: true }, optional: false }],
    ]);
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields,
      nullable: false,
    });
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.avatar.type).toEqual(['string', 'null']);
    // present in all samples but value sometimes null → required + nullable
    expect(schema.required).toEqual(['avatar']);
  });

  test('empty object → properties: {} + no required', () => {
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields: new Map(),
      nullable: false,
    });
    expect(schema).toMatchObject({ type: 'object', properties: {} });
    expect(schema.required).toBeUndefined();
  });
});

// --- mixed (M1 cut) ---

describe('emitJsonSchema — mixed kind', () => {
  test('emits empty schema with description, no type', () => {
    const ir: IRSchema = {
      kind: 'mixed',
      observed: [
        { kind: 'string', nullable: false },
        { kind: 'number', nullable: false },
      ],
      nullable: false,
    };
    const { schema } = emitJsonSchema(ir);
    // No `type` — absent type means "allow any value" in JSON Schema
    expect(schema.type).toBeUndefined();
    expect(typeof schema.description).toBe('string');
    expect(schema.description).toContain('Mixed types');
  });

  test('mixed field inside an object propagates to that property only', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      [
        'value',
        {
          schema: {
            kind: 'mixed',
            observed: [
              { kind: 'string', nullable: false },
              { kind: 'number', nullable: false },
            ],
            nullable: false,
          },
          optional: false,
        },
      ],
    ]);
    const { schema } = emitJsonSchema({
      kind: 'object',
      fields,
      nullable: false,
    });
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.id.type).toBe('number');
    expect(properties.value.type).toBeUndefined();
    expect(properties.value.description).toContain('Mixed types');
    expect(schema.required).toEqual(['id', 'value']);
  });
});

// --- composite (the canonical NDJSON / telemetry shape) ---

describe('emitJsonSchema — array-of-objects (canonical NDJSON shape)', () => {
  test('telemetry-style line emits validatable schema', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: {
        kind: 'object',
        fields: new Map<string, IRField>([
          [
            'timestamp',
            { schema: { kind: 'string', nullable: false }, optional: false },
          ],
          [
            'event',
            { schema: { kind: 'string', nullable: true }, optional: true },
          ],
          [
            'count',
            { schema: { kind: 'number', nullable: false }, optional: false },
          ],
        ]),
        nullable: false,
      },
      nullable: false,
    };
    const { schema } = emitJsonSchema(ir);
    expect(schema).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string' },
          event: { type: ['string', 'null'] },
          count: { type: 'number' },
        },
        required: ['timestamp', 'count'],
      },
    });
  });
});
