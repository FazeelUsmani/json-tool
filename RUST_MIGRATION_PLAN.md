# Rust/WASM Migration Plan

> **STATUS: PARKED — superseded (2026-05-27 evening).** User pivoted
> to the full-rewrite path; engine-only migration is no longer the
> active scope. See `RUST_REWRITE_PLAN.md` (active) and
> `PLAN_UNIFIED.md` (master roadmap).
>
> This plan stays as a real fallback if rewrite-cost becomes blocking.
> Phase 0 baseline below remains valid as historical record of the
> TS implementation's perf characteristics — useful as parity floor
> for measuring the Rust app's perf gains against the existing app.
>
> ---
>
> **Prior status (2026-05-27 afternoon, now historical):** Phase 0
> complete; Phase 1 paused for brand session. User overrode the
> earlier post-launch deferral and ran Phase 0 baseline capture on
> 2026-05-26. Pre-Phase-0 Decisions were resolved on 2026-05-27
> (see below — all 5 resolved + 1 new skill-ramp decision added).
> Phase 1 (Rust/WASM skeleton) was paused pending the brand session,
> which remains the load-bearing launch unblock.
>
> Phase 0 baseline captured in `benchmarks/methodology.md`
> § "Rust migration baseline — 2026-05-26 (Phase 0)" — gates green,
> precache 5277.83 KiB / 37 entries, 8 go/no-go hypotheses with stop
> conditions, 4 measurement gaps enumerated.
>
> **Phase 1 resumes after the brand session lands.** When that
> happens, Pre-Phase-0 Decisions below are already resolved — Phase 1
> can start with toolchain-version pick (the one deferred decision)
> and proceed to skeleton work without re-deciding scope.
>
> **Original deferral reasoning** (still accurate; user overrode but
> reasoning didn't change): brand decision is W2-Wed deadline slipped;
> current 200 MB parse is already under the 60s budget (5.6 s
> measured) and 200 MB INP is under Chrome's "good" 200 ms threshold
> (168 ms measured). Rust would buy ~1.5-2× tokenization speedup
> after 3-6 weeks of work — bad ROI vs. the launch path. See
> `benchmarks/methodology.md` for the measurements.
>
> **Deferral rationale.** The immediate launch-path bottleneck is the
> brand decision (W2-Wed deadline, slipped), not engine performance.
> Current 200 MB parse is already under the 60s budget (5.6 s measured)
> and 200 MB INP is under Chrome's "good" 200 ms threshold (168 ms
> measured). Rust would buy ~1.5-2× tokenization speedup after 3-6
> weeks of work — bad ROI vs. the launch path. See
> `benchmarks/methodology.md` for the measurements.
>
> **Assumptions to re-verify before any Phase 0 execution** (each was
> incorrect in an earlier critique pass against this plan):
>
> - **parserHost lifecycle** — currently terminates + recreates the
>   worker per parse; no session tree persisted. Schema-through-
>   parser-worker is NOT a 2-hour cleanup — it needs session-ownership
>   work first. See `src/state/parserHost.ts`.
> - **Worker postMessage cost** — the expensive direction is RETURNING
>   `TreeNode`/row graphs, not transferring input bytes (input is
>   already a `Blob` streamed in-worker via `file.stream()`).
>   Transferable ArrayBuffers help only if node output is redesigned
>   into typed buffers — a much bigger surface than this plan
>   originally implied.
> - **Search result streaming** — already shipped. `searchStubs`
>   batches results + progress via `src/lib/parser/parser.worker.ts`;
>   `TreeView` consumes batches via `src/components/tree/TreeView.tsx`.
>   Not a pending JS-side win.
> - **Workbox precache glob** — `vite.config.ts` does NOT include
>   `.wasm` in the precache glob today. Without an explicit addition,
>   the WASM blob would not be precached at all — the question isn't
>   "precache total may balloon," it's "will the WASM ship in the
>   service-worker cache at all." Add to Phase 1 deploy work.
> - **500 MB worst-case INP (560 ms)** — partly main-thread
>   `findMatches`/FlatRow path. Rust byte-scanning helps deep stub
>   search but does NOT directly fix the materialized-row search
>   cost. Hitting ≤ 300 ms target needs representation/indexing
>   changes in TS too.
>
> Below: a corrected design reference, **not active scope**. Any future
> execution must start with the pre-flight decisions and JS-cleanup
> checkpoint below; do not jump straight to the WASM skeleton.
>
> ---

## Pre-Phase-0 Decisions

Resolved before adding any Rust files (resolutions captured 2026-05-27):

- **Deploy artifact policy: ✅ COMMIT generated WASM.** Commit
  generated `src/generated/json_engine/*` output so Cloudflare Pages
  keeps using the simple npm static build, no Rust toolchain install
  in the deploy pipeline. Cost: ~200-400 KB binary in git on every
  Rust change. Revisit CI-generated artifacts only after the engine
  is stable. Resolution date: 2026-05-27.
- **Rust toolchain pin: ⏳ DEFERRED to Phase 1 start.** Add
  `rust-toolchain.toml` with an exact stable version chosen on the
  day Phase 1 begins (not an old example version). Upgrade quarterly
  and immediately for relevant security or wasm-bindgen advisories.
  Picking the version now would lock in a stale toolchain by the time
  Phase 1 actually starts post-brand.
- **WASM shipping and offline policy: ✅ FULL OFFLINE.** Add `.wasm`
  to the Workbox precache glob in `vite.config.ts` so the PWA keeps
  the current offline-parsing guarantee. Track precache delta
  against the Phase 0 baseline (5277.83 KiB → expected ≤ 5600 KiB).
  Resolution date: 2026-05-27.
- **Size budget: ✅ ≤ 250 KiB gzipped target.** Hard cap `json_engine`
  WASM at ≤ 250 KiB gzipped, with any > 400 KiB result requiring an
  explicit keep/optimize decision documented in
  `launch-readiness-gate.md`. With `.wasm` precached, keep total PWA
  precache growth ≤ 400 KiB delta from baseline. Resolution date:
  2026-05-27.
- **Go/no-go hypothesis: ✅ CAPTURED in methodology.md.** 8 hypotheses
  with explicit > 30%-miss stop conditions documented in
  `benchmarks/methodology.md` § "Rust migration baseline — 2026-05-26
  (Phase 0)". If the relevant post-phase measurements miss those
  predictions by > 30%, stop and choose one of: optimize further,
  keep Rust only for the proven sub-feature, or revert/park the
  migration. Resolution date: 2026-05-26.
