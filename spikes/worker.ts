/// <reference lib="webworker" />
//
// Day-1 spike worker. Runs the 4-part test (PLAN.MD Week 1 Mon) for either
// parser. Skeleton intentionally short — replace string-search-based offset
// recovery with a parser-native approach once we know which library to ship.

// stream-json branch removed 2026-05-25 — @streamparser/json won the
// day-1 spike + the unused dep was pruned. The kind enum is kept for
// historical clarity in case anyone wants to re-introduce alternative
// parsers later.
type ParserKind = 'streamparser';
type RunBuiltin = { type: 'run-builtin'; parser: ParserKind };
type RunFile = { type: 'run-file'; parser: ParserKind; file: File };
type Msg = RunBuiltin | RunFile;

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', async (e: MessageEvent<Msg>) => {
  self.postMessage({ type: 'reset' });
  try {
    if (e.data.type === 'run-builtin') {
      await runBuiltin(e.data.parser);
    } else {
      await runFile(e.data.parser, e.data.file);
    }
  } catch (err) {
    emit('(a) parser import / boot', 'fail', String((err as Error).stack ?? err));
  } finally {
    self.postMessage({ type: 'done' });
  }
});

async function runBuiltin(parser: ParserKind) {
  const ascii = JSON.stringify({
    users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    events: [{ ts: 1000, kind: 'login' }, { ts: 2000, kind: 'logout' }],
  });
  await runOne(parser, 'ASCII baseline', new TextEncoder().encode(ascii));

  const utf8 = JSON.stringify({
    emoji: '👨‍👩‍👧‍👦 family — multi-byte at boundary 🎉',
    cjk: '你好世界 日本語テキスト 한국어',
    mixed: 'café — naïve façade ñ',
    nested: [{ msg: '🇯🇵 done' }, { msg: 'résumé' }],
  });
  await runOne(parser, 'UTF-8 (emoji + CJK)', new TextEncoder().encode(utf8));
}

async function runFile(parser: ParserKind, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await runOne(parser, `File: ${file.name} (${file.size.toLocaleString()} B)`, bytes);
}

// ---------------------------------------------------------------------------

type Offset = { path: string; byteStart: number; byteEnd: number };
type CaptureResult = { offsets: Offset[]; misses: string[]; fired: number };

