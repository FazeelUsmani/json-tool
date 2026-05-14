#!/usr/bin/env node
// Synthesize JSON fixtures for the huge-JSON wedge benchmarks.
//
// Usage:
//   node benchmarks/generate.mjs <shape> <sizeMB>
//
// Shapes (Month 1):
//   telemetry      — realistic event-stream payload (used in competitor video)
//   flat-array     — baseline: uniform array of small objects
//   unicode-heavy  — emoji/CJK at boundaries; UTF-8 slice stressor
//   deep-nested    — 1000+ levels deep; recursion / stack stressor
//
// TODO (later): wide-object (1M+ keys), giant-array (10M+ elements),
// long-strings (single value >50MB), pathological (escapes, BOM, dup keys).

import { createWriteStream, mkdirSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { join } from 'node:path';

const [, , shape, sizeMbArg] = argv;
const sizeMb = Number(sizeMbArg ?? 50);

const generators = {
  telemetry: telemetryGen,
  'flat-array': flatArrayGen,
  'unicode-heavy': unicodeHeavyGen,
  'deep-nested': deepNestedGen,
};

if (!shape || !generators[shape] || !Number.isFinite(sizeMb)) {
  console.error('Usage: node benchmarks/generate.mjs <shape> <sizeMB>');
  console.error(`Shapes: ${Object.keys(generators).join(', ')}`);
  exit(1);
}

const TARGET_BYTES = sizeMb * 1024 * 1024;
mkdirSync('benchmarks/corpus', { recursive: true });
const outPath = join('benchmarks/corpus', `${shape}-${sizeMb}mb.json`);

console.log(`Generating ${outPath} (~${sizeMb}MB)…`);
const stream = createWriteStream(outPath);
generators[shape](stream);
stream.end(() => console.log(`Done: ${outPath}`));

// ---------------------------------------------------------------------------

function telemetryGen(stream) {
  stream.write('{\n  "events": [\n');
  let written = 16;
  let i = 0;
  const KINDS = ['click', 'view', 'submit', 'error', 'load', 'logout', 'login'];
  while (written < TARGET_BYTES - 1024) {
    const ev = {
      id: `evt_${i.toString(36)}`,
      ts: 1700000000000 + i * 137,
      kind: KINDS[i % KINDS.length],
      user: { id: `u_${(i * 7) % 1000}`, plan: i % 5 === 0 ? null : 'pro' },
      props: {
        url: `/p/${i}`,
        ref: i % 3 ? `/r/${i % 100}` : null,
        meta: { client: i % 2 ? 'web' : 'ios', v: '1.2.3' },
      },
      tags: i % 4 === 0 ? [] : [`tag${i % 10}`, `seg${i % 7}`],
    };
    const chunk = (i === 0 ? '    ' : ',\n    ') + JSON.stringify(ev);
    stream.write(chunk);
    written += chunk.length;
    i++;
  }
  stream.write('\n  ]\n}\n');
  console.error(`  ${i} events`);
}

function flatArrayGen(stream) {
  stream.write('[\n');
  let written = 2;
  let i = 0;
  while (written < TARGET_BYTES - 1024) {
    const obj = { id: i, name: `item${i}`, val: (i * 2654435761) >>> 0, ok: i % 2 === 0 };
    const chunk = (i === 0 ? '  ' : ',\n  ') + JSON.stringify(obj);
    stream.write(chunk);
    written += chunk.length;
    i++;
  }
  stream.write('\n]\n');
  console.error(`  ${i} items`);
}

function unicodeHeavyGen(stream) {
  // Multi-byte UTF-8 sequences placed at varying offsets so that a naive
  // byte slice has many chances to land mid-character.
  stream.write('{\n  "messages": [\n');
  let written = 18;
  let i = 0;
  const EMOJI = '🎉 👨‍👩‍👧 ñ café 你好世界 — boundaries 🌍🚀';
  const CJK = '日本語テキスト中文文字한국어';
  while (written < TARGET_BYTES - 1024) {
    const msg = {
      id: i,
      text: `${EMOJI} #${i} ${CJK} "quoted \\"value\\""`,
      author: i % 2 ? 'Алиса' : 'مصطفى',
      attached: { caption: '🇯🇵 trip to Tōkyō — café au lait' },
    };
    const chunk = (i === 0 ? '    ' : ',\n    ') + JSON.stringify(msg);
    stream.write(chunk);
    written += chunk.length;
    i++;
  }
  stream.write('\n  ]\n}\n');
  console.error(`  ${i} messages`);
}

function deepNestedGen(stream) {
  // Each level adds ~10 bytes; cap depth so we don't exceed sizeMb.
  const TARGET_DEPTH = Math.min(2000, Math.floor(TARGET_BYTES / 30));
  const open = Array.from({ length: TARGET_DEPTH }, (_, i) => `{"d${i}":`).join('');
  const leafBudget = Math.max(8, TARGET_BYTES - open.length - TARGET_DEPTH - 64);
  const leaf = `{"leaf":"${'x'.repeat(leafBudget)}"}`;
  const close = '}'.repeat(TARGET_DEPTH);
  stream.write(open + leaf + close + '\n');
  console.error(`  depth ${TARGET_DEPTH}`);
}
