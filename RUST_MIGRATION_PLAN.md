# Rust/WASM Migration Plan

Goal: move the performance-critical JSON engine to Rust without rewriting the app UI.

Recommendation: keep the React/Vite/TypeScript frontend. Add a Rust crate compiled to WebAssembly and call it from the existing worker boundary. The first Rust target should be the streaming JSON/NDJSON parser and byte-level search, because those are the current technical moat and the most expensive paths. Schema inference can follow once the parser worker owns the Rust state.

## Non-Negotiable Contracts

- Browser-only, static deploy, no backend.
- Large files must stay `Blob`/stream based. Do not materialize 200-500 MB JSON as a JS string or one full JS object.
- Keep the public `ParserWorkerAPI` shape initially: `parseFile`, `expandStub`, `searchStubs`, `abort`, `abortSearch`.
- Preserve the current `TreeNode` discriminated union and JSON Pointer `id` / JSONPath `path` split.
- Preserve `MAX_SPINE_DEPTH = 2`, byte-range stubs, preview ranges, byte-index sampling, partial-root parse errors, NDJSON line ranges, and stub expansion semantics.
- Keep all existing unit/e2e tests green before replacing the TypeScript parser as default.

## Proposed Architecture

```
React UI
  -> src/state/parserHost.ts
  -> src/lib/parser/parser.worker.ts
  -> Rust/WASM engine
     - incremental JSON tokenizer/parser
     - spine/stub tree builder
     - NDJSON line indexing
     - stub/line byte search
     - later: schema sampling/inference
```

The TypeScript parser should remain as a fallback during migration. In early phases, the worker can choose the engine with a debug flag such as `?engine=rust` or an internal constant. Once parity and benchmark gates pass, Rust becomes the default and the old parser becomes a fallback or is deleted.

## Phase 0: Baseline And Guard Rails

