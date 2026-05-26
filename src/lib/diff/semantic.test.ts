import { describe, expect, it } from 'vitest';
import { parseToTree } from '@/lib/tree/parse';
import { diffTrees, type DiffOp } from './semantic';

// Helper: parse a JSON literal into a TreeNode root.
function t(literal: string) {
  const r = parseToTree(literal);
  if (!r.ok) throw new Error(`parseToTree failed: ${JSON.stringify(r.error)}`);
  return r.root;
}

function opAt(ops: DiffOp[], pointer: string): DiffOp | undefined {
  return ops.find((op) => op.pointer === pointer);
}

describe('diffTrees — same-value categories', () => {
  it('identical primitives emit `same` op at root', () => {
    const r = diffTrees(t('42'), t('42'));
    expect(r.ops).toEqual([{ kind: 'same', pointer: '', value: 42 }]);
    expect(r.summary.same).toBe(1);
  });

  it('identical objects emit `same` ops at every leaf', () => {
    const r = diffTrees(t('{"a":1,"b":"x"}'), t('{"a":1,"b":"x"}'));
    expect(r.summary.same).toBe(2);
    expect(r.summary.valueChanged).toBe(0);
    expect(opAt(r.ops, '/a')).toMatchObject({ kind: 'same', value: 1 });
    expect(opAt(r.ops, '/b')).toMatchObject({ kind: 'same', value: 'x' });
  });
});

describe('diffTrees — value-changed', () => {
  it('emits value-changed for differing primitives of the same type', () => {
    const r = diffTrees(t('{"a":1}'), t('{"a":2}'));
    expect(r.summary.valueChanged).toBe(1);
    expect(opAt(r.ops, '/a')).toEqual({
      kind: 'value-changed',
      pointer: '/a',
      before: 1,
      after: 2,
    });
  });

  it('emits value-changed for string differences', () => {
    const r = diffTrees(t('{"name":"alice"}'), t('{"name":"bob"}'));
    expect(r.summary.valueChanged).toBe(1);
    expect(opAt(r.ops, '/name')).toMatchObject({
      kind: 'value-changed',
      before: 'alice',
      after: 'bob',
    });
  });
});

describe('diffTrees — type-changed', () => {
  it('emits type-changed when a primitive type flips (string → number)', () => {
    const r = diffTrees(t('{"x":"7"}'), t('{"x":7}'));
    expect(r.summary.typeChanged).toBe(1);
    expect(opAt(r.ops, '/x')).toMatchObject({
      kind: 'type-changed',
      beforeType: 'string',
      afterType: 'number',
      before: '7',
      after: 7,
    });
  });

  it('emits type-changed when a composite shape flips (object → array)', () => {
    const r = diffTrees(t('{"items":{"0":"a"}}'), t('{"items":["a"]}'));
    expect(r.summary.typeChanged).toBe(1);
    const op = opAt(r.ops, '/items');
    expect(op).toBeDefined();
    expect(op?.kind).toBe('type-changed');
    if (op?.kind === 'type-changed') {
      expect(op.beforeType).toBe('object');
      expect(op.afterType).toBe('array');
    }
  });
});

describe('diffTrees — added / removed (objects)', () => {
  it('emits `added` for keys only in after', () => {
    const r = diffTrees(t('{"a":1}'), t('{"a":1,"b":2}'));
    expect(r.summary.added).toBe(1);
    expect(opAt(r.ops, '/b')).toEqual({
      kind: 'added',
      pointer: '/b',
      value: 2,
    });
  });

  it('emits `removed` for keys only in before', () => {
    const r = diffTrees(t('{"a":1,"b":2}'), t('{"a":1}'));
    expect(r.summary.removed).toBe(1);
    expect(opAt(r.ops, '/b')).toEqual({
      kind: 'removed',
      pointer: '/b',
      value: 2,
    });
  });
});

describe('diffTrees — added / removed (arrays)', () => {
  it('emits `added` for extra trailing array elements', () => {
    const r = diffTrees(t('[1,2]'), t('[1,2,3]'));
    expect(r.summary.added).toBe(1);
    expect(opAt(r.ops, '/2')).toEqual({
      kind: 'added',
      pointer: '/2',
      value: 3,
    });
  });

  it('emits `removed` for missing trailing array elements', () => {
    const r = diffTrees(t('[1,2,3]'), t('[1,2]'));
    expect(r.summary.removed).toBe(1);
    expect(opAt(r.ops, '/2')).toEqual({
      kind: 'removed',
      pointer: '/2',
      value: 3,
    });
  });
});

