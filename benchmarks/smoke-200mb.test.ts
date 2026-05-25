// 200MB telemetry fixture smoke. Drives parseStreaming + flattenTree
// and asserts CATASTROPHIC-tolerance thresholds:
//   - parseMs < 60000   (typical 5-6s; cap catches 10x regressions)
//   - flattenMs < 30000 (typical 100-300ms; cap catches 100x regressions)
//   - rssAfterParse < 4000MB (typical ~300MB; cap catches OOM-territory)
//
// Wide thresholds are deliberate — GitHub-hosted runners share CPU and
// can vary 2-3x on identical workloads. We only catch egregious
// regressions automatically; subtle 2x slowdowns still surface via the
// methodology.md manual workflow. Skipped unless SMOKE=1 because the
// fixture is gitignored (200MB); CI generates it via the perf workflow.
//
//   SMOKE=1 npm test -- --run benchmarks/smoke-200mb.test.ts

import { expect, test } from 'vitest';
import { createReadStream, readFileSync, statSync } from 'node:fs';
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

  // Catastrophic-tolerance perf gate — see header comment for
  // threshold rationale. These assertions only fail on egregious
  // regressions (parse takes a minute, OOM-territory RSS growth);
  // subtle slowdowns continue to need the manual benchmark
  // workflow (methodology.md).
  expect(parseMs, `parseMs ${Math.round(parseMs)} > 60_000ms threshold`).toBeLessThan(60_000);
  expect(flattenMs, `flattenMs ${Math.round(flattenMs)} > 30_000ms threshold`).toBeLessThan(30_000);
  expect(
    mb(rssAfterParse),
    `rssAfterParse ${mb(rssAfterParse)}MB > 4000MB threshold`,
  ).toBeLessThan(4000);
  expect(rows.length, 'flat rows should be populated').toBeGreaterThan(100_000);
  expect(result.parseError, 'parse should not error').toBeUndefined();

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
      const v =
        n.kind === 'object'
          ? '{}'
          : n.kind === 'array'
            ? '[]'
            : n.kind === 'string'
              ? `"${n.value}"`
              : n.kind === 'number' || n.kind === 'boolean'
                ? String(n.value)
                : 'null';
      snapshot.push(`${pad}  ${keyPart}${v}`);
    }
  }
  console.log('\nTOP-20-ROWS:\n' + snapshot.join('\n'));
}, 600_000);
