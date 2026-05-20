// Lower-bound throughput comparisons for parsing the 200MB telemetry
// fixture: JSON.parse, raw @streamparser/json Tokenizer (no spine
// bookkeeping). Compare against the spine parser's ~21s to see how much
// of the wall time is the underlying Tokenizer vs our bookkeeping.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const FIXTURE = 'benchmarks/corpus/telemetry-900000.json';
const buf = readFileSync(FIXTURE);
const sizeMB = buf.byteLength / 1024 / 1024;
console.log('Fixture:', sizeMB.toFixed(1), 'MB');

// 1. JSON.parse (native, slurps entire string)
{
  const text = buf.toString('utf8');
  const t0 = performance.now();
  const parsed = JSON.parse(text);
  const ms = performance.now() - t0;
  console.log(
    `JSON.parse:     ${Math.round(ms)} ms  (${(sizeMB / (ms / 1000)).toFixed(1)} MB/s)  events=${parsed.events?.length ?? 0}`,
  );
}

// 2. Raw @streamparser/json Tokenizer (no spine bookkeeping)
{
  const { default: Tokenizer } = await import(
    '@streamparser/json/tokenizer.js'
  );
  const tokenizer = new Tokenizer();
  let count = 0;
  tokenizer.onToken = () => {
    count++;
  };
  const t0 = performance.now();
  tokenizer.write(buf);
  tokenizer.end();
  const ms = performance.now() - t0;
  console.log(
    `Tokenizer only: ${Math.round(ms)} ms  (${(sizeMB / (ms / 1000)).toFixed(1)} MB/s)  tokens=${count}`,
  );
}

// 3. Tokenizer with the same "chunked write" path as parseStreaming uses
// when File.stream() yields 64KB chunks.
{
  const { default: Tokenizer } = await import(
    '@streamparser/json/tokenizer.js'
  );
  const tokenizer = new Tokenizer();
  let count = 0;
  tokenizer.onToken = () => {
    count++;
  };
  const CHUNK = 64 * 1024;
  const t0 = performance.now();
  for (let i = 0; i < buf.byteLength; i += CHUNK) {
    tokenizer.write(buf.subarray(i, Math.min(i + CHUNK, buf.byteLength)));
  }
  tokenizer.end();
  const ms = performance.now() - t0;
  console.log(
    `Tokenizer 64K:  ${Math.round(ms)} ms  (${(sizeMB / (ms / 1000)).toFixed(1)} MB/s)  tokens=${count}`,
  );
}