- **Skill ramp budget: ✅ 2-3 WEEKS RAMP before Phase 3.** Solo dev
  new-to-Rust. Write a small Rust+WASM toy project first
  (hello_world + tokenizer kata) before touching `json_engine`'s
  primary parser. Reduces risk of conflating Rust unfamiliarity with
  parser correctness bugs. Total migration estimate adjusts: ~6-8
  weeks elapsed vs. plan's ~3-6 (the original number didn't budget
  ramp time). Resolution date: 2026-05-27.
- **Rust core repo location: ✅ IN-REPO, EXTRACTABLE.** `crates/json_engine`
  lives in this repo (Approach C — start in `json-tool`, design for
  future extraction). Engine boundary stays clean: no
  `json-tool`-specific assumptions in the Rust lib, JSON-serializable
  IR across the WASM boundary, narrow public API (`parseFile`,
  `expandStub`, `searchStubs`). Future extraction to a standalone
  `json-engine-rs` crate (for M3 paid-product backend reuse, future
  CLI, etc.) is mechanical — `git filter-branch` + `npm publish` —
  not a redesign. Cost of writing for extractability is ~zero given
  the boundary is already designed clean in the plan. Resolution
  date: 2026-05-27.

## JS Cleanup Checkpoint

Before Rust execution, re-check whether smaller TypeScript changes make
the migration unnecessary.

Candidate work must be described accurately against the current code:

- **Schema-through-parser-worker is not a 2-hour quick win today.**
  `parserHost.parseFile` terminates and recreates the parser worker per
  parse, and the parser worker does not retain the root tree as a
  session. Fixing schema clone cost through the parser worker requires
  a session-owned parser architecture first.
- **Transferable ArrayBuffers are not the current input fix.** The
  input file is already passed as a `Blob` and streamed inside the
  worker. Transferables become relevant only if node/row output is
  redesigned into typed buffers or compact arrays.
- **Incremental deep-search result streaming already exists.**
  `searchStubs` sends 2000-result batches and progress callbacks. The
  remaining 500 MB INP risk is mainly the main-thread
  `findMatches`/FlatRow path and representation cost.

Exit rule: if targeted JS work gets 200 MB parse below 4 s, 500 MB
worst-case search INP below 300 ms, and 200 MB peak memory below
800 MB, Rust is no longer ROI-positive for launch work. Keep this plan
parked unless a specific remaining operation still justifies it.

Goal: move the hot JSON engine to Rust/WASM while keeping the existing React/Vite product intact.

Decision: this is not a Rust frontend rewrite. The app should stay React, TypeScript, Monaco, Tailwind, Zustand, Radix/shadcn, Vitest, and Playwright. Rust should replace the expensive browser-side data engine behind the current worker API.

## Executive Summary

Use Rust/WASM for:

- Streaming JSON parsing.
- Depth-2 spine and byte-range stub generation.
- Stub expansion from byte slices.
- NDJSON detection and line indexing.
- Byte-level search across collapsed stubs and NDJSON lines.
- Later: schema inference in the parser worker to remove full-tree structured clone cost.

Do not move first:

- React components.
- Monaco/editor flows.
- URL loading.
- JSON repair.
- share links.
- JSONPath query.
- semantic diff.
- table rendering and sorting.
- schema emitters.

The first useful Rust milestone is: `parseFile`, `expandStub`, and `searchStubs` behave exactly like today through `src/state/parserHost.ts`, with an engine flag that lets us compare TypeScript vs Rust without touching the UI.

## Current Code Reality

The current app is already shaped well for a Rust engine:

- `src/state/parserHost.ts` owns the browser worker lifecycle.
- `src/lib/parser/parser.worker.ts` exposes a small Comlink API: `parseFile`, `expandStub`, `searchStubs`, `abort`, `abortSearch`.
- `src/lib/parser/parse-streaming.ts` is pure parser logic, already isolated from React and DOM.
- `src/lib/tree/parse.ts` defines the UI-facing `TreeNode` contract.
- `src/components/tree/TreeView.tsx` consumes only parser results and should not know whether the engine is TS or Rust.
- `src/lib/parser/identity.ts` has load-bearing JSON Pointer and JSONPath behavior that Rust must match.
- `src/lib/parser/pathological-keys.test.ts` and `src/lib/parser/parse-streaming.test.ts` are the main parity safety net.
- `benchmarks/methodology.md` already records 200 MB / 500 MB expectations and known bottlenecks.

The biggest current costs worth attacking are:

- TS tokenizer/parser throughput and object allocation.
- Worker-to-main structured clone of large `TreeNode` and `FlatRow` shapes.
- Main-thread NDJSON indexing in `TreeView`.
- Deep search scanning in `parser.worker.ts`.
- Schema worker structured-cloning the full root on every refresh.

## Non-Negotiable Contracts

- Browser-only static deployment remains true. No backend.
- File/URL data stays local. No parser CDN, no remote schema fetch, no upload.
- Large files stay `Blob`/stream based. Do not turn 200-500 MB input into one JS string or one full JS object.
- Preserve `TreeNode` shape during the initial migration.
- Preserve JSON Pointer `id` and JSONPath `path` as separate fields.
- Preserve `MAX_SPINE_DEPTH = 2`.
- Preserve byte-range stubs, preview ranges, child counts, byte-index sampling, partial-root errors, and stub expansion.
- Preserve NDJSON line-node semantics.
- Preserve ASCII-only case-insensitive deep search unless intentionally changing tests and UI copy.
- Keep the TypeScript parser available until Rust is default and measured.

## Recommended Rust Boundary

Keep the public host API stable:

```ts
parseFile(file: Blob, onProgress?: (p: ParseProgress) => void): Promise<ParseResult>
expandStub(file: Blob, byteStart: number, byteEnd: number, basePath: string, baseId: string): Promise<ParseResult>
searchStubs(file: Blob, ranges: Range[], needle: string, onBatch: BatchCb): Promise<void>
abort(): void
abortSearch(): void
```

Inside `parser.worker.ts`, add an engine facade:

```ts
type ParserEngine = {
  parseFile(file: Blob, opts: ParseOpts): Promise<ParseResult>;
  expandStub(file: Blob, req: ExpandReq): Promise<ParseResult>;
  searchStubs(file: Blob, req: SearchReq): Promise<void>;
};
```

Implement two engines:

- `tsParserEngine`: wraps the current `parseStreaming`, `parseNdjson`, and `searchStubs` logic.
- `rustParserEngine`: loads WASM and calls Rust.

Selection during migration:

