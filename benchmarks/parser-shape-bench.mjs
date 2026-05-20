// Microbench: compare the parser's onToken handler shape variants to
// isolate where the ~15s/200MB overhead lives. Tokenizer-only is ~3s.
// Anything we add on top should be in the same ballpark, not 7×.
//
// Variants (all process the same 55.7M-token stream):
//   A. raw Tokenizer (empty onToken)            — bare floor
//   B. + token count                            — closure write only
//   C. + stub-mode count-only (mimics depth=2)  — handleStubToken inline
//   D. + stub-mode via separate fn              — function-call overhead
//   E. + path string concat per stub close      — string allocation cost
//   F. + byteIndex.push per stub close          — array growth cost
//
// Result tells us which thing pushes us from 3s to 21s.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const FIXTURE = 'benchmarks/corpus/telemetry-900000.json';
const buf = readFileSync(FIXTURE);
const sizeMB = buf.byteLength / 1024 / 1024;

const { default: Tokenizer } = await import('@streamparser/json/tokenizer.js');
const { default: TokenType } = await import(
  '@streamparser/json/utils/types/tokenType.js'
);

function run(name, makeHandler) {
  const tok = new Tokenizer();
  tok.onToken = makeHandler();
  const t0 = performance.now();
  tok.write(buf);
  tok.end();
  const ms = performance.now() - t0;
  console.log(
    `${name.padEnd(48)} ${Math.round(ms).toString().padStart(6)} ms  (${(sizeMB / (ms / 1000)).toFixed(1)} MB/s)`,
  );
  return ms;
}

console.log('Fixture:', sizeMB.toFixed(1), 'MB');

// A. raw
run('A. raw Tokenizer (empty onToken)', () => () => {});

// B. count only
run('B. + token count', () => {
  let n = 0;
  return () => {
    n++;
  };
});

// C. stub-mode inline (the depth=2 hot path)
run('C. + stub-mode inline (depth=2 shape)', () => {
  // For 900K events all become stubs. Simulate: every LEFT_BRACE at the
  // outer level starts a stub; close on matching RIGHT_BRACE; depthAccum
  // tracking + commaCount + hasElement. Skip the spine-mode side since
  // it's only ~3 tokens for the whole file ($ object, $.events array).
  let stub = null;
  let depth = 0;
  let stubsClosed = 0;
  return (info) => {
    if (stub) {
      switch (info.token) {
        case TokenType.LEFT_BRACE:
        case TokenType.LEFT_BRACKET:
          if (stub.d === 1) stub.h = true;
          stub.d++;
          break;
        case TokenType.RIGHT_BRACE:
        case TokenType.RIGHT_BRACKET:
          stub.d--;
          if (stub.d === 0) {
            stub = null;
            stubsClosed++;
            depth--;
          }
          break;
        case TokenType.COMMA:
          if (stub.d === 1) stub.c++;
          break;
        case TokenType.STRING:
        case TokenType.NUMBER:
        case TokenType.TRUE:
        case TokenType.FALSE:
        case TokenType.NULL:
          if (stub.d === 1) stub.h = true;
          break;
      }
      return;
    }
    if (
      info.token === TokenType.LEFT_BRACE ||
      info.token === TokenType.LEFT_BRACKET
    ) {
      if (depth >= 2) {
        stub = { d: 1, c: 0, h: false };
      }
      depth++;
    } else if (
      info.token === TokenType.RIGHT_BRACE ||
      info.token === TokenType.RIGHT_BRACKET
    ) {
      depth--;
    }
  };
});

// D. same as C but via a separate fn (function-call overhead)
function handleStub(info, s) {
  switch (info.token) {
    case TokenType.LEFT_BRACE:
    case TokenType.LEFT_BRACKET:
      if (s.d === 1) s.h = true;
      s.d++;
      break;
    case TokenType.RIGHT_BRACE:
    case TokenType.RIGHT_BRACKET:
      s.d--;
      break;
    case TokenType.COMMA:
      if (s.d === 1) s.c++;
      break;
    case TokenType.STRING:
    case TokenType.NUMBER:
    case TokenType.TRUE:
    case TokenType.FALSE:
    case TokenType.NULL:
      if (s.d === 1) s.h = true;
      break;
  }
}

run('D. + stub-mode via separate fn', () => {
  let stub = null;
  let depth = 0;
  return (info) => {
    if (stub) {
      handleStub(info, stub);
      if (stub.d === 0) {
        stub = null;
        depth--;
      }
      return;
    }
    if (
      info.token === TokenType.LEFT_BRACE ||
      info.token === TokenType.LEFT_BRACKET
    ) {
      if (depth >= 2) {
        stub = { d: 1, c: 0, h: false };
      }
      depth++;
    } else if (
      info.token === TokenType.RIGHT_BRACE ||
      info.token === TokenType.RIGHT_BRACKET
    ) {
      depth--;
    }
  };
});

// E. C + path string concat per stub close
run('E. + path string concat per stub close', () => {
  let stub = null;
  let depth = 0;
  let elemIdx = 0;
  const paths = [];
  return (info) => {
    if (stub) {
      switch (info.token) {
        case TokenType.LEFT_BRACE:
        case TokenType.LEFT_BRACKET:
          if (stub.d === 1) stub.h = true;
          stub.d++;
          break;
        case TokenType.RIGHT_BRACE:
        case TokenType.RIGHT_BRACKET:
          stub.d--;
          if (stub.d === 0) {
            paths.push(`$.events[${stub.idx}]`);
            stub = null;
            depth--;
          }
          break;
        case TokenType.COMMA:
          if (stub.d === 1) stub.c++;
          break;
      }
      return;
    }
    if (
      info.token === TokenType.LEFT_BRACE ||
      info.token === TokenType.LEFT_BRACKET
    ) {
      if (depth >= 2) {
        stub = { d: 1, c: 0, h: false, idx: elemIdx++ };
      }
      depth++;
    } else if (
      info.token === TokenType.RIGHT_BRACE ||
      info.token === TokenType.RIGHT_BRACKET
    ) {
      depth--;
    }
  };
});

// F. E + byteIndex.push per stub close
run('F. + byteIndex.push per stub close', () => {
  let stub = null;
  let depth = 0;
  let elemIdx = 0;
  const byteIndex = [];
  return (info) => {
    if (stub) {
      switch (info.token) {
        case TokenType.LEFT_BRACE:
        case TokenType.LEFT_BRACKET:
          if (stub.d === 1) stub.h = true;
          stub.d++;
          break;
        case TokenType.RIGHT_BRACE:
        case TokenType.RIGHT_BRACKET:
          stub.d--;
          if (stub.d === 0) {
            byteIndex.push([
              `$.events[${stub.idx}]`,
              { byteStart: stub.s, byteEnd: info.offset + 1 },
            ]);
            stub = null;
            depth--;
          }
          break;
        case TokenType.COMMA:
          if (stub.d === 1) stub.c++;
          break;
      }
      return;
    }
    if (
      info.token === TokenType.LEFT_BRACE ||
      info.token === TokenType.LEFT_BRACKET
    ) {
      if (depth >= 2) {
        stub = { d: 1, c: 0, h: false, idx: elemIdx++, s: info.offset };
      }
      depth++;
    } else if (
      info.token === TokenType.RIGHT_BRACE ||
      info.token === TokenType.RIGHT_BRACKET
    ) {
      depth--;
    }
  };
});
