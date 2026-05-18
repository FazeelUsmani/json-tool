// Pure JSON transformations for the editor toolbar.
//
// Same shape as fetchUrl: discriminated-union result, no exceptions for
// expected failures (invalid JSON is a value, not a throw). Errors include
// `line` and `col` when extractable from the V8 parse error message — modern
// Node / Chrome emit "(line N column M)" directly; older messages emit
// "position N" which we convert by counting newlines.

export type FormatResult =
  | { ok: true; text: string }
  | { ok: false; error: FormatError };

export type FormatError = {
  kind: 'invalid-json';
  message: string;
  line?: number;
  col?: number;
};

export function formatJson(
  text: string,
  opts: { indent?: number } = {},
): FormatResult {
  const parsed = tryParse(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value, null, opts.indent ?? 2) };
}

export function minifyJson(text: string): FormatResult {
  const parsed = tryParse(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value) };
}

export function sortKeysJson(
  text: string,
  opts: { indent?: number } = {},
): FormatResult {
  const parsed = tryParse(text);
  if (!parsed.ok) return parsed;
  const sorted = sortKeysRecursive(parsed.value);
  return { ok: true, text: JSON.stringify(sorted, null, opts.indent ?? 2) };
}

// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: FormatError };

function tryParse(text: string): ParseResult {
  if (text.trim() === '') {
    return {
      ok: false,
      error: { kind: 'invalid-json', message: 'Empty input' },
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const message = (err as Error).message;
    return {
      ok: false,
      error: { kind: 'invalid-json', message, ...locate(message, text) },
    };
  }
}

function locate(
  message: string,
  source: string,
): { line?: number; col?: number } {
  // Modern Node / Chrome: "...in JSON at position 42 (line 1 column 6)"
  const lineColMatch = /\(line (\d+) column (\d+)\)/.exec(message);
  if (lineColMatch) {
    return { line: Number(lineColMatch[1]), col: Number(lineColMatch[2]) };
  }
  // Older message format: "...at position 42"
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
    if (source.charCodeAt(i) === 10 /* \n */) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function sortKeysRecursive(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Arrays keep their order — sorting array elements would change meaning.
    return value.map(sortKeysRecursive);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysRecursive(obj[key]);
    }
    return sorted;
  }
  return value;
}