describe('diffTrees — deeply nested changes', () => {
  it('reports value-changed deep in an object tree with correct pointer', () => {
    const r = diffTrees(
      t('{"a":{"b":{"c":1}}}'),
      t('{"a":{"b":{"c":2}}}'),
    );
    expect(r.summary.valueChanged).toBe(1);
    expect(opAt(r.ops, '/a/b/c')).toMatchObject({
      kind: 'value-changed',
      before: 1,
      after: 2,
    });
  });
});

describe('diffTrees — RFC 6901 escaping in pointers', () => {
  it('escapes `/` in keys as `~1` in pointer segments', () => {
    const r = diffTrees(t('{"a/b":1}'), t('{"a/b":2}'));
    expect(opAt(r.ops, '/a~1b')).toMatchObject({
      kind: 'value-changed',
      before: 1,
      after: 2,
    });
  });

  it('escapes `~` in keys as `~0` (and orders escapes correctly)', () => {
    const r = diffTrees(t('{"~weird":1}'), t('{"~weird":2}'));
    expect(opAt(r.ops, '/~0weird')).toMatchObject({
      kind: 'value-changed',
      before: 1,
      after: 2,
    });
  });
});

describe('diffTrees — stub handling (parseToTree never emits these but the diff lib must)', () => {
  it('emits stub-skipped when both sides are stubs at the same position', () => {
    const beforeRoot = {
      kind: 'object' as const,
      id: '',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object' as const,
          id: '/big',
          key: 'big',
          path: '$.big',
          byteStart: 0,
          byteEnd: 100,
          childCount: 5,
          preview: [],
        },
      ],
    };
    const afterRoot = {
      kind: 'object' as const,
      id: '',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object' as const,
          id: '/big',
          key: 'big',
          path: '$.big',
          byteStart: 0,
          byteEnd: 100,
          childCount: 5,
          preview: [],
        },
      ],
    };
    const r = diffTrees(beforeRoot, afterRoot);
    expect(r.summary.stubSkipped).toBe(1);
    expect(opAt(r.ops, '/big')).toMatchObject({
      kind: 'stub-skipped',
      side: 'both',
    });
  });

  it('emits stub-skipped with side="before" when only before is a stub', () => {
    const beforeRoot = {
      kind: 'object' as const,
      id: '',
      key: null,
      path: '$',
      children: [
        {
          kind: 'stub-object' as const,
          id: '/big',
          key: 'big',
          path: '$.big',
          byteStart: 0,
          byteEnd: 100,
          childCount: 5,
          preview: [],
        },
      ],
    };
    const afterRoot = t('{"big":{"x":1}}');
    const r = diffTrees(beforeRoot, afterRoot);
    expect(opAt(r.ops, '/big')).toMatchObject({
      kind: 'stub-skipped',
      side: 'before',
    });
  });
});

describe('diffTrees — combined realistic case', () => {
  it('handles a mixed payload (added + removed + value-changed + same)', () => {
    const before = t(
      '{"id":1,"name":"alice","plan":"pro","tags":["a","b"]}',
    );
    const after = t('{"id":1,"name":"alice","plan":"basic","tags":["a","b","c"],"email":"a@x"}');
    const r = diffTrees(before, after);
    // /id same, /name same, /plan value-changed, /tags/0 same,
    // /tags/1 same, /tags/2 added, /email added.
    expect(r.summary.same).toBe(4); // id, name, tags/0, tags/1
    expect(r.summary.valueChanged).toBe(1); // plan
    expect(r.summary.added).toBe(2); // tags/2, email
    expect(r.summary.removed).toBe(0);
    expect(opAt(r.ops, '/plan')).toMatchObject({
      kind: 'value-changed',
      before: 'pro',
      after: 'basic',
    });
    expect(opAt(r.ops, '/email')).toMatchObject({
      kind: 'added',
      value: 'a@x',
    });
  });
});
