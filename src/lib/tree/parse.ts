// Parses JSON text into a tree of nodes for the right-pane renderer.
//
// W1-Wed: naive — everything materialized as JS objects. Fine for small
// documents; replaced by the streaming spine + offset index in W3 so we can
// handle 500MB without OOM. Same discriminated-union result shape as
// format.ts and fetchUrl.ts.

export type TreeNode =
  | { kind: 'object'; key: string | null; path: string; children: TreeNode[] }
  | { kind: 'array'; key: string | null; path: string; children: TreeNode[] }
  | { kind: 'string'; key: string | null; path: string; value: string }
  | { kind: 'number'; key: string | null; path: string; value: number }
  | { kind: 'boolean'; key: string | null; path: string; value: boolean }
  | { kind: 'null'; key: string | null; path: string }
  // W3-Mon: stub variants for the streaming spine parser. Emitted when the
  // parser encounters a composite at depth >= MAX_SPINE_DEPTH; the subtree
  // is not materialized until the user expands it. byteStart/byteEnd point
  // into the original file so expansion can re-tokenize just that range.
  // parseToTree never emits these — they originate from parse-streaming.ts.
  | {
      kind: 'stub-object';
      key: string | null;
      path: string;
      byteStart: number;
      byteEnd: number;
      childCount: number;
    }
  | {
      kind: 'stub-array';
      key: string | null;
      path: string;
      byteStart: number;
      byteEnd: number;
      childCount: number;
    };

export type ParseTreeResult =
  | { ok: true; root: TreeNode }
  | { ok: false; error: ParseTreeError };

export type ParseTreeError = {
  message: string;
  line?: number;
  col?: number;
};

export function parseToTree(text: string): ParseTreeResult {
  if (text.trim() === '') {
    return { ok: false, error: { message: 'Empty input' } };
  }
  try {
    const value = JSON.parse(text);
    return { ok: true, root: build(value, null, '$') };
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, error: { message, ...locate(message, text) } };
  }
}

function build(value: unknown, key: string | null, path: string): TreeNode {
  if (value === null) return { kind: 'null', key, path };
  if (typeof value === 'string') return { kind: 'string', key, path, value };
  if (typeof value === 'number') return { kind: 'number', key, path, value };
  if (typeof value === 'boolean') return { kind: 'boolean', key, path, value };
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      key,
      path,
      children: value.map((v, i) => build(v, String(i), `${path}[${i}]`)),
    };
  }
  // typeof 'object' && !null && !array → plain object (JSON.parse only emits these)
  const obj = value as Record<string, unknown>;
  return {
    kind: 'object',
    key,
    path,
    children: Object.entries(obj).map(([k, v]) =>
      build(v, k, `${path}.${k}`),
    ),
  };
}

function locate(
  message: string,
  source: string,
): { line?: number; col?: number } {
  const lineColMatch = /\(line (\d+) column (\d+)\)/.exec(message);
  if (lineColMatch) {
    return { line: Number(lineColMatch[1]), col: Number(lineColMatch[2]) };
  }
  const posMatch = /position (\d+)/.exec(message);
  if (posMatch) {
    return positionToLineCol(source, Number(posMatch[1]));
  }
  return {};
}

function positionToLineCol(
  source: string,
  pos: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const stop = Math.min(pos, source.length);
  for (let i = 0; i < stop; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
