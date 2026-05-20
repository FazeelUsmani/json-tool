// W3-Wed Part A re-smoke. Drives parseStreaming against the 200MB
// telemetry fixture and reports parse wall, RSS, flatten wall, byteIndex
// size. Skipped unless SMOKE=1 — opt in explicitly for ad-hoc cold runs:
//   SMOKE=1 pnpm exec vitest run benchmarks/smoke-200mb.test.ts

import { test } from 'vitest';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { parseStreaming } from '@/lib/parser/parse-streaming';
import { flattenTree } from '@/lib/tree/flatten';
import { MAX_SPINE_DEPTH } from '@/lib/parser/parser-types';

const FIXTURE = process.env.SMOKE_FIXTURE ?? 'benchmarks/corpus/telemetry-900000.json';

test.skipIf(!process.env.SMOKE)('200MB smoke', async () => {
  const sizeBytes = statSync(FIXTURE).size;

  // If MEMORY_STREAM=1, slurp the entire fixture into a single Uint8Array
  // and serve it as one chunk. Isolates parse-only cost from
  // createReadStream + Readable.toWeb async hopping (which appears as
  // 99% idle in cpu-prof for fs-backed runs).
  const useMemStream = process.env.MEMORY_STREAM === '1';

  const tIO = performance.now();
  const stream = useMemStream
    ? (() => {
        const { readFileSync } = require('node:fs') as typeof import('node:fs');
        const buf = readFileSync(FIXTURE);
        return new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
            c.close();
          },
        });
      })()
    : (Readable.toWeb(
        createReadStream(FIXTURE),
      ) as ReadableStream<Uint8Array>);
  const ioMs = performance.now() - tIO;

  const baselineRss = process.memoryUsage().rss;

  const t0 = performance.now();
  const result = await parseStreaming(stream);
  const parseMs = performance.now() - t0;
  const rssAfterParse = process.memoryUsage().rss;

  const t1 = performance.now();
  const rows = flattenTree(result.root!);
  const flattenMs = performance.now() - t1;
  const rssAfterFlatten = process.memoryUsage().rss;

  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

  // eslint-disable-next-line no-console
  console.log(
    '\nSMOKE ' +
      JSON.stringify(
        {
          MAX_SPINE_DEPTH,
          useMemStream,
          ioMs: Math.round(ioMs),
          inputMB: mb(sizeBytes),
          parseMs: Math.round(parseMs),
          flattenMs: Math.round(flattenMs),
          baselineRssMB: mb(baselineRss),
          rssAfterParseMB: mb(rssAfterParse),
          rssAfterFlattenMB: mb(rssAfterFlatten),
          rssDeltaParseMB: mb(rssAfterParse - baselineRss),
          rssDeltaFlattenMB: mb(rssAfterFlatten - baselineRss),
          byteIndexEntries: result.byteIndex.length,
          byteIndexBytes: JSON.stringify(result.byteIndex).length,
          flatRows: rows.length,
          rootKind: result.root?.kind,
          rootChildren:
            result.root?.kind === 'object' || result.root?.kind === 'array'
              ? result.root.children.length
              : 0,
          parseError: result.parseError,
        },
        null,
        2,
      ),
  );

  // Top-20-visible-rows snapshot. Approximates the on-screen layout of
  // OpenRow / StubRow / LeafRow / CloseRow at default zoom. Object keys
  // render in quotes; array indices render bare (matches KeyLabel).
  const snapshot: string[] = [];
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i];
    const pad = '  '.repeat(r.depth);
    const inArr = r.kind !== 'close' && r.parentKind === 'array';
    const keyPart =
      r.kind === 'close'
        ? ''
        : r.kind === 'open' || r.kind === 'leaf' || r.kind === 'stub'
          ? r.node.key !== null
            ? inArr
              ? `${r.node.key}: `
              : `"${r.node.key}": `
            : ''
          : '';
    if (r.kind === 'open') {
      snapshot.push(
        `${pad}▾ ${keyPart}${r.node.kind === 'object' ? '{' : '['}`,
      );
    } else if (r.kind === 'close') {
      snapshot.push(`${pad}  ${r.closeBracket}`);
    } else if (r.kind === 'stub') {
      const open = r.node.kind === 'stub-object' ? '{' : '[';
      const close = r.node.kind === 'stub-object' ? '}' : ']';
      snapshot.push(
        `${pad}▸ ${keyPart}${open} … ${close}  [${r.node.childCount}]`,
      );
    } else if (r.kind === 'leaf') {
      const n = r.node;
      let v = '';
      if (n.kind === 'object' || n.kind === 'array') {
        v = n.kind === 'object' ? '{}' : '[]';
      } else if (n.kind === 'string') {
        v = `"${n.value}"`;
      } else if (n.kind === 'number' || n.kind === 'boolean') {
        v = String(n.value);
      } else {
        v = 'null';
      }
      snapshot.push(`${pad}  ${keyPart}${v}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log('\nTOP-20-ROWS:\n' + snapshot.join('\n'));
}, 600_000);
