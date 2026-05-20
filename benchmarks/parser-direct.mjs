// Verbatim copy of parseStreaming's logic, hand-converted to plain JS,
// run directly via Node (no vitest, no esbuild transform). Compare wall
// time vs the vitest smoke (21s) and vs the shape microbench (3.3s) to
// localize the slowdown.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import Tokenizer from '@streamparser/json/tokenizer.js';
import TokenType from '@streamparser/json/utils/types/tokenType.js';

const MAX_SPINE_DEPTH = 2;

function parseStreaming(buf) {
  const tokenizer = new Tokenizer();
  const stack = [];
  const byteIndex = [];
  const arrayLengths = new Map();
  let stub = null;
  let depth = 0;
  let root = null;
  let parseError;
  let halted = false;

  const basePath = '$';
  const byteOffsetBase = 0;

  const peek = () => stack[stack.length - 1] ?? null;

  const nextChildIdentity = () => {
    const p = peek();
    if (p === null) return { key: null, path: basePath };
    if (p.kind === 'object') {
      if (p.pendingKey === null) throw new Error('inv');
      const key = p.pendingKey;
      return { key, path: `${p.path}.${key}` };
    }
    return { key: String(p.elementIndex), path: `${p.path}[${p.elementIndex}]` };
  };

  const attach = (node) => {
    const p = peek();
    if (p === null) {
      root = node;
      return;
    }
    p.children.push(node);
    if (p.kind === 'object') p.pendingKey = null;
    else p.elementIndex++;
  };

  function handleStubToken(info, s) {
    switch (info.token) {
      case TokenType.LEFT_BRACE:
      case TokenType.LEFT_BRACKET:
        if (s.depthAccum === 1) s.hasElement = true;
        s.depthAccum++;
        break;
      case TokenType.RIGHT_BRACE:
      case TokenType.RIGHT_BRACKET:
        s.depthAccum--;
        break;
      case TokenType.COMMA:
        if (s.depthAccum === 1) s.commaCount++;
        break;
      case TokenType.STRING:
      case TokenType.NUMBER:
      case TokenType.TRUE:
      case TokenType.FALSE:
      case TokenType.NULL:
        if (s.depthAccum === 1) s.hasElement = true;
        break;
      case TokenType.COLON:
      case TokenType.SEPARATOR:
        break;
    }
  }

  tokenizer.onToken = (info) => {
    if (halted) return;
    if (stub) {
      handleStubToken(info, stub);
      if (stub.depthAccum === 0) {
        const childCount = stub.commaCount + (stub.hasElement ? 1 : 0);
        const stubNode =
          stub.kind === 'stub-object'
            ? {
                kind: 'stub-object',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1 + byteOffsetBase,
                childCount,
              }
            : {
                kind: 'stub-array',
                key: stub.key,
                path: stub.path,
                byteStart: stub.byteStart,
                byteEnd: info.offset + 1 + byteOffsetBase,
                childCount,
              };
        byteIndex.push([
          stubNode.path,
          { byteStart: stubNode.byteStart, byteEnd: stubNode.byteEnd },
        ]);
        if (stub.kind === 'stub-array') arrayLengths.set(stub.path, childCount);
        attach(stubNode);
        depth--;
        stub = null;
      }
      return;
    }

    switch (info.token) {
      case TokenType.LEFT_BRACE:
      case TokenType.LEFT_BRACKET: {
        const isObj = info.token === TokenType.LEFT_BRACE;
        const { key, path } = nextChildIdentity();
        if (depth >= MAX_SPINE_DEPTH) {
          stub = {
            kind: isObj ? 'stub-object' : 'stub-array',
            key,
            path,
            byteStart: info.offset + byteOffsetBase,
            depthAccum: 1,
            commaCount: 0,
            hasElement: false,
          };
        } else {
          const frame = isObj
            ? {
                kind: 'object',
                key,
                path,
                children: [],
                byteStart: info.offset + byteOffsetBase,
                pendingKey: null,
              }
            : {
                kind: 'array',
                key,
                path,
                children: [],
                byteStart: info.offset + byteOffsetBase,
                elementIndex: 0,
              };
          stack.push(frame);
        }
        depth++;
        break;
      }
      case TokenType.RIGHT_BRACE:
      case TokenType.RIGHT_BRACKET: {
        const frame = stack.pop();
        if (!frame) return;
        depth--;
        const byteEnd = info.offset + 1 + byteOffsetBase;
        const node =
          frame.kind === 'object'
            ? {
                kind: 'object',
                key: frame.key,
                path: frame.path,
                children: frame.children,
              }
            : {
                kind: 'array',
                key: frame.key,
                path: frame.path,
                children: frame.children,
              };
        byteIndex.push([node.path, { byteStart: frame.byteStart, byteEnd }]);
        if (frame.kind === 'array')
          arrayLengths.set(frame.path, frame.children.length);
        attach(node);
        break;
      }
      case TokenType.STRING: {
        const p = peek();
        if (p && p.kind === 'object' && p.pendingKey === null) {
          p.pendingKey = info.value;
        } else {
          const { key, path } = nextChildIdentity();
          attach({ kind: 'string', key, path, value: info.value });
        }
        break;
      }
      case TokenType.NUMBER: {
        const { key, path } = nextChildIdentity();
        attach({ kind: 'number', key, path, value: info.value });
        break;
      }
      case TokenType.TRUE:
      case TokenType.FALSE: {
        const { key, path } = nextChildIdentity();
        attach({
          kind: 'boolean',
          key,
          path,
          value: info.token === TokenType.TRUE,
        });
        break;
      }
      case TokenType.NULL: {
        const { key, path } = nextChildIdentity();
        attach({ kind: 'null', key, path });
        break;
      }
    }
  };

  tokenizer.onError = (err) => {
    if (!parseError) parseError = { message: err.message };
    halted = true;
  };

  const t0 = performance.now();
  tokenizer.write(buf);
  tokenizer.end();
  const ms = performance.now() - t0;

  return { root, byteIndex, parseError, ms, byteIndexLen: byteIndex.length };
}

