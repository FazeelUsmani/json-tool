# Benchmarks

Synthetic JSON / NDJSON fixtures for the huge-JSON wedge.

## Generate

Per-shape:

```bash
node benchmarks/generate.mjs --shape <name> --size <n>
```

`--size` is shape-specific (see `--help`):

| Shape                  | `--size` unit       | Dev default (~50 MB) |
| ---------------------- | ------------------- | -------------------- |
| `flat-array`           | elements            | 600 000              |
| `deep-nested`          | depth levels        | 1 000                |
| `wide-object`          | keys                | 3 000 000            |
| `giant-array`          | elements            | 15 000 000           |
| `unicode-heavy`        | entries             | 50 000               |
| `long-strings`         | MB per value        | 50                   |
| `telemetry`            | events              | 170 000              |
| `pathological`         | entries             | 1 000                |
| `telemetry.ndjson`     | lines               | 170 000              |
| `llm-training.ndjson`  | lines               | 100 000              |

Output lands in `benchmarks/corpus/` (gitignored) as `<shape>-<size>.<ext>`.

## All dev fixtures at once

```bash
npm run bench:gen:all-dev
# or
node benchmarks/generate.mjs --all-dev
```

Generates a ~50 MB version of every shape. GB-scale stressors only run when
explicitly requested with a large `--size`.

## Shape notes

- `flat-array` — array of log-line objects; same record shape that
  produces ~12 FlatRows per record.
- `deep-nested` — `{"l":{"l":{...}}}` nested N levels. Stack-recursion
  stressor; file stays small regardless of depth.
- `wide-object` — single object with N keys, exercises object hash
  growth and key-iteration paths.
- `giant-array` — array of N small integers; stressor for streaming
  yield-per-element parsers.
- `unicode-heavy` — emoji (incl. ZWJ family glyphs), CJK, Cyrillic,
  Arabic, escape sequences, with padding so multi-byte chars land at
  varying byte offsets per record. Use this to test buffer-slice safety
  across chunk boundaries.
- `long-strings` — 3 keys, each holding a multi-MB string of a single
  character. Exercises per-value buffer allocation in stream parsers.
- `telemetry` / `telemetry.ndjson` — realistic event-stream shape with
  timestamps, IDs, nested events, sparse fields, occasional nulls. The
  `.ndjson` variant is one event per line.
- `pathological` — RFC-allowed-but-unusual: duplicate keys, escaped
  quotes/backslashes, `\uXXXX` escapes, surrogate pairs, long key names,
  number edge cases (`1e308`, `-0`), in-array whitespace, empty keys.
  **Starts with a UTF-8 BOM by design** — strict `JSON.parse` rejects
  this; permissive parsers should accept.
- `llm-training.ndjson` — `{"prompt":..., "completion":...}` per line,
  variable-length values.

## Run

`run.mjs` is the Playwright-driven harness; not implemented yet (Week 3
work). For the Day-1 spike, use the page at `/spikes/` (see
`spikes/README.md`).

## Public-claim ceiling

Per `PLAN.MD`: marketing surfaces stop at 500 MB. 1 GB performance is
internal benchmarking only.
