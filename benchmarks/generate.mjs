#!/usr/bin/env node
// Multi-shape JSON / NDJSON fixture generator for the huge-JSON wedge.
//
// Usage:
//   node benchmarks/generate.mjs --shape <name> --size <n>
//   node benchmarks/generate.mjs --all-dev
//   node benchmarks/generate.mjs --help
//
// Per W3-Fri matrix in PLAN.MD. The `size` argument is shape-specific —
// element count for most shapes, depth for deep-nested, MB-per-value for
// long-strings. See `--help` for the exact unit.
//
// Output: benchmarks/corpus/<shape>-<size>.<ext>  (corpus/ is gitignored)
//
// --all-dev produces a ~50MB version of every shape for local sanity. GB-
// scale variants only run when explicitly requested via large `--size`.

import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { argv, exit, stderr } from 'node:process';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Shape registry. `unit` documents what `--size` means for the user-facing
// help; `dev` is the size used by --all-dev (calibrated to ≈50MB output
// where possible — depth-shaped fixtures don't have a meaningful 50MB).

const SHAPES = {
  'flat-array':          { ext: 'json',   unit: 'elements',     dev: 600_000,    gen: flatArrayGen },
  'deep-nested':         { ext: 'json',   unit: 'depth levels', dev: 1_000,      gen: deepNestedGen },
  'wide-object':         { ext: 'json',   unit: 'keys',         dev: 3_000_000,  gen: wideObjectGen },
  'giant-array':         { ext: 'json',   unit: 'elements',     dev: 15_000_000, gen: giantArrayGen },
  'unicode-heavy':       { ext: 'json',   unit: 'entries',      dev: 50_000,     gen: unicodeHeavyGen },
  'long-strings':        { ext: 'json',   unit: 'MB per value', dev: 50,         gen: longStringsGen },
  'telemetry':           { ext: 'json',   unit: 'events',       dev: 170_000,    gen: telemetryGen },
  'pathological':        { ext: 'json',   unit: 'entries',      dev: 1_000,      gen: pathologicalGen },
  'telemetry.ndjson':    { ext: 'ndjson', unit: 'lines',        dev: 170_000,    gen: telemetryNdjsonGen },
  'llm-training.ndjson': { ext: 'ndjson', unit: 'lines',        dev: 100_000,    gen: llmTrainingGen },
};

// ---------------------------------------------------------------------------
// CLI

const args = parseArgs(argv.slice(2));
if (args.help) { printHelp(); exit(0); }

if (args['all-dev']) {
  mkdirSync('benchmarks/corpus', { recursive: true });
  for (const [name, def] of Object.entries(SHAPES)) {
    await runShape(name, def.dev);
  }
  exit(0);
}

if (!args.shape || !SHAPES[args.shape]) {
  stderr.write(`error: --shape required, one of: ${Object.keys(SHAPES).join(', ')}\n`);
  exit(1);
}
if (!Number.isFinite(args.size) || args.size <= 0) {
  stderr.write(`error: --size <positive number> required (see --help for per-shape units)\n`);
  exit(1);
}

mkdirSync('benchmarks/corpus', { recursive: true });
await runShape(args.shape, args.size);

// ---------------------------------------------------------------------------

function parseArgs(av) {
  const out = {};
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--all-dev') out['all-dev'] = true;
    else if (a === '--shape') out.shape = av[++i];
    else if (a === '--size') out.size = Number(av[++i]);
    else { stderr.write(`error: unknown arg ${a}\n`); exit(1); }
  }
  return out;
}

function printHelp() {
  const rows = Object.entries(SHAPES).map(
    ([name, def]) => `  ${name.padEnd(22)} --size <${def.unit}>`
  ).join('\n');
  process.stdout.write(
`Multi-shape JSON/NDJSON fixture generator.

Usage:
  node benchmarks/generate.mjs --shape <name> --size <n>
  node benchmarks/generate.mjs --all-dev
  node benchmarks/generate.mjs --help

Shapes (unit interpreted differently per shape):
${rows}

--all-dev generates a ~50MB version of every shape into benchmarks/corpus/.
Use larger --size on individual shapes for GB-scale stressors.
`);
}