1. Run and record current gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:run`
   - `npm run build`
   - `npm run test:e2e` where Playwright is available
   - `SMOKE=1 npm test -- --run benchmarks/smoke-200mb.test.ts` when the fixture exists
2. Capture current benchmark numbers from `benchmarks/methodology.md` as the regression baseline.
3. Add no Rust yet. This phase exists so any later speed or memory claim is measured against the real app.

## Phase 1: Add Rust Build Skeleton

New files:

- `rust-toolchain.toml`: pin stable Rust for local/CI reproducibility.
- `crates/json_engine/Cargo.toml`: Rust crate with `cdylib`, `wasm-bindgen`, `serde`, `serde-wasm-bindgen`, and test dependencies.
- `crates/json_engine/src/lib.rs`: tiny exported smoke function plus future module declarations.
- `crates/json_engine/src/error.rs`: shared engine error shape mapped to JS.
- `crates/json_engine/src/types.rs`: Rust mirrors of `TreeNode`, `ByteRange`, `ParseResult`.
- `src/lib/parser/wasmEngine.ts`: lazy loader for the generated WASM package.
- `src/lib/parser/engine.ts`: small TS facade selecting TypeScript or Rust engine.
- `scripts/build-wasm.mjs`: wraps `wasm-pack build` or equivalent with a stable output path.

Existing files to change:

- `package.json`: add `wasm:build`, `wasm:test`, and make `build` depend on the WASM artifact once Rust is required.
- `package-lock.json`: update only if a JS build helper dependency is added.
- `.gitignore`: decide whether generated WASM output is committed. For Cloudflare simplicity, committing generated `src/generated/json_engine/*` is acceptable; otherwise CI/Pages must install Rust.
- `tsconfig.app.json`: include generated WASM typings if committed under `src/generated`.
- `eslint.config.js`: ignore generated WASM JS glue if it is committed.
- `.github/workflows/ci.yml`: install Rust and run `npm run wasm:build` if generated output is not committed.
- `.github/workflows/perf.yml`: build the Rust engine before the smoke test once Rust is default.
- `README.md`, `CONTRIBUTING.md`, `docs/deploy-cf-pages.md`: document Rust toolchain and build command.

## Phase 2: Port Shared Parser Semantics

Rust implementation should duplicate these exact TypeScript rules before parsing large files:

- `src/lib/parser/identity.ts`: port `pointerSegment`, `appendPointer`, `appendDisplayPath`, and safe identifier logic into Rust. Keep the TS file for UI/tests, but add parity tests.
- `src/lib/json/identifier.ts`: keep in TS; Rust has its own equivalent.
- `src/lib/parser/parser-types.ts`: keep TS as the API contract. Add comments/types only if the Rust engine needs an explicit version marker.
- `src/lib/parser/sample-index.ts`: port sampling logic to Rust so Rust can return already-sampled `byteIndex`.
- `src/lib/parser/sample-index.test.ts`: add Rust parity cases through the worker/engine facade.
- `src/lib/parser/identity.test.ts` and `src/lib/parser/pathological-keys.test.ts`: run against both TypeScript and Rust paths until Rust becomes default.

## Phase 3: Port Streaming JSON Parser

Rust modules:

- `crates/json_engine/src/json/tokenizer.rs`: byte-level JSON tokenizer with byte offsets, UTF-8 correctness, BOM handling, string escape handling, number tokens, and partial-error reporting.
- `crates/json_engine/src/json/spine.rs`: current depth-2 spine/stub builder.
- `crates/json_engine/src/json/preview.rs`: first-three-child preview range capture.
- `crates/json_engine/src/json/parse.rs`: public incremental parse session.
- `crates/json_engine/src/path.rs`: JSON Pointer and JSONPath helpers.
- `crates/json_engine/src/sampling.rs`: byte-index sampling.

Existing files to change:

- `src/lib/parser/parse-streaming.ts`: keep as `parseStreamingTs` or fallback. Do not delete until Rust passes all parser tests.
- `src/lib/parser/parser.worker.ts`: load WASM once, stream `Blob` chunks into the Rust parser, and convert Rust result to the existing `ParseResult`.
- `src/state/parserHost.ts`: ideally unchanged API; optionally add debug logging for engine name and WASM init time.
- `src/state/useStubExpansion.ts`: no API change; verify `expandStub` still rebases `basePath` and `baseId`.
- `src/lib/tree/parse.ts`: keep `TreeNode` type. Do not change UI-facing node shapes in phase 3.
- `src/lib/tree/splice.ts`: no logic change, but its tests must prove Rust expansion roots splice correctly.
- `src/lib/parser/parse-streaming.test.ts`: convert to an engine test matrix: TypeScript fallback plus Rust engine.
- `src/lib/parser/parser.worker.test.ts`: extend worker-boundary tests for Rust parse/expand where possible.
- `benchmarks/parser-direct.mjs`: add or replace with `benchmarks/parser-rust-direct.mjs` for WASM direct timing.
- `benchmarks/smoke-200mb.test.ts`: report `engine: "rust"` and compare against current parse/flatten thresholds.

Acceptance gates:

- All current parser tests pass on Rust.
- 200 MB JSON parse does not regress by more than 10% before optimization.
- 500 MB browser run stays under current memory peak.
- Partial-root behavior remains visible on malformed/truncated JSON.

## Phase 4: Port NDJSON And Byte Search

Rust modules:

- `crates/json_engine/src/ndjson.rs`: `detect_ndjson`, line index, line node emission.
- `crates/json_engine/src/search.rs`: byte-level ASCII-insensitive search across stub and line ranges with batched progress.

Existing files to change:

- `src/lib/json/ndjson.ts`: keep as TS fallback or reduce to a thin wrapper for tests.
- `src/lib/parser/parse-ndjson.ts`: route through the parser worker instead of main-thread `Blob.arrayBuffer()` scanning.
- `src/components/tree/TreeView.tsx`: remove the separate main-thread NDJSON branch once worker parsing supports NDJSON. Keep detection/dispatch inside worker.
- `src/lib/parser/parser.worker.ts`: implement Rust-backed `searchStubs` and NDJSON parse mode.
- `src/state/parseStats.ts`: no shape change; ensure NDJSON parse timing still records.
- `src/lib/tree/search.ts`: keep synchronous materialized-row search in TS; Rust only replaces deep byte-range scanning in this phase.
- `src/lib/json/ndjson.test.ts`, `src/lib/parser/parse-ndjson.test.ts`, `src/lib/parser/parser.worker.test.ts`: run Rust-backed parity.
- `benchmarks/ndjson-direct.mjs`: add Rust/WASM direct timing.
- `benchmarks/methodology.md`: re-measure NDJSON browser parse time, currently documented as a measurement gap.

Acceptance gates:

- NDJSON detection matches existing tests.
- 200 MB NDJSON parse moves off the main thread.
- Search result sets match current ASCII-only behavior.
- `abortSearch()` still stops long scans.

## Phase 5: Move Schema Inference To The Parser Engine

Reason: current schema inference clones the whole `TreeNode` into a second worker. That is documented as a 200-500 MB scale cost.

Rust modules:

- `crates/json_engine/src/schema/infer.rs`: Rust equivalent of `src/lib/schema/infer.ts`.
- `crates/json_engine/src/schema/ir.rs`: serializable IR compatible with TS emitters.
- Optional later: Rust emitters. Do not do this first; TS emitters are cheap and well tested.

Existing files to change:

- `src/lib/parser/schema.worker.ts`: either delete or turn into a compatibility wrapper. Preferred: schema inference becomes a method on parser worker.
- `src/state/schemaHost.ts`: call parser worker instead of a separate schema worker.
- `src/components/tree/RightPane.tsx`: no UI change; same `inferSchemaForRoot` facade.
- `src/lib/schema/infer.ts`: keep as test fallback initially; delete only after Rust IR parity is proven.
- `src/lib/schema/types.ts`: keep TS IR type. Add a JSON-serializable variant if Rust cannot preserve `Map`.
- `src/lib/schema/emit-json-schema.ts`, `emit-typescript.ts`, `emit-zod.ts`: keep in TS; they are not hot.
- `src/lib/schema/*.test.ts`: add Rust IR fixture tests, keep emitter tests unchanged.
- `benchmarks/methodology.md`: remove/resolve the schema structured-clone limitation after measurement.

Acceptance gates:

- Schema outputs match existing fixtures for JSON Schema, TypeScript, and Zod.
- Schema refresh no longer pays the full-root structured clone.
- Stub/NDJSON sampled slices still parse safely.

## Phase 6: Optional Hot-Path Cleanup

Only do these after parser/search/schema Rust paths are stable:

- `src/components/table/useRowMaterialization.ts`: replace per-row `Blob.slice().text() -> JSON.parse` with parser-worker `parseSliceValue` for large stub-backed rows.
- `src/components/table/TablePane.tsx`: keep UI; optionally push materialize-all sort into worker for rows under threshold.
- `src/lib/table/columns.ts`, `primaryArray.ts`, `sort.ts`: keep TS unless profiling says otherwise.
- `src/lib/query/jsonpath.ts`: leave JS. It depends on `jsonpath-plus` and already documents the stub limitation. Move only if query becomes a measured bottleneck.
- `src/lib/diff/semantic.ts`: leave JS for now. It operates on materialized trees and is user-triggered.
- `src/lib/json/format.ts`: leave JS. Formatting/minifying whole text is editor-scale, not huge-file-scale.
- `src/lib/json/repair.ts`: leave JS. `jsonrepair` is specialized and UI-reviewed.
- `src/lib/share/share.ts`, `src/lib/net/fetchUrl.ts`, `src/lib/clipboard.ts`: no Rust value.

## File-By-File Change Map

### Parser And Tree Core

- `src/lib/parser/parser-types.ts`: keep API contract; add engine/version fields only if needed.
- `src/lib/parser/parser.worker.ts`: major change; initialize WASM, route parse/expand/search to Rust.
- `src/lib/parser/parse-streaming.ts`: keep as fallback during migration; later delete or move to `parse-streaming.ts.bak` equivalent only after parity.
- `src/lib/parser/parse-ndjson.ts`: replace main-thread parser with worker/Rust route.
- `src/lib/parser/identity.ts`: keep TS helper; mirror logic in Rust and test parity.
- `src/lib/parser/sample-index.ts`: mirror in Rust; keep TS tests.
- `src/lib/parser/schema.worker.ts`: phase 5 replacement or removal.
- `src/lib/parser/__fixtures__/pathological-keys.json`: unchanged, but becomes a Rust parity fixture.
- `src/lib/tree/parse.ts`: keep `TreeNode` union stable.
- `src/lib/tree/flatten.ts`: keep TS initially; future candidate for Rust/worker only if FlatRow memory remains a bottleneck.
- `src/lib/tree/search.ts`: keep materialized-row search TS; deep byte-range search moves to Rust.
- `src/lib/tree/splice.ts`: unchanged logic; verify Rust expansion output.
- `src/lib/tree/metrics.ts`: unchanged.
- `src/lib/tree/preview.ts`: unchanged; Rust must emit equivalent preview ranges.
- `src/lib/tree/subtree.ts`: unchanged.
- `src/lib/tree/to-plain.ts`: unchanged.
- `src/lib/tree/highlight.tsx`: unchanged.

### State And Worker Hosts

- `src/state/parserHost.ts`: preserve public facade; add WASM init/error handling if needed.
- `src/state/schemaHost.ts`: later route schema inference through parser worker.
- `src/state/viewStore.ts`: no required Rust change; possible future split into parser session store.
- `src/state/useStubExpansion.ts`: no API change; validate expansion parity.
- `src/state/documentStore.ts`: unchanged.
- `src/state/parseStats.ts`: unchanged shape; make sure Rust writes stats through existing paths.
- `src/state/viewStore.test.ts`: unchanged except expectations if engine metadata is added.

### JSON, Query, Diff, Table, Share

- `src/lib/json/ndjson.ts`: Rust parity then fallback/deletion decision.
- `src/lib/json/format.ts`: unchanged.
- `src/lib/json/repair.ts`: unchanged.
- `src/lib/json/identifier.ts`: unchanged; mirrored in Rust.
- `src/lib/query/jsonpath.ts`: unchanged initially.
- `src/lib/diff/semantic.ts`: unchanged initially.
- `src/lib/diff/baseline.ts`: unchanged.
- `src/lib/table/columns.ts`: unchanged initially.
- `src/lib/table/primaryArray.ts`: unchanged.
- `src/lib/table/sort.ts`: unchanged.
- `src/lib/share/share.ts`: unchanged.
- `src/lib/share/useShareHashLoad.ts`: unchanged.
- `src/lib/net/fetchUrl.ts`: unchanged; it already returns `Blob`, which is ideal for Rust/WASM worker parsing.
- `src/lib/clipboard.ts`, `src/lib/utils.ts`, `src/lib/theme/useDarkClass.ts`, `src/lib/monaco/init.ts`, `src/lib/samples/samples.ts`: unchanged.

### React Components

No full React rewrite. These should mostly stay unchanged:

- `src/components/tree/TreeView.tsx`: remove main-thread NDJSON branch after worker supports it.
- `src/components/tree/TreeNode.tsx`: unchanged unless node shape changes, which phase 1-5 should avoid.
- `src/components/tree/useStubPreview.ts`: unchanged.
- `src/components/tree/useTreeKeyboardNav.ts`: unchanged.
- `src/components/tree/useVisibleRows.ts`: unchanged.
- `src/components/tree/DetailDrawer.tsx`: optional future: ask worker to pretty-print line/stub content.
- `src/components/tree/RightPane.tsx`: no UI change; schema host changes beneath it.
- `src/components/schema/SchemaPane.tsx`: unchanged.
- `src/components/table/TablePane.tsx`: unchanged initially; optional worker-backed row materialization later.
- `src/components/table/useRowMaterialization.ts`: optional later change to worker-backed parsing.
- `src/components/query/QueryPane.tsx`: unchanged.
- `src/components/diff/DiffPane.tsx`: unchanged.
- `src/components/editor/MonacoPane.tsx`: unchanged.
- `src/components/editor/EditorToolbar.tsx`: unchanged.
- `src/components/editor/RepairDialog.tsx`, `ShareDialog.tsx`, `EmptyStateHero.tsx`, `constants.ts`: unchanged.
- `src/components/debug/MemoryHud.tsx`: add engine label only if useful.
- `src/components/debug/useDebugFlag.ts`: unchanged.
- `src/components/layout/*`: unchanged.
- `src/components/ui/*`: unchanged generated shadcn vendor layer.

### App Shell, Routes, Styles, Public Assets

- `src/App.tsx`, `src/RootLayout.tsx`, `src/routes.tsx`, `src/main.tsx`: unchanged.
- `src/pages/*.tsx`: unchanged, except copy can mention Rust-powered parser after launch.
- `src/index.css`: unchanged.
- `src/types/monaco-*.d.ts`: unchanged.
- `index.html`, `public/theme-init.js`, `public/_headers`, `public/robots.txt`, icons/png/svg: unchanged.

### Tests

- Parser tests become engine-matrix tests: run the same assertions against TS fallback and Rust.
- `src/lib/parser/parse-streaming.test.ts`: highest priority parity suite.
- `src/lib/parser/pathological-keys.test.ts`: highest priority identity/path safety suite.
- `src/lib/parser/parser.worker.test.ts`: add Rust worker boot/search/abort coverage.
- `src/lib/json/ndjson.test.ts` and `src/lib/parser/parse-ndjson.test.ts`: Rust NDJSON parity.
- `src/lib/schema/infer.test.ts`: Rust IR parity once schema moves.
- `src/lib/tree/*`, `src/lib/table/*`, `src/lib/query/*`, `src/lib/diff/*`: should continue to pass without major edits.
- `e2e/regressions/*.spec.ts`: mostly unchanged; they become integration proof that Rust did not alter UI behavior.
- Add at least one e2e case for `?engine=rust` during the transition if Rust is not default yet.

### Benchmarks And Docs

- `benchmarks/parser-direct.mjs`: add Rust/WASM equivalent.
- `benchmarks/ndjson-direct.mjs`: add Rust/WASM equivalent.
- `benchmarks/parser-shape-bench.mjs`: keep TS historical benchmark; add Rust notes or a sibling benchmark.
- `benchmarks/smoke-200mb.test.ts`: include engine name and Rust measurements.
- `benchmarks/methodology.md`: re-measure 200 MB JSON, 500 MB JSON, 200 MB NDJSON, search wall-clock, and schema refresh.
- `README.md`: update stack from `@streamparser/json` to Rust/WASM engine once default.
- `PLAN.MD`, `PLAN_M2.md`, `launch-readiness-gate.md`, `ENGINEERING_ASSESSMENT.md`, `CHANGELOG.md`: update only when phases land, not in advance.
- `docs/deploy-cf-pages.md`: document Rust/WASM build/deploy path.
- `docs/dependency-overrides.md`: unchanged unless Rust build changes JS deps.

## Suggested Order Of Commits

1. `chore(wasm): add rust json engine skeleton`
2. `test(parser): run parser contract against selectable engines`
3. `feat(parser): implement rust spine parser behind worker flag`
4. `perf(parser): make rust parser default after parity`
5. `feat(ndjson): move ndjson indexing into rust worker`
6. `perf(search): move stub byte search into rust worker`
7. `perf(schema): infer schema through parser engine`
8. `docs(bench): publish rust parser benchmark results`

## Main Risks

- Returning millions of JS objects from WASM can still be expensive. Phase 1 should preserve behavior; later phases can use compact transferable buffers if needed.
- A generic Rust JSON parser may not expose the offset and duplicate-key semantics this app requires. A small custom tokenizer is likely safer than forcing `serde_json::Value` into the primary parse path.
- WASM build setup can complicate Cloudflare Pages. Decide early whether generated WASM artifacts are committed or Rust is installed in the deploy build.
- Search abort needs cooperative yields. Long Rust loops must return to JS periodically or process in batches.
- Schema IR cannot use `Map` across WASM directly. Use a JSON-serializable field list and convert to TS `Map` only where emitters need it.

## Definition Of Done

- Existing behavior is unchanged in the UI.
- Rust is default for JSON parse, stub expansion, NDJSON parse, and deep byte search.
- All existing unit tests, e2e tests, build, lint, and typecheck pass.
- 200 MB and 500 MB benchmark rows are re-measured and documented.
- No privacy regression: no backend, no remote schema fetch, no CDN parser.
- The TypeScript parser fallback is either deleted with confidence or intentionally retained with a clear comment and test coverage.