- `?engine=rust` forces Rust.
- `?engine=ts` forces TypeScript.
- default stays TypeScript until phase gates pass.
- after Rust is default, keep `?engine=ts` for one release cycle as rollback.

## Data Transfer Strategy

The first parser integration should return the existing JS object shapes
from WASM. That is the lowest-risk integration because the UI and tests
do not change.

A later measured optimization can change the transfer format if needed:

- Rust returns compact arrays or typed buffers for nodes.
- TS adapts compact output into `TreeNode`.
- Later, worker-side flattening could avoid transferring recursive trees.

Do not start with compact binary node transfer. It would mix two hard problems: parser parity and representation migration.

## Rust Parser Strategy

Use a custom byte-level tokenizer for the main parse path.

Do not base the primary parser on `serde_json::Value`, because it loses or complicates several current contracts:

- duplicate keys must be preserved as separate children;
- byte ranges must map exactly to source spans;
- partial-root parse errors must preserve whatever spine was built;
- depth-2 stubbing should avoid materializing deeper values;
- preview range capture needs token offsets;
- NDJSON line indexing should not parse every line during initial load.

`serde_json` is still useful for small slice validation, schema sampled values, and tests, but not for the streaming-spine parser.

## Build Strategy

Recommended first implementation:

- Add a Rust crate at `crates/json_engine`.
- Pin `rust-toolchain.toml` to an exact stable Rust version chosen on
  the day implementation starts.
- Build with `wasm-pack` or `wasm-bindgen-cli`.
- Generate JS/WASM output into `src/generated/json_engine`.
- Commit generated WASM output during the migration to keep Cloudflare Pages simple.
- If offline parsing is required, add `.wasm` to the Workbox precache
  glob in `vite.config.ts` and verify the size budget. If not, document
  that WASM is loaded through normal browser HTTP caching.

Later cleanup:

- Once the Rust build is stable, choose whether CI/deploy should generate WASM instead of committing it.
- If CI generates it, update Cloudflare Pages setup to install Rust and run `npm run wasm:build`.

This repo is currently optimized for a simple npm-based static deploy, so committing the generated WASM initially is the safer operational choice.

## Phase 0: Baseline

Purpose: know what we are trying not to break.

