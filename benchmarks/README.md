# Benchmarks

Synthetic JSON fixtures for the huge-JSON wedge.

## Generate

```bash
node benchmarks/generate.mjs telemetry 200
node benchmarks/generate.mjs flat-array 500
node benchmarks/generate.mjs unicode-heavy 50
node benchmarks/generate.mjs deep-nested 5
```

Output lands in `benchmarks/corpus/` (gitignored). Fixture shapes and rationale
live in `PLAN.MD` under Week 3.

## Run

`run.mjs` is the Playwright-driven harness; not implemented yet (Week 3 work).
For the Day-1 spike, use the page at `/spikes/` (see `spikes/README.md`).

## Public-claim ceiling

Per `PLAN.MD`: marketing surfaces stop at 500MB. 1GB performance is internal
benchmarking only.
