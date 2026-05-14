# spikes/

Throwaway research code. Lives outside `src/` and is dev-server-only — not part of the production build.

## Day-1 spike: parser byte offsets

Tests the 4-part question from `PLAN.MD` Week 1 Mon:

- **(a)** Does the parser bundle cleanly inside a Vite ES-module worker?
- **(b)** Can we capture `{byteStart, byteEnd}` per top-level value?
- **(c)** Does `Blob.slice(start, end) → JSON.parse` round-trip equal the streamed value?
- **(d)** Do slice boundaries hold up against UTF-8 multi-byte sequences?

## Run

```bash
npm run dev
# open http://localhost:5173/spikes/
```

Click *Run builtin* for the ASCII + UTF-8 case. *Run on file…* takes any `.json` (try a fixture from `benchmarks/corpus/` once `generate.mjs` has produced one).

## Notes

- The `@streamparser/json` branch uses **string-search** to recover offsets — fine for spike fixtures but O(N) per value. Replace with `Tokenizer.onToken` (which exposes true byte offsets) before this code ships anywhere near production.
- The `stream-json` branch only verifies bundling; offset capture isn't wired. Decide before EOD whether to invest in stream-json offset emission or commit to `@streamparser/json`.
- If both fail, plan-B in `PLAN.MD` risks table: "full-spine, no lazy expand" caps usable size at ~150MB but still ships.
