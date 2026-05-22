import { describe, expect, test } from 'vitest';
import { emitTypeScript } from './emit-typescript';
import type { IRField, IRSchema } from './types';

describe('emitTypeScript — primitives', () => {
  test('null root', () => {
    expect(emitTypeScript({ kind: 'null' }).source).toBe(
      'export type Root = null;\n',
    );
  });

  test('string', () => {
    expect(emitTypeScript({ kind: 'string', nullable: false }).source).toBe(
      'export type Root = string;\n',
    );
  });

  test('string nullable', () => {
    expect(emitTypeScript({ kind: 'string', nullable: true }).source).toBe(
      'export type Root = string | null;\n',
    );
  });

  test('number nullable', () => {
    expect(emitTypeScript({ kind: 'number', nullable: true }).source).toBe(
      'export type Root = number | null;\n',
    );
  });

  test('boolean (not nullable)', () => {
    expect(emitTypeScript({ kind: 'boolean', nullable: false }).source).toBe(
      'export type Root = boolean;\n',
    );
  });
});

describe('emitTypeScript — array', () => {
  test('array of strings', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'string', nullable: false },
      nullable: false,
    };
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = Array<string>;\n',
    );
  });

  test('array nullable', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'number', nullable: false },
      nullable: true,
    };
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = Array<number> | null;\n',
    );
  });

  test('array of nullable strings', () => {
    const ir: IRSchema = {
      kind: 'array',
      items: { kind: 'string', nullable: true },
      nullable: false,
    };
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = Array<string | null>;\n',
    );
  });
});

describe('emitTypeScript — object', () => {
  test('flat object with required fields', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      ['name', { schema: { kind: 'string', nullable: false }, optional: false }],
    ]);
    const ir: IRSchema = { kind: 'object', fields, nullable: false };
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = {\n  id: number;\n  name: string;\n};\n',
    );
  });

  test('optional field uses ?:', () => {
    const fields = new Map<string, IRField>([
      ['id', { schema: { kind: 'number', nullable: false }, optional: false }],
      [
        'nickname',
        { schema: { kind: 'string', nullable: false }, optional: true },
      ],
    ]);
    const source = emitTypeScript({
      kind: 'object',
      fields,
      nullable: false,
    }).source;
    expect(source).toContain('id: number;');
    expect(source).toContain('nickname?: string;');
  });

  test('nullable field uses | null', () => {
    const fields = new Map<string, IRField>([
      [
        'avatar',
        { schema: { kind: 'string', nullable: true }, optional: false },
      ],
    ]);
    const source = emitTypeScript({
      kind: 'object',
      fields,
      nullable: false,
    }).source;
    expect(source).toContain('avatar: string | null;');
  });

  test('optional + nullable composes as `?: T | null`', () => {
    const fields = new Map<string, IRField>([
      [
        'note',
        { schema: { kind: 'string', nullable: true }, optional: true },
      ],
    ]);
    const source = emitTypeScript({
      kind: 'object',
      fields,
      nullable: false,
    }).source;
    expect(source).toContain('note?: string | null;');
  });

  test('quoted key when not a safe identifier', () => {
    const fields = new Map<string, IRField>([
      [
        'my-key',
        { schema: { kind: 'string', nullable: false }, optional: false },
      ],
    ]);
    const source = emitTypeScript({
      kind: 'object',
      fields,
      nullable: false,
    }).source;
    expect(source).toContain('"my-key": string;');
  });

  test('empty object', () => {
    expect(
      emitTypeScript({
        kind: 'object',
        fields: new Map(),
        nullable: false,
      }).source,
    ).toBe('export type Root = {};\n');
  });

  test('empty object nullable', () => {
    expect(
      emitTypeScript({
        kind: 'object',
        fields: new Map(),
        nullable: true,
      }).source,
    ).toBe('export type Root = {} | null;\n');
  });
});

describe('emitTypeScript — mixed (M1 cut)', () => {
  test('mixed root → unknown', () => {
    expect(
      emitTypeScript({
        kind: 'mixed',
        observed: [],
        nullable: false,
      }).source,
    ).toBe('export type Root = unknown;\n');
  });

  test('mixed field gets JSDoc comment above it', () => {
    const fields = new Map<string, IRField>([
      [
        'value',
        {
          schema: { kind: 'mixed', observed: [], nullable: false },
          optional: false,
        },
      ],
    ]);
    const source = emitTypeScript({
      kind: 'object',
      fields,
      nullable: false,
    }).source;
    expect(source).toContain(
      '/** Mixed types observed during inference — refine manually */',
    );
    expect(source).toContain('value: unknown;');
  });
});

describe('emitTypeScript — nested', () => {
  test('array of objects', () => {
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
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = Array<{\n  id: number;\n}>;\n',
    );
  });

  test('nested objects indent correctly', () => {
    const inner: IRSchema = {
      kind: 'object',
      fields: new Map<string, IRField>([
        [
          'b',
          { schema: { kind: 'string', nullable: false }, optional: false },
        ],
      ]),
      nullable: false,
    };
    const ir: IRSchema = {
      kind: 'object',
      fields: new Map<string, IRField>([
        ['a', { schema: inner, optional: false }],
      ]),
      nullable: false,
    };
    expect(emitTypeScript(ir).source).toBe(
      'export type Root = {\n  a: {\n    b: string;\n  };\n};\n',
    );
  });
});