async function runShape(shape, size) {
  const def = SHAPES[shape];
  // Shape keys like 'telemetry.ndjson' carry the format in the name for
  // user clarity at the CLI; strip it when building the filename so we
  // don't end up with `telemetry.ndjson-100.ndjson`. The `.ext` from the
  // registry is the authoritative file extension.
  const stem = shape.endsWith('.ndjson') ? shape.slice(0, -'.ndjson'.length) : shape;
  const outPath = join('benchmarks/corpus', `${stem}-${size}.${def.ext}`);
  stderr.write(`generating ${outPath}…\n`);
  const stream = createWriteStream(outPath);
  await def.gen(stream, size);
  stream.end();
  await once(stream, 'finish');
  stderr.write(`  done: ${outPath}\n`);
}

// Backpressure-aware write helper. For large outputs (10M+ elements) the
// default 16KB high-water mark fills fast; awaiting drain keeps RSS flat.
async function w(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

// ---------------------------------------------------------------------------
// Shapes

async function flatArrayGen(stream, n) {
  // Same per-record shape as the pre-refactor dev-fixture: 12 FlatRows per
  // record (object open/close + 5 leaves + meta with tags array + score).
  await w(stream, '[');
  for (let i = 0; i < n; i++) {
    const obj = {
      id: i,
      name: `item-${i}`,
      active: i % 2 === 0,
      meta: {
        tags: [`t${i % 7}`, `t${i % 13}`],
        score: Math.round(((i * 2654435761) >>> 0) / 4294967.295) / 10,
      },
    };
    await w(stream, (i === 0 ? '' : ',') + JSON.stringify(obj));
  }
  await w(stream, ']');
}

async function deepNestedGen(stream, depth) {
  // {"l":{"l":{...{"leaf":null}...}}} — built as a string since the whole
  // structure is small (~5 bytes/level). The stressor is parser stack depth,
  // not file size.
  const open = '{"l":'.repeat(depth);
  const close = '}'.repeat(depth);
  await w(stream, open + '"leaf"' + close);
}

async function wideObjectGen(stream, keys) {
  await w(stream, '{');
  for (let i = 0; i < keys; i++) {
    await w(stream, (i === 0 ? '' : ',') + `"k_${i}":${i}`);
  }
  await w(stream, '}');
}

async function giantArrayGen(stream, n) {
  await w(stream, '[');
  // Buffer in chunks of 10K integers to amortize the write overhead while
  // staying well under Node's default high-water mark per write call.
  const CHUNK = 10_000;
  for (let base = 0; base < n; base += CHUNK) {
    const end = Math.min(base + CHUNK, n);
    let buf = '';
    for (let i = base; i < end; i++) {
      buf += (i === 0 ? '' : ',') + i;
    }
    await w(stream, buf);
  }
  await w(stream, ']');
}

async function unicodeHeavyGen(stream, n) {
  // Mixed-script payloads at varying byte offsets — a streaming parser that
  // chunks naively will land mid-multibyte-character frequently here. The
  // emoji include ZWJ sequences (family) which span many code points per
  // glyph. The escape-sequence field has both literal escapes and \uXXXX
  // forms to exercise both decode paths.
  const EMOJI = '🎉 👨‍👩‍👧 ñ café 你好世界 — 🌍🚀';
  const CJK = '日本語テキスト中文文字한국어';
  const CYR = 'Привет мир, как дела';
  const ARA = 'مرحبا بالعالم';
  await w(stream, '[');
  for (let i = 0; i < n; i++) {
    const obj = {
      id: i,
      // pad puts the multi-byte chars at non-aligned offsets per record.
      pad: 'x'.repeat(i % 17),
      text: `${EMOJI} #${i} ${CJK}`,
      author: i % 3 === 0 ? CYR : i % 3 === 1 ? ARA : 'Алиса',
      caption: '🇯🇵 trip to Tōkyō — café au lait',
      escaped: `quote: "x" backslash: \\ newline:\nhex:  é中`,
    };
    await w(stream, (i === 0 ? '' : ',') + JSON.stringify(obj));
  }
  await w(stream, ']');
}

async function longStringsGen(stream, mbPerValue) {
  // A handful of keys, each holding a value that's `mbPerValue` MB of a
  // single character. Stressor for stream-parsers that allocate per-value
  // buffers instead of yielding chunks.
  const KEYS = ['a', 'b', 'c'];
  const bytesPerChunk = 64 * 1024; // 64KB write chunks
  const totalBytesPerValue = mbPerValue * 1024 * 1024;
  await w(stream, '{');
  for (let k = 0; k < KEYS.length; k++) {
    await w(stream, (k === 0 ? '' : ',') + `"${KEYS[k]}":"`);
    const fillChar = KEYS[k];
    const filler = fillChar.repeat(bytesPerChunk);
    let written = 0;
    while (written + bytesPerChunk <= totalBytesPerValue) {
      await w(stream, filler);
      written += bytesPerChunk;
    }
    if (written < totalBytesPerValue) {
      await w(stream, fillChar.repeat(totalBytesPerValue - written));
    }
    await w(stream, '"');
  }
  await w(stream, '}');
}

async function telemetryGen(stream, n) {
  await w(stream, '{"events":[');
  for (let i = 0; i < n; i++) {
    await w(stream, (i === 0 ? '' : ',') + JSON.stringify(telemetryEvent(i)));
  }
  await w(stream, ']}');
}

async function telemetryNdjsonGen(stream, n) {
  for (let i = 0; i < n; i++) {
    await w(stream, JSON.stringify(telemetryEvent(i)) + '\n');
  }
}

function telemetryEvent(i) {
  const KINDS = ['click', 'view', 'submit', 'error', 'load', 'logout', 'login'];
  // Sparse fields: every 5th event drops `user.plan`; every 7th drops `tags`;
  // every 11th has `error_detail` populated. Realistic shape for log-style
  // payloads where not all events carry the same keys.
  const ev = {
    timestamp: new Date(1700000000000 + i * 137).toISOString(),
    request_id: `req_${i.toString(36)}`,
    user: { id: `u_${(i * 7) % 1000}`, plan: i % 5 === 0 ? null : 'pro' },
    event: {
      type: KINDS[i % KINDS.length],
      url: `/p/${i}`,
      ref: i % 3 ? `/r/${i % 100}` : null,
      duration_ms: i % 4 === 0 ? null : ((i * 31) % 5000),
      meta: { client: i % 2 ? 'web' : 'ios', v: '1.2.3' },
    },
  };
  if (i % 7 !== 0) ev.tags = [`tag${i % 10}`, `seg${i % 7}`];
  if (i % 11 === 0) ev.error_detail = { code: `E${i % 100}`, stack: '<elided>' };
  return ev;
}

async function llmTrainingGen(stream, n) {
  // Standard LLM SFT/eval format: one {prompt, completion} per line.
  // Lengths vary so parsers can't assume fixed-width lines.
  for (let i = 0; i < n; i++) {
    const promptLen = 50 + (i % 200);
    const completionLen = 100 + (i * 31) % 400;
    const rec = {
      prompt: `Question ${i}: ${'word '.repeat(promptLen / 5).trim()}`,
      completion: `Answer ${i}: ${'word '.repeat(completionLen / 5).trim()}`,
    };
    await w(stream, JSON.stringify(rec) + '\n');
  }
}

async function pathologicalGen(stream, n) {
  // The file starts with a UTF-8 BOM (EF BB BF). Most JSON parsers strip
  // BOMs silently; the spec says they shouldn't and our streaming parser
  // needs to handle either way.
  await w(stream, '﻿');
  await w(stream, '[');
  for (let i = 0; i < n; i++) {
    // Cycle through pathological patterns. Each variant is a RAW JSON string
    // (not JSON.stringify'd) so we can produce technically-valid-but-odd
    // structures the safe encoder wouldn't emit on its own.
    const variant = i % 8;
    let chunk;
    switch (variant) {
      case 0: // RFC-allowed duplicate keys
        chunk = `{"dup":1,"dup":2,"dup":${i}}`;
        break;
      case 1: // escaped quotes + backslashes
        chunk = `{"q":"\\"quoted\\" \\\\ backslash"}`;
        break;
      case 2: // \uXXXX unicode escapes for ASCII chars (legal but odd)
        chunk = `{"u":"\\u0048\\u0065\\u006c\\u006c\\u006f"}`;
        break;
      case 3: // surrogate pair for 😀
        chunk = `{"emoji":"\\uD83D\\uDE00"}`;
        break;
      case 4: { // very long key name
        const key = 'x'.repeat(10_000);
        chunk = `{"${key}":${i}}`;
        break;
      }
      case 5: // number edge cases
        chunk = `{"big":1e308,"tiny":1e-300,"negzero":-0,"intlike":1.0}`;
        break;
      case 6: // trailing/leading whitespace inside the array element
        chunk = `   \t\n{"ws":${i}}\t\n   `;
        break;
      case 7: // empty key + empty value
        chunk = `{"":${i},"empty":""}`;
        break;
    }
    await w(stream, (i === 0 ? '' : ',') + chunk);
  }
  await w(stream, ']');
}