async function runOne(parser: ParserKind, label: string, bytes: Uint8Array) {
  // (a) Bundling — if the dynamic import below resolves, the bundler is happy.
  let result: CaptureResult;
  try {
    // Only @streamparser/json remains since the day-1 decision. Switch
    // is kept as a single-arm match for future-extension clarity.
    if (parser !== 'streamparser') throw new Error(`unknown parser: ${parser}`);
    result = await captureWithStreamparser(bytes);
  } catch (err) {
    emit(`${label} — (a)/(b) parser failed`, 'fail', String((err as Error).stack ?? err));
    return;
  }

  const { offsets, misses, fired } = result;

  // (b) Did we capture any offsets? Three failure modes worth distinguishing:
  //  - fired === 0:      parser never fired onValue for top-level — parser issue.
  //  - misses > 0:       parser fired but string-search couldn't locate values
  //                      in source. Expected for formatted fixtures; production
  //                      must use Tokenizer.onToken for true byte offsets.
  //  - offsets.length > 0 && misses === 0: clean pass.
  if (offsets.length === 0) {
    if (fired === 0) {
      emit(
        `${label} — (b) offset capture`,
        'fail',
        `Parser fired 0 top-level onValue events. Either the input isn't a JSON object/array with top-level children, or path matching failed. Check fixture shape.`,
      );
    } else {
      emit(
        `${label} — (b) offset capture`,
        'fail',
        `Parser fired onValue for ${fired} top-level child(ren) [${misses.join(', ')}] but the spike's string-search offset recovery couldn't locate ANY of them in source. ` +
        `EXPECTED for fixtures with whitespace — JSON.stringify(value) produces compact form, source has formatting, indexOf misses. ` +
        `This is the spike doing its job: production code must use @streamparser/json's Tokenizer.onToken (per-token byte offsets) rather than high-level onValue + string-search. ` +
        `Day-1 decision still stands: parser locked = @streamparser/json. Skipping (c)/(d) since no offsets to test.`,
      );
    }
    return;
  }

  // Partial success — some captured, some missed.
  const captureNote = misses.length > 0
    ? `Captured ${offsets.length} of ${fired} (missed: ${misses.join(', ')}). String-search is unreliable on formatted JSON; production needs Tokenizer.onToken.`
    : `Captured ${offsets.length} top-level child offset(s).`;
  emit(
    `${label} — (a) bundle + (b) offsets`,
    'pass',
    `${captureNote}\n${offsets.map((o) => `  ${o.path}: bytes ${o.byteStart}..${o.byteEnd}`).join('\n')}`,
  );

  // (c) Slice round-trip — slice each captured range, JSON.parse, compare with
  //     the value at that path in JSON.parse(whole).
  const expected = JSON.parse(new TextDecoder().decode(bytes));
  const isArr = Array.isArray(expected);
  const sliceFailures: string[] = [];
  for (const o of offsets) {
    const slice = bytes.subarray(o.byteStart, o.byteEnd);
    const sliceText = new TextDecoder('utf-8', { fatal: true }).decode(slice);
    let parsed: unknown;
    try {
      parsed = JSON.parse(sliceText);
    } catch (err) {
      sliceFailures.push(`${o.path}: parse error — ${(err as Error).message}\n  slice: ${JSON.stringify(sliceText.slice(0, 100))}`);
      continue;
    }
    const expectedValue = isArr
      ? (expected as unknown[])[parseInt(o.path.replace(/[^\d]/g, ''), 10)]
      : (expected as Record<string, unknown>)[o.path];
    if (JSON.stringify(parsed) !== JSON.stringify(expectedValue)) {
      sliceFailures.push(`${o.path}: value mismatch\n  got:      ${JSON.stringify(parsed).slice(0, 100)}\n  expected: ${JSON.stringify(expectedValue).slice(0, 100)}`);
    }
  }
  emit(
    `${label} — (c) Blob.slice round-trip`,
    sliceFailures.length === 0 ? 'pass' : 'fail',
    sliceFailures.length === 0
      ? `All ${offsets.length} slices parsed and matched their source values.`
      : `${sliceFailures.length}/${offsets.length} failed:\n${sliceFailures.join('\n')}`,
  );

  // (d) UTF-8 boundary — each slice must be valid UTF-8 (no mid-character cuts).
  const utf8Failures: string[] = [];
  for (const o of offsets) {
    const slice = bytes.subarray(o.byteStart, o.byteEnd);
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(slice);
    } catch {
      utf8Failures.push(`${o.path}: invalid UTF-8 at byte offset ${o.byteStart}`);
    }
  }
  emit(
    `${label} — (d) UTF-8 boundary safety`,
    utf8Failures.length === 0 ? 'pass' : 'fail',
    utf8Failures.length === 0
      ? `All ${offsets.length} slices decode as valid UTF-8.`
      : utf8Failures.join('\n'),
  );
}

// ---------------------------------------------------------------------------
// @streamparser/json — uses onValue + string-search for offset recovery.
//
// FIXME for the real implementation: replace string-search with the library's
// Tokenizer onToken callback (exposes a true byte offset per token) so we don't
// scan the source for every value. String-search is fine for spike fixtures
// (<50MB) but O(N) per value — would blow up on the 500MB target.
//
async function captureWithStreamparser(bytes: Uint8Array): Promise<CaptureResult> {
  const { JSONParser } = await import('@streamparser/json');
  const offsets: Offset[] = [];
  const misses: string[] = [];
  let fired = 0;
  const sourceText = new TextDecoder().decode(bytes);
  const parser = new JSONParser({ paths: ['$.*'], keepStack: true });

  parser.onValue = ({ value, key, stack }) => {
    if (stack.length !== 1) return;
    fired++;
    const path = typeof key === 'string' ? key : `[${key}]`;
    const serialized = JSON.stringify(value);
    const idx = sourceText.indexOf(serialized);
    if (idx === -1) {
      misses.push(path);
      return;
    }
    const byteStart = new TextEncoder().encode(sourceText.slice(0, idx)).byteLength;
    const byteEnd = byteStart + new TextEncoder().encode(serialized).byteLength;
    offsets.push({ path, byteStart, byteEnd });
  };

  // NOTE: do NOT call parser.end() here. JSONParser's TokenParser auto-fires
  // tokenizer.end() the moment a complete top-level value finishes; a second
  // end() lands in the tokenizer's "already ENDED" branch which throws.
  // Catching the error would mask genuinely-truncated input — better to skip
  // the call entirely when we know the input is whole. For true streaming
  // (chunked writes where the last chunk may be partial), wrap end() in a
  // try/catch that distinguishes the two cases.
  parser.write(bytes);
  return { offsets, misses, fired };
}

function emit(caseId: string, status: 'pass' | 'fail', details: string) {
  self.postMessage({ type: 'result', caseId, status, details });
}