Actions:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run test:run`.
- Run `npm run build`.
- Run `npm run test:e2e` where browser dependencies are available.
- Run `SMOKE=1 npm test -- --run benchmarks/smoke-200mb.test.ts` when the fixture exists.
- Record current parser metrics from `benchmarks/methodology.md`.
- Record current cold path: page load to first parser-ready state,
  parser-worker boot time, and first-search INP.
- Record current PWA precache total before any WASM is added.

Exit criteria:

- Current main branch behavior is documented.
- Existing measurement gaps are listed before Rust changes begin.
- Go/no-go hypotheses are written down: expected parse speedup,
  memory reduction, search-INP improvement, and schema-refresh
  improvement.

Files changed:

- ideally none.
- optional docs-only note in `benchmarks/methodology.md`.
- optional docs-only note in `launch-readiness-gate.md` if Rust becomes
  active launch scope.

## Phase 1: Rust/WASM Skeleton

Purpose: prove the toolchain works without touching parser behavior.

New files:

- `rust-toolchain.toml`
- `crates/json_engine/Cargo.toml`
- `crates/json_engine/src/lib.rs`
- `crates/json_engine/src/types.rs`
- `crates/json_engine/src/error.rs`
- `src/lib/parser/wasmEngine.ts`
- `src/lib/parser/engines/types.ts`
- `src/lib/parser/engines/tsEngine.ts`
- `src/lib/parser/engines/rustEngine.ts`
- `scripts/build-wasm.mjs`
- `src/generated/json_engine/*` if committing generated output

Existing files:

- `package.json`: add `wasm:build`, `wasm:check`, and maybe `prebuild`.
- `package-lock.json`: update only if JS tooling is added.
- `.gitignore`: do not ignore generated WASM if committing it.
- `tsconfig.app.json`: include generated typings if needed.
- `eslint.config.js`: ignore generated glue if needed.
- `README.md`, `CONTRIBUTING.md`, `docs/deploy-cf-pages.md`: add Rust setup notes only after skeleton is working.

Implementation details:

- Export one WASM smoke function, for example `engine_version()`.
- Load it from `src/lib/parser/wasmEngine.ts`.
- Install `console_error_panic_hook` in development/debug builds so
  Rust panics show useful browser console stacks instead of only
  `RuntimeError: unreachable`.
- Measure WASM compile/init time with `performance.now()` around module
  loading.
- Add a tiny Vitest test that imports the loader.
- Do not call Rust from production parser paths yet.
- Do not load `json_engine` from Monaco workers. Keep initial WASM
  loading isolated to the parser worker.

Exit criteria:

- `npm run wasm:build` works locally.
- `npm run build` includes the generated WASM without Vite errors.
- Cold worker boot plus WASM init is <= 200 ms, or the regression is
  documented before parser work continues.
- Generated artifact policy is implemented: committed output now, or
  CI/deploy generation with Cloudflare setup documented.
- `.wasm` precache behavior is decided and verified.
- CI path is clear.
- No parser behavior changed.

## WASM Module Scope Across Workers

Initial scope: load `json_engine` only inside `parser.worker.ts`.
Monaco's workers should never import it.

If a later phase needs Rust from more than one app worker, prefer
centralizing that work in the parser worker. If a separate worker is
unavoidable, test transferring a compiled `WebAssembly.Module` via
`postMessage` where browsers support it, with per-worker compilation as
the fallback. Track the cold-init budget once for the shared module path
and separately for any fallback path.

## Phase 2: Shared Semantics Parity

Purpose: port the small rules that make parser correctness possible.

Rust modules:

- `path.rs`: JSON Pointer and JSONPath helpers.
- `identifier.rs`: JS-style safe identifier check.
- `sampling.rs`: byte-index sampling.
- `types.rs`: serializable result structs.

Existing files:

- `src/lib/parser/identity.ts`: unchanged, but becomes a parity source.
- `src/lib/json/identifier.ts`: unchanged.
- `src/lib/parser/sample-index.ts`: unchanged initially.
- `src/lib/parser/identity.test.ts`: add Rust parity cases if practical.
- `src/lib/parser/sample-index.test.ts`: add Rust parity cases if practical.
- `src/lib/parser/pathological-keys.test.ts`: later run against Rust parser too.

Rules Rust must match:

- root id is `""`, root path is `"$"`;
- pointer escapes `~` as `~0` and `/` as `~1`;
- JSONPath uses dot notation only for safe identifiers;
- weird keys use bracket quoting via JSON-compatible string escaping;
- dots and brackets in keys must not collide with nested paths;
- duplicate-key behavior is not fully solved but must be no worse than today.

Exit criteria:

- Rust and TS produce identical ids and paths on pathological keys.
- byte-index sampling keeps/drops the same paths as TS.

## Phase 3: Rust JSON Parser Behind Flag

Purpose: implement the main parser while TypeScript remains default.

Rust modules:

- `json/token.rs`: token kinds and offsets.
- `json/tokenizer.rs`: byte tokenizer, UTF-8/string/number handling, BOM handling.
- `json/spine.rs`: stack frames, depth tracking, attach logic.
- `json/stub.rs`: stub state, child counting, preview range capture.
- `json/parse.rs`: exported parse entry and incremental session.
- `error.rs`: parse error with message, optional line/col/byte offset.

Existing files:

- `src/lib/parser/parse-streaming.ts`: rename internally or wrap as TS engine; keep tests.
- `src/lib/parser/parser.worker.ts`: select Rust when `?engine=rust`.
- `src/state/parserHost.ts`: preserve API; optionally log engine name under `?debug=1`.
- `src/lib/parser/parser-types.ts`: add `engine?: "ts" | "rust"` only if useful for benchmarks; do not require UI changes.
- `src/lib/tree/parse.ts`: keep node union stable.
- `src/state/useStubExpansion.ts`: no API change.

Worker implementation detail:

- Read `Blob.stream()` in JS.
- For each `Uint8Array` chunk, call `engine.push_chunk(chunk)`.
- Between chunks, check `abortFlag`.
- On completion, call `engine.finish()`.
- For stub expansion, pass `basePath`, `baseId`, and `byteOffsetBase`.

Important parser contracts:

- Primitive root values work.
- Objects preserve insertion order.
- Arrays preserve order.
- Duplicate keys remain separate children, matching current debug-tool semantics.
- Depth-2 composites become stubs.
- Stub byte ranges slice to valid JSON.
- Preview ranges capture first up to three immediate children.
- Multibyte UTF-8 offsets are byte offsets, not JS character offsets.
- Truncated or malformed JSON returns partial root where possible.

Tests:

- Convert `src/lib/parser/parse-streaming.test.ts` to an engine matrix.
- Keep TypeScript fallback tests in the same file or a sibling file.
- Add Rust worker boot coverage in `src/lib/parser/parser.worker.test.ts`.
- Run `src/lib/parser/pathological-keys.test.ts` against Rust.

Exit criteria:

- Rust passes all parser contract tests behind `?engine=rust`.
- Manual sample load works with `?engine=rust`.
- Small file drag/drop works with `?engine=rust`.
- No UI code depends on engine choice.

## Phase 4: Stub Expansion Parity

Purpose: make interactive large-file browsing work through Rust.

Existing files:

- `src/state/useStubExpansion.ts`: unchanged unless error shape needs mapping.
- `src/lib/tree/splice.ts`: unchanged; tests verify key preservation.
- `src/components/tree/TreeNode.tsx`: unchanged.
- `src/components/tree/DetailDrawer.tsx`: unchanged.

Rust requirements:

- `expandStub` reparses only `[byteStart, byteEnd)`.
- returned root id equals `baseId`;
- returned root path equals `basePath`;
- returned byte offsets are absolute via `byteOffsetBase`;
- replacement root key can stay `null` because `spliceSubtree` preserves original key.

Exit criteria:

- Expanding object stubs works.
- Expanding array stubs works.
- Expanding nested stubs inside expanded content works.
- Escape cancels in-flight expansion as today.
- e2e `tree-keyboard-nav.spec.ts` passes with Rust.

## Phase 5: Rust NDJSON In Worker

Purpose: remove main-thread NDJSON indexing from `TreeView`.

Rust modules:

- `ndjson/detect.rs`
- `ndjson/index.rs`
- `ndjson/tree.rs`

Existing files:

- `src/lib/json/ndjson.ts`: keep TS fallback and tests during migration.
- `src/lib/parser/parse-ndjson.ts`: route to worker or become fallback-only.
- `src/components/tree/TreeView.tsx`: remove the separate `parseNdjson(blob)` main-thread branch after worker parse supports mode detection.
- `src/state/parseStats.ts`: unchanged; parser host records stats for both modes.
- `src/lib/parser/parser.worker.ts`: parse mode detection happens inside worker.

Implementation detail:

- Worker reads the first 4 KB for detection or lets Rust inspect the initial chunk.
- Rust emits the same root array with `ndjson-line` children.
- Line byte ranges exclude trailing LF and CRLF.
- Blank lines are skipped.

Exit criteria:

- `src/lib/json/ndjson.test.ts` parity passes.
- `src/lib/parser/parse-ndjson.test.ts` parity passes.
- 200 MB NDJSON parse no longer blocks the main thread.
- `benchmarks/methodology.md` gets the missing NDJSON browser wall-clock number.

## Phase 6: Rust Deep Search

Purpose: replace the byte-range scanning hot path in `parser.worker.ts`.

Rust module:

- `search.rs`

Existing files:

- `src/lib/parser/parser.worker.ts`: `searchStubs` calls Rust.
- `src/state/parserHost.ts`: API unchanged.
- `src/lib/tree/search.ts`: keep synchronous materialized-row search in TS.
- `src/components/tree/TreeView.tsx`: unchanged except any engine flag plumbing.

Implementation detail:

- Keep batched progress.
- Keep terminal progress tick.
- Check abort between batches.
- Case folding stays ASCII-only: `A-Z` to `a-z`.
- Avoid per-range string allocation.
- Prefer processing ranges in chunks so the worker can observe abort messages.

Exit criteria:

- Existing worker search tests pass.
- Search result counts match TypeScript on fixtures.
- `abortSearch()` stops long scans.
- 200 MB and 500 MB search wall-clock numbers are measured.

## Abort And Yield Pattern

Rust/WASM calls are synchronous once entered, so JS cannot interrupt a
single long-running Rust loop. Long parser/search work must be exposed
as chunked steps that return to JS regularly.

Suggested pattern:

```rust
const CHUNK_BYTES_BETWEEN_YIELDS: usize = 64 * 1024;

if processed_since_yield >= CHUNK_BYTES_BETWEEN_YIELDS {
    if abort.is_aborted() {
        return Err(EngineError::Aborted);
    }
    return Ok(ParseStep::Yield(checkpoint));
}
```

The actual browser yield happens in the JS worker wrapper: call one
Rust step, check abort state, schedule the next step, and post progress
between steps. Do not rely on checking an abort flag only inside one
large WASM call.

## Phase 7: Make Rust Default

Purpose: switch the product to Rust only after behavior and metrics are proven.

Actions:

- Default engine becomes Rust.
- Keep `?engine=ts` rollback for one release cycle.
- Add debug HUD or console line showing active engine under `?debug=1`.
- Re-run full test suite and browser smoke.
- Update benchmark docs.

Files:

- `src/lib/parser/parser.worker.ts`
- `src/state/parserHost.ts`
- `src/components/debug/MemoryHud.tsx` only if showing engine in HUD.
- `benchmarks/methodology.md`
- `CHANGELOG.md`
- `README.md` stack section.

Exit criteria:

- `npm run typecheck`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- Playwright regression suite where available.
- 200 MB smoke passes.
- Manual 500 MB browser run survives.

## Phase 8: Schema Inference In Parser Engine

Purpose: remove the documented schema-worker structured clone cost.

Do this after Rust parser/search are stable. It is valuable, but not first.

Rust modules:

- `schema/ir.rs`
- `schema/infer.rs`
- `schema/sample.rs`

Existing files:

- `src/lib/parser/schema.worker.ts`: delete or turn into wrapper.
- `src/state/schemaHost.ts`: call parser worker method instead of a separate schema worker.
- `src/components/tree/RightPane.tsx`: unchanged UI.
- `src/components/schema/SchemaPane.tsx`: unchanged.
- `src/lib/schema/infer.ts`: keep until Rust IR parity is proven.
- `src/lib/schema/types.ts`: add JSON-serializable IR type if needed.
- `src/lib/schema/emit-json-schema.ts`: keep TS.
- `src/lib/schema/emit-typescript.ts`: keep TS.
- `src/lib/schema/emit-zod.ts`: keep TS.

Boundary recommendation:

- Rust returns schema IR as a plain JSON-serializable structure.
- TS converts field arrays to `Map` only if existing emitters require it.
- Keep emitters in TS because they are cheap and heavily tested.

Schema IR wire format:

```ts
type SchemaIr = {
  root: NodeShapeIr;
  fields: Array<[key: string, info: FieldInfoIr]>;
};
```

Use ordered arrays of key/info pairs instead of `Map`, because `Map`
does not cross the WASM boundary as a plain serializable value. TS can
reconstruct maps for existing emitters after receipt.

Exit criteria:

- Generated JSON Schema, TypeScript, and Zod match current tests.
- Schema refresh no longer clones full `TreeNode` across a second worker boundary.
- Methodology doc removes the structured-clone limitation or marks it fixed.

## Phase 9: Optional Optimizations

Only after the Rust default is stable:

- Worker-side flattening to reduce main-thread tree processing.
- Compact transferable node buffers.
- Worker-backed row materialization for table stubs.
- Worker-backed table sort below threshold.
- Worker pretty-print for detail drawer line/stub content.
- Inverted search index during parse.

Do not do these as part of the first Rust parser migration.

## File-by-File Plan

### Must Change

- `src/lib/parser/parser.worker.ts`: main integration point for Rust parse, expand, search.
- `src/state/parserHost.ts`: preserve facade; optional engine logging.
- `src/lib/parser/parse-streaming.ts`: becomes TS fallback, not primary long term.
- `src/lib/parser/parse-ndjson.ts`: becomes worker/Rust-backed or fallback-only.
- `src/lib/parser/parser-types.ts`: stable contract; optional engine metadata.
- `src/lib/parser/identity.ts`: mirrored in Rust; TS remains for UI/tests.
- `src/lib/parser/sample-index.ts`: mirrored in Rust; TS remains for parity tests.
- `src/lib/json/ndjson.ts`: mirrored in Rust; TS remains until Rust NDJSON default.
- `package.json`: add WASM scripts.
- `.github/workflows/ci.yml`: add Rust/WASM build step when generated output is not committed or when verifying generated output.
- `.github/workflows/perf.yml`: build/use Rust engine for perf smoke once default.
- `README.md`, `CONTRIBUTING.md`, `docs/deploy-cf-pages.md`: update build/setup docs.
- `benchmarks/methodology.md`: update measured numbers.
- `benchmarks/smoke-200mb.test.ts`: record engine.

### Should Not Change Initially

- `src/lib/tree/parse.ts`
- `src/lib/tree/flatten.ts`
- `src/lib/tree/search.ts` except tests or comments
- `src/lib/tree/splice.ts`
- `src/lib/tree/preview.ts`
- `src/state/viewStore.ts`
- `src/state/documentStore.ts`
- `src/components/tree/TreeNode.tsx`
- `src/components/tree/useVisibleRows.ts`
- `src/components/tree/useTreeKeyboardNav.ts`
- `src/components/editor/*`
- `src/components/layout/*`
- `src/components/ui/*`
- `src/lib/net/fetchUrl.ts`
- `src/lib/json/repair.ts`
- `src/lib/json/format.ts`
- `src/lib/query/jsonpath.ts`
- `src/lib/diff/semantic.ts`
- `src/lib/table/*`
- `src/lib/share/*`
- `src/lib/monaco/init.ts`

### Later Candidates

- `src/state/schemaHost.ts`
- `src/lib/parser/schema.worker.ts`
- `src/lib/schema/infer.ts`
- `src/components/table/useRowMaterialization.ts`
- `src/components/table/TablePane.tsx`
- `src/components/debug/MemoryHud.tsx`

## Feature-by-Feature Migration Matrix

Granular view of what migrates in which phase, the smallest atomic slice for each, and what UI/dev surface actually changes. Use alongside the File-by-File Plan to track migration progress per feature, not per file.

**Legend:**

- ✅ → Rust = feature's hot path moves to Rust; user sees nothing change
- ❌ Stays TS = no Rust value (cheap, not hot, or specialized lib)
- 🟡 Partial = optional partial move; not required for "fully migrated"
- 🪞 Mirror = rules must match in both engines; TS keeps for UI consumers

| # | Feature | Status | Phase | Smallest atomic slice | User-visible change | Dev-visible change |
|---|---|---|---|---|---|---|
| 1 | JSON parse (drag-drop / paste / sample) | ✅ → Rust | 3 | `engine.push_chunk(chunk)` round-trip from worker | None — must produce identical `TreeNode` | `parser.worker.ts` routes to `engines/rustEngine.ts` behind `?engine=rust` |
| 2 | Stub expansion (click `{N}` / `[N]`) | ✅ → Rust | 4 | Reparse only `[byteStart, byteEnd)` via WASM, rebase pointer/path | None | `useStubExpansion.ts` API unchanged; same engine flag |
| 3 | NDJSON detection + line indexing | ✅ → Rust | 5 | First 4 KB detection inside worker; line index emits `ndjson-line` nodes | None | `parse-ndjson.ts` worker-backed; `TreeView` drops main-thread branch |
| 4 | Deep stub byte search | ✅ → Rust | 6 | Rust ASCII-fold scan with batched progress + abort yields | None (match set byte-identical to TS) | `parser.worker.ts` `searchStubs` calls Rust |
| 5 | Schema inference (sampling + IR build) | ✅ → Rust | 8 | Inference becomes a method on parser worker; IR is JSON-serializable | None | `schema.worker.ts` deleted or wrapper; `schemaHost.ts` calls parser worker |
| 6 | Identity / pointer / path generation | 🪞 Mirror | 2 | Port `pointerSegment`, `appendPointer`, safe-id rules to Rust | None | `identity.ts` keeps; Rust parity tests in engine matrix |
| 7 | Byte-index sampling | 🪞 Mirror | 2 | Port `keepEntry` logic to Rust | None | `sample-index.ts` keeps; Rust parity tests in engine matrix |
| 8 | Tree view rendering | ❌ Stays TS | — | — | None | `TreeView.tsx` consumes parser output regardless of engine |
| 9 | Tree node row display | ❌ Stays TS | — | — | None | `TreeNode.tsx` unchanged |
| 10 | Tree expand/collapse (closed-set toggle) | ❌ Stays TS | — | — | None | `viewStore.toggle` drives `flatten` in JS |
| 11 | Tree keyboard nav | ❌ Stays TS | — | — | None | `useTreeKeyboardNav.ts` unchanged |
| 12 | Detail drawer | ❌ Stays TS | — | — | None | Phase 9 optional: Rust pretty-print line/stub content |
| 13 | Search (materialized rows, sync) | ❌ Stays TS | — | — | None | `tree/search.ts findMatches` stays main-thread |
| 14 | Search cancel (Escape / new keystroke) | ❌ Stays TS | — | — | None | `abortSearch()` API unchanged; Rust must yield between batches |
| 15 | Schema emit JSON Schema | ❌ Stays TS | — | — | None | `emit-json-schema.ts` consumes Rust IR via JSON-serializable bridge |
| 16 | Schema emit TypeScript | ❌ Stays TS | — | — | None | `emit-typescript.ts` consumes Rust IR |
| 17 | Schema emit Zod | ❌ Stays TS | — | — | None | `emit-zod.ts` consumes Rust IR |
| 18 | Table column derivation | ❌ Stays TS | — | — | None | `columns.ts` unchanged; reads materialized rows |
| 19 | Table sort | ❌ Stays TS | — | — | None | Phase 9 optional: push materialize-all-rows into worker |
| 20 | Table row materialization (lazy stub fetch) | 🟡 Partial | 9 | Worker-backed `parseSliceValue` for large stub-backed rows | None | `useRowMaterialization.ts` adds worker route |
| 21 | JSONPath query | ❌ Stays TS | — | — | None | `jsonpath-plus` + `jsonpath.ts` unchanged |
| 22 | Semantic diff (compare-pasted) | ❌ Stays TS | — | — | None | `semantic.ts` operates on materialized trees, user-triggered, not hot |
| 23 | Diff baseline persistence | ❌ Stays TS | — | — | None | `baseline.ts` uses `localStorage` |
| 24 | JSON repair (broken-JSON fix) | ❌ Stays TS | — | — | None | `jsonrepair` lib unchanged; UI-reviewed before apply |
| 25 | JSON format / minify / sort-keys | ❌ Stays TS | — | — | None | `format.ts` editor-scale, not huge-file-scale |
| 26 | Share links (encode/decode) | ❌ Stays TS | — | — | None | `share.ts` lz-string sync, ~ms anyway |
| 27 | `?url=` loader (remote fetch + Blob) | ❌ Stays TS | — | — | None | `fetchUrl.ts` unchanged; output is Blob — ideal Rust input shape |
| 28 | Monaco editor + workers | ❌ Stays TS | — | — | None | Monaco's own workers stay; don't load json_engine from them |
| 29 | Sample loading (Telemetry / LLM-JSON / NDJSON) | ❌ Stays TS | — | — | None | `samples.ts` static text constants |
| 30 | Memory HUD (`?debug=1`) | ❌ Stays TS | — | — | None | Optional: add engine name to HUD (Phase 7) |

**Read the matrix this way:**

- 5 features migrate fully to Rust (#1, #2, #3, #4, #5).
- 2 features need rules mirrored in Rust but TS stays for UI consumers (#6, #7).
- 1 feature is optionally partial in Phase 9 (#20).
- 22 features stay TS — either cheap, specialized, or not on a hot path. **Not failures** of the migration; design.

### Slice-Shipping Order (feature-rooted)

Mirrors the existing Phases + Commit Sequence but indexed by feature. Each row = one atomic slice = one commit.

| Slice | Features moved | Output |
|---|---|---|
| Skeleton (P0 + P1) | none — toolchain only | WASM smoke function callable from worker |
| Parity (P2) | #6, #7 (mirror) | Engine-matrix tests pass on Rust pointer/path/sampling rules |
| First parse (P3) | #1 behind flag | `?engine=rust` parses small files identically; tests in matrix |
| Interactive (P4) | #2 behind flag | Stub expansion works under flag; e2e `tree-keyboard-nav` passes both engines |
| NDJSON (P5) | #3 behind flag | NDJSON moves off main thread under flag |
| Search (P6) | #4 behind flag | Deep stub search runs in Rust under flag |
| Default flip (P7) | flip default to Rust | All 4 hot paths default to Rust; `?engine=ts` rollback remains |
| Schema (P8) | #5 in parser worker | Structured-clone of root eliminated |
| Optional (P9) | #20 + perf optimizations | Compact transfer / worker flatten / etc. |

**Do not bundle two features into one slice** — feature-rooted slicing makes regressions easier to bisect and matches the existing JS-side per-slice verify-then-commit cadence.

## Test Plan

Highest-priority tests:

- `src/lib/parser/parse-streaming.test.ts`
- `src/lib/parser/pathological-keys.test.ts`
- `src/lib/parser/identity.test.ts`
- `src/lib/parser/parser.worker.test.ts`
- `src/lib/json/ndjson.test.ts`
- `src/lib/parser/parse-ndjson.test.ts`
- `src/lib/tree/splice.test.ts`
- `src/lib/tree/flatten.test.ts`
- `e2e/regressions/tree-keyboard-nav.spec.ts`
- `e2e/regressions/search-functionality.spec.ts`
- `e2e/regressions/tablepane-sort.spec.ts`
- `e2e/regressions/schema-tab.spec.ts`

Test migration pattern:

- Add an engine matrix helper for parser tests:
  - TS engine.
  - Rust engine.
- Keep TS-only tests until Rust has the feature.
- Once Rust is default, keep a smaller TS fallback suite if rollback remains.

Engine matrix fixture shape:

```ts
export const ENGINE_MATRIX_FIXTURES = [
  { name: 'pathological-keys', file: './pathological-keys.json' },
  { name: 'unicode-heavy', file: './unicode-heavy-50000.json' },
  { name: 'truncated-object', file: './truncated-object.json' },
  { name: 'ndjson-basic', file: './ndjson-basic.ndjson' },
];
```

Both engines must produce equivalent `ParseResult` output after a
normalization pass that removes intentional engine metadata but keeps
ids, paths, byte ranges, preview ranges, child order, and partial-root
error behavior.

Rust-side tests:

- tokenizer token offsets;
- string escape decoding;
- number token handling;
- BOM handling;
- preview range boundaries;
- path/id generation;
- NDJSON line indexing;
- ASCII search matching;
- abort batch boundaries where practical.

## Benchmark Plan

Add:

- `benchmarks/parser-rust-direct.mjs`
- `benchmarks/ndjson-rust-direct.mjs`
- optional `benchmarks/search-rust-direct.mjs`

Update:

- `benchmarks/smoke-200mb.test.ts` to print engine.
- `benchmarks/methodology.md` with Rust-vs-TS rows.

Measure:

- 38 MB telemetry JSON.
- 201 MB telemetry JSON.
- 505 MB telemetry JSON.
- 201 MB telemetry NDJSON.
- search on `error` over 200 MB JSON.
- schema refresh after phase 8.

Success targets:

- Behavioral parity first:
  - all current parser contract tests pass on both engines;
  - identity/pointer/path semantics match fixtures exactly;
  - NDJSON detection and line ranges match the TS path;
  - malformed/truncated JSON still exposes partial-root behavior where
    the TS parser does today;
  - search result sets match exactly.
- Initial Rust-port budgets:
  - 201 MB JSON parse <= 6.2 s on the same M-series browser baseline;
  - 505 MB JSON parse <= 15.0 s on the same M-series browser baseline;
  - 505 MB steady heap does not exceed the current documented steady heap;
  - cold worker boot plus WASM init <= 200 ms;
  - `json_engine` WASM <= 250 KiB gzipped target, with >400 KiB requiring
    a written keep/optimize decision;
  - if `.wasm` is precached, total PWA precache delta <= 400 KiB.
- Post-optimization ROI targets:
  - 201 MB JSON parse <= 3.0 s after parser optimization;
  - 500 MB worst-case search INP <= 300 ms, but only after the
    main-thread `findMatches`/FlatRow path is addressed too;
  - schema refresh on 201 MB <= 1.5 s after Phase 8.
- Any missed ROI target must be documented in
  `launch-readiness-gate.md` with a decision: optimize further, keep
  Rust only for the proven scope, or revert/park the migration.
- Any public performance claim must be in `benchmarks/methodology.md`.

## WASM Debug And Memory Profiling

- Enable Rust panic reporting early with `console_error_panic_hook`.
- Enable WASM source maps where the chosen toolchain supports them, but
  assume browser debugging will still be rougher than TypeScript
  debugging.
- Track JS heap and WASM memory separately. Chrome JS heap metrics do
  not fully represent Rust allocator usage inside `WebAssembly.Memory`.
- For perf notes, report at least: JS heap, WASM memory pages/bytes,
  parse wall-clock, worker boot/init time, and browser-observed peak
  memory where available.

## Rollback Plan

During migration:

- TypeScript remains default.
- Rust is opt-in via `?engine=rust`.

After Rust default:

- `?engine=ts` remains available for one release cycle.
- parserHost logs engine name under `?debug=1`.
- If a Rust issue appears, flip default back to TS in `parser.worker.ts` without touching UI.

Do not delete `parse-streaming.ts` until:

- Rust has shipped as default;
- the 200 MB smoke and manual 500 MB run pass;
- e2e search/stub/schema/table flows pass;
- docs and methodology are updated.

## Commit Sequence

0. `perf(arch): remeasure js cleanup checkpoint`
1. `chore(wasm): add rust engine skeleton`
2. `test(parser): add engine parity harness`
3. `feat(parser): implement rust path and sampling helpers`
4. `feat(parser): parse json with rust behind flag`
5. `feat(parser): expand stubs with rust behind flag`
6. `feat(ndjson): index ndjson in rust worker`
7. `perf(search): scan stub ranges in rust`
8. `perf(parser): make rust engine default`
9. `perf(schema): infer schema through parser engine`
10. `docs(bench): publish rust engine measurements`

## Risks And Mitigations

- Risk: WASM returns huge JS object graphs and still pays structured clone.
  Mitigation: accept this for parity first, then add compact transfer
  only if measured.
- Risk: Rust build complicates Cloudflare deploy.
  Mitigation: commit generated WASM at first; revisit CI-generated artifacts later.
- Risk: parser differs on weird JSON.
  Mitigation: pathological-key and parse-streaming tests run against both engines.
- Risk: abort does not interrupt long Rust loops.
  Mitigation: process input/search in batches and return to JS between batches.
- Risk: generic Rust JSON parsing loses duplicate keys, partial roots,
  or offsets.
  Mitigation: use a custom tokenizer or proven token-mode parser for
  the primary path; never use `serde_json::from_slice` into a full
  `Value` for the large-file parse path.
- Risk: Rust skill ramp is underestimated.
  Mitigation: budget 2-3 extra weeks if this is the first major
  Rust/WASM parser project; otherwise document prior experience and keep
  the tighter schedule.
- Risk: WASM browser debugging is slower than TS debugging.
  Mitigation: add panic hook/source-map support in Phase 1 and keep TS
  fallback until Rust is proven.
- Risk: memory profiling loses apples-to-apples clarity.
  Mitigation: report JS heap and WASM memory separately, not only
  Chrome JS heap.
- Risk: multiple app workers instantiate the same WASM module.
  Mitigation: keep initial scope to parser worker; centralize
  schema/search there before considering cross-worker module transfer.
- Risk: schema migration balloons scope.
  Mitigation: keep schema as phase 8, after parser/search default.

## Verification Framework (Definition Of Done)

"Fully migrated" = three orthogonal bars, all green. Miss any one and it's a **partial port**, not a migration.

### Bar A — Functional parity (highest priority)

TS and Rust produce identical output for every input. UI behavior is unchanged.

- [ ] **Engine-matrix tests pass on Rust** for every test in:
  - `parse-streaming.test.ts`
  - `pathological-keys.test.ts`
  - `identity.test.ts`
  - `parser.worker.test.ts`
  - `sample-index.test.ts`
  - `ndjson.test.ts`
  - `parse-ndjson.test.ts`
  - `infer.test.ts`
- [ ] All e2e regression specs pass unchanged on Rust default
- [ ] Pathological-keys fixture produces deep-equal `TreeNode` to TS (test added to engine-matrix)
- [ ] Partial-error behavior — feed truncated JSON, identical line/col + partial-root tree to TS
- [ ] NDJSON detection heuristic matches TS on all sample shapes + edge cases (empty / single-line / trailing newline)
- [ ] Schema IR output matches TS for fixture set across JSON Schema / TS / Zod emitters
- [ ] Diff pane on Rust-produced trees identical to TS-produced trees (`semantic.test.ts` re-runs)
- [ ] Query pane on Rust-produced trees identical to TS (`jsonpath.test.ts` re-runs)
- [ ] Deep stub search match-set byte-identical on the 200 MB telemetry fixture

### Bar B — Performance ROI (the claim that justified the migration)

Rust delivers the speedup that made the migration worth weeks of work.

| Operation | Current TS | Rust target | Verify by |
|---|---|---|---|
| 200 MB JSON parse | 5.6 s | ≤ 3.0 s | `benchmarks/smoke-200mb.test.ts` cold-run |
| 500 MB JSON parse | 13.9 s | ≤ 7.0 s | manual cold-run per `benchmarks/methodology.md` |
| 200 MB NDJSON parse | unmeasured | ≤ 600 ms | new benchmark row in methodology |
| Search wall-clock at 200 MB | ~2-3 s (subjective) | ≤ 2.0 s | timed benchmark |
| Schema refresh at 200 MB | ~2.5 s | ≤ 1.5 s | timed click + HUD reading |
| 500 MB worst-case INP | 560 ms | ≤ 300 ms — needs TS-side rep changes too | Chrome Performance Insights |
| Worker boot + WASM init cold | n/a (TS-only today) | ≤ 200 ms | `performance.now()` worker construct → first parse-ready |
| WASM blob gzipped | 0 | ≤ 250 KB | `ls -la dist/assets/*.wasm` |
| PWA precache total | 5198 KiB | ≤ 5600 KiB | build output |
| Lighthouse `/large-json-viewer` Perf | 97 | ≥ 95 | DevTools Lighthouse panel |
| Cold-load memory peak (200 MB) | 1.16 GB | ≤ 1.16 GB | Performance Monitor heap line |

**If any row fails: the migration is technically complete but strategically failed.** Document the gap in `launch-readiness-gate.md` with a decision: invest more in Rust-side optimization OR revert.

### Bar C — Cleanup completion

The TS parser code path is either removed or has explicit retention rationale. No silent two-engine maintenance burden.

- [ ] `?engine=rust` debug flag removed (Rust is default; no toggle outside the rollback `?engine=ts`)
- [ ] `src/lib/parser/engines/*` facade simplified to single-export or deleted
- [ ] `parse-streaming.ts` either DELETED or has explicit `@internal` retention comment with reason
- [ ] `parse-ndjson.ts` removed or wrapper-only
- [ ] `schema.worker.ts` removed (inference now in parser worker per Phase 8)
- [ ] No dead-code Rust modules — every exported Rust function has at least one TS caller
- [ ] CI builds Rust on every PR (not just when files change)
- [ ] Rollback `?engine=ts` removed after one release cycle

### Bar D — Deployment + documentation

- [ ] Cloudflare Pages deploys without manual intervention
- [ ] Workbox precache glob in `vite.config.ts` includes `.wasm` if WASM is precached (currently does NOT — must add explicitly)
- [ ] WASM blob served with `Content-Type: application/wasm`
- [ ] WASM cached by service worker (verify in DevTools → Application → Cache Storage)
- [ ] Source-map for Rust panic traces resolves to `.rs` file + line (`console_error_panic_hook` installed)
- [ ] `README.md` Stack section updated (`@streamparser/json` replaced with Rust/WASM engine reference)
- [ ] `benchmarks/methodology.md` has dated post-migration measurement rows for every Bar B target
- [ ] `CHANGELOG.md` entries per phase with measurable deltas
- [ ] `CONTRIBUTING.md` has Rust dev-setup section (toolchain pin, build commands, test commands)
- [ ] `docs/deploy-cf-pages.md` updated for Rust-aware deploys
- [ ] No privacy regression (no backend, no remote schema fetch, no CDN parser)

### Anti-pattern — how to avoid declaring victory too early

Phase 3 currently allows up to 10% regression *"before optimization."* **If you ship Phase 7 (Rust default) while any Bar B row exceeds budget, you've made the app slower and called it migrated.** That's the wrong end-state.

Recommended sequencing gate:

```
Phase 3 ships → "Rust is AVAILABLE, behind ?engine=rust flag"
Phase 3.5 ships → Rust-side optimization passes (SIMD, custom allocator, etc.)
Phase 7 ships → "Rust is DEFAULT iff all Bar B perf budgets met"
```

If Phase 3.5 can't close the perf gap, do NOT flip the default. Either invest more in optimization or revert the plan. Document the decision in `launch-readiness-gate.md`.

### What is NOT in scope (won't fail the migration)

Features #8–#30 in the Feature-by-Feature Migration Matrix intentionally stay TS by design. They are NOT failures of the migration:

- JSONPath query, semantic diff, JSON format/minify/repair — small workloads, specialized libs
- Schema emitters — cheap, well-tested in TS, consume Rust IR via JSON-serializable bridge
- Share/clipboard/fetchUrl — no Rust value
- Table sort comparator, Monaco editor, sample loading — not on the hot path

If those are still TS at the end, that's correct. The **engine** is migrated; the **tooling on top of the engine** stays TS.

### Single-question gate

If someone asks "are we done?" you must be able to answer all three with yes:

1. **Does Rust produce the same output as TS for every test input?** (Functional parity — Bar A)
2. **Did we hit the perf budgets that justified spending weeks on this?** (ROI realized — Bar B)
3. **Is the TS parser code path either gone or documented?** (Cleanup complete — Bar C)

If any answer is "mostly" or "almost" — not done.