const FIXTURES = [
  'benchmarks/corpus/telemetry-170000.json', // ~38MB
  'benchmarks/corpus/telemetry-900000.json', // ~201MB
];

for (const FIXTURE of FIXTURES) {
  const buf = readFileSync(FIXTURE);
  const sizeMB = buf.byteLength / 1024 / 1024;
  console.log('\nFixture:', FIXTURE, sizeMB.toFixed(1), 'MB');
  const r = parseStreaming(buf);
  console.log(
    `  parseStreaming JS-direct: ${Math.round(r.ms).toString().padStart(5)} ms  (${(sizeMB / (r.ms / 1000)).toFixed(1)} MB/s)  byteIndex=${r.byteIndexLen}  err=${r.parseError?.message ?? 'none'}`,
  );
}

const buf = readFileSync(FIXTURES[1]);
const sizeMB = buf.byteLength / 1024 / 1024;

// 64KB / 256KB / 1MB chunked tokenizer-only — matches File.stream() in
// browsers. (The parser body around it adds <10% so this is a useful
// proxy for chunked throughput at deployment.)
function parseTokenizerChunked(buf, chunkSize) {
  const tokenizer = new Tokenizer();
  let count = 0;
  tokenizer.onToken = () => {
    count++;
  };
  const t0 = performance.now();
  for (let i = 0; i < buf.byteLength; i += chunkSize) {
    tokenizer.write(buf.subarray(i, Math.min(i + chunkSize, buf.byteLength)));
  }
  tokenizer.end();
  return { ms: performance.now() - t0, count };
}

for (const ck of [64 * 1024, 256 * 1024, 1024 * 1024]) {
  const r = parseTokenizerChunked(buf, ck);
  console.log(
    `tokenizer ${(ck / 1024).toString().padStart(4)}KB: ${Math.round(r.ms).toString().padStart(5)} ms  (${(sizeMB / (r.ms / 1000)).toFixed(1)} MB/s)  tokens=${r.count}`,
  );
}
