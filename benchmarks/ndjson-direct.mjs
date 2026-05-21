// NDJSON-direct measurement: line-offset index construction + emit
// virtual TreeNode root. Matches what parseNdjson does in production,
// minus the @ alias path indirection. Browser will be ~1.8× slower (see
// parser-direct.mjs for the gap rationale).
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const LF = 0x0a;

function buildLineIndex(bytes) {
  if (bytes.byteLength === 0) return new Uint32Array([0]);
  let count = 1;
  for (let i = 0; i < bytes.byteLength; i++) if (bytes[i] === LF) count++;
  const positions = new Uint32Array(
    count + (bytes[bytes.byteLength - 1] === LF ? 0 : 1),
  );
  positions[0] = 0;
  let idx = 1;
  for (let i = 0; i < bytes.byteLength; i++) {
    if (bytes[i] === LF) positions[idx++] = i + 1;
  }
  if (idx < positions.length) positions[idx] = bytes.byteLength;
  return positions;
}

function emitNodes(bytes, index) {
  const out = [];
  for (let i = 0; i < index.length - 1; i++) {
    const start = index[i];
    let end = index[i + 1];
    if (end > start && bytes[end - 1] === LF) end--;
    if (end > start && bytes[end - 1] === 0x0d) end--;
    if (end === start) continue;
    out.push({
      kind: 'ndjson-line',
      key: String(out.length),
      path: `$[${out.length}]`,
      byteStart: start,
      byteEnd: end,
    });
  }
  return out;
}

const FIXTURES = [
  'benchmarks/corpus/telemetry-100.ndjson',
  'benchmarks/corpus/telemetry-900000.ndjson',
];

for (const fixture of FIXTURES) {
  const buf = readFileSync(fixture);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const sizeMB = buf.byteLength / 1024 / 1024;

  const t0 = performance.now();
  const index = buildLineIndex(bytes);
  const tIndex = performance.now() - t0;

  const t1 = performance.now();
  const nodes = emitNodes(bytes, index);
  const tEmit = performance.now() - t1;

  const total = tIndex + tEmit;
  console.log(
    `${fixture}  ${sizeMB.toFixed(1)} MB  lines=${nodes.length}  ` +
      `index=${Math.round(tIndex)}ms  emit=${Math.round(tEmit)}ms  ` +
      `total=${Math.round(total)}ms  (${(sizeMB / (total / 1000)).toFixed(1)} MB/s)`,
  );
}
