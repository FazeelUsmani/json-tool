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

- The `@streamparser/json` branch uses **string-search** to recover offsets — fine for spike fixtures but O(N) per value. Production uses `Tokenizer.onToken` (true byte offsets per token) — see `src/lib/parser/parse-streaming.ts`.
- The `stream-json` branch was removed 2026-05-25 along with the unused dep. `@streamparser/json` won on day 1 and that decision has held.
- If anyone needs to re-introduce alternative parsers later, the `ParserKind` enum in `worker.ts` and the dropdown in `index.html` are the wiring points.
