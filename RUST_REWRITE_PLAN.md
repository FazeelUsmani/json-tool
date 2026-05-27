# Rust Rewrite Plan — json-tool from scratch

> **Status: ACTIVE (re-unparked 2026-05-27 evening).** User confirmed
> full-rewrite path after considering the engine-only alternative.
> Decision history this day: authored active → parked (pivot to
> engine-only) → re-unparked (pivot back to rewrite). The flip-flop
> is preserved here so future-self understands the decision wasn't
> linear and may need revisiting if rewrite-cost becomes blocking.
>
> **New repo structure (decided 2026-05-27 evening):**
> - Current repo `json-tool` → renames to `json-tool-app`. Becomes
>   the React/TS reference implementation; not shipped publicly under
>   the rewrite path.
> - NEW repo `json-tool` → the Rust app (Leptos/Yew + WASM, fresh
>   start). M1 + M2 features get rebuilt here during the phases
>   below.
>
> See `PLAN_UNIFIED.md` for the brand-session-first calendar that
> interleaves this rewrite with launch + customer-discovery work.
>
> **Honest acknowledgment of cost** (recorded verbatim so future-self
> doesn't relitigate the decision in week 8):
>
> - Estimated elapsed time: **20-30 weeks solo dev**, optimistic.
>   Pessimistic: 9-12 months.
> - Existing M1 wedge + M2 in-flight features (~3 weeks of work)
>   are not directly reused — they're a reference implementation
>   the Rust build must achieve parity with.
> - 31 e2e specs + 434 unit tests must be re-derived in the Rust
>   stack (or driven via WebDriver against the new app, which still
>   requires re-writing assertions).
> - Brand decision remains the load-bearing launch unblock both
>   ways. Rewrite doesn't bypass it.
> - The 90-day company goal of 10 paying teams is **not achievable**
>   under this plan's elapsed time. Treat that goal as voided or
>   restate it on a longer horizon.
>
> **Alternative still on the table:** `RUST_MIGRATION_PLAN.md` (Phase 0
> already complete, decisions resolved, paused for brand) delivers
> the same engine wins in 6-8 weeks vs. this plan's 6-12 months. If
> at any point during execution this plan slips and the alternative
> is still viable, pivot.
>
> ---

## Goal

Rebuild json-tool from scratch in Rust, targeting:

1. **Primary:** browser-deployed PWA via WASM (same product surface as today).
2. **Optional sibling:** native CLI (single binary, shares the engine crate).
3. **M3-aligned:** the same Rust engine becomes the parser+validator backbone of any future paid product (backend or otherwise).

## Non-Goals

- Reuse of the existing React/TypeScript implementation. This is a fresh build.
- Preservation of file paths, component names, or test-file structure from the current repo.
- Faster time-to-launch. This plan is **slower to launch** than the existing app + migration plan.
- Hiring or contributor onboarding. Solo dev only for the foreseeable future.

## Scope of Rebuild

Every feature listed in `RUST_MIGRATION_PLAN.md` § Feature-by-Feature Migration Matrix is in scope to rebuild. The matrix's "Stays TS" column becomes "Rebuild in Rust" — there is no TS to stay in.

That means 30 features need Rust implementations, including:

- Streaming JSON parser with depth-2 spine + byte-range stubs
- NDJSON detection + line indexing
- Tree view with virtualized rendering
- Tree expand/collapse + keyboard navigation
- Search (materialized + deep byte-range)
- Schema inference + JSON Schema / TS / Zod emitters
- Table view with column derivation + sortable rows
- JSON repair (port `jsonrepair` semantics)
- JSON format / minify / sort-keys
- JSONPath query
- Semantic diff + baseline persistence (the M2 work currently in flight)
- Share links (encode/decode + URL hash)
- `?url=` loader with streaming, security hardening, partial-error handling
- Monaco-or-replacement editor (see Risks)
- PWA with service worker + offline parsing
- SEO routes with SSR/SSG
- Brand theming + dark mode
- Detail drawer + Memory HUD
- Plausible analytics integration
- Trusted Types + CSP + HSTS + COOP security headers

Plus the audit-response items already shipped against the TS app:

- CI gate (typecheck/lint/test/build/audit)
- Branch protection patterns
- Identity refactor (RFC 6901 JSON Pointer)
- Privacy-claim narrowing
- Cost circuit-breaker (when AI features ship per M2 Slice B)
- Stub-banner honesty markers for placeholder SEO routes (gone once real SEO copy is written)

## Stack Decision

| Layer | Choice | Alternative | Why |
|---|---|---|---|
| Edition | Rust 2024 stable | — | Latest stable when Phase 0 starts; pinned via `rust-toolchain.toml`. |
| UI framework | **Leptos 0.7+** (signal-based, SSR-capable, React-like ergonomics) | Yew (more mature, virtual-DOM), Dioxus (cross-platform desktop) | Leptos's fine-grained reactivity matches the project's perf-sensitive use case; SSR support matches current vite-react-ssg behavior. |
| Build | **Trunk** | wasm-pack + custom Vite plugin, leptos-cli | Trunk is Leptos's standard tooling and handles WASM + assets + dev server. |
| Editor | **DECISION DEFERRED — see Risks #1** | Monaco-in-iframe, CodeMirror via Tauri, custom Rust editor, plain `<textarea>` | Biggest open question. No clean Rust port of Monaco exists. |
| Virtualization | Custom + `web-sys` | `leptos_virtual_list` (immature) | Replicate react-window's render-window strategy in Rust signals. |
| Storage | `gloo-storage` (localStorage) + `web-sys` (IndexedDB if needed) | Direct `web-sys::Storage` | gloo wrappers are ergonomic; localStorage covers baseline + share-link consumption. |
| Worker boundary | `web-sys::Worker` + `serde-wasm-bindgen` for messages | Comlink-wasm (immature) | Direct worker construction is the well-trodden path; wasm-bindgen handles JS interop. |
| Routing | `leptos_router` | yew-router | Couples to UI framework choice. |
| Testing | `wasm-bindgen-test` + Playwright e2e | Vitest equiv N/A | Rust browser tests via wasm-bindgen-test; e2e stays Playwright (drives any browser regardless of stack). |
| Schema emitters | Custom Rust → JSON Schema / TS / Zod text emitters | Reuse existing TS emitters via FFI | The current TS emitters are 200 LOC each — porting is faster than maintaining a JS-Rust FFI bridge. |
| Deploy | Cloudflare Pages with static output from Trunk | Vercel, GitHub Pages | Same as current — Trunk's output is static HTML+JS+WASM. |
| Plausible | Direct script tag in index.html | wasm-bound `web-sys::HtmlScriptElement` | Same approach as today — minimal Rust involvement. |

### Open framework question

Leptos is the recommendation but the gap between Leptos and Yew is real:

- **Leptos pros:** signals match React's mental model loosely, SSR-first, very fast updates, smaller bundle.
- **Yew pros:** older + more battle-tested, larger component ecosystem, JSX-like syntax via `html!` macro.
- **Decision rule:** if Leptos 0.7+ has a stable signals API that hasn't churned in 6 months by Phase 0 start, use Leptos. Otherwise Yew. Confirm on the day Phase 0 starts.

## Risk #1 — Editor Replacement (the load-bearing risk)

Monaco is **2.5 MB of editor code** with: syntax highlighting, fold ranges, hover tooltips, error diagnostics, JSON-language-service integration, Trusted Types support, accessibility, copy/paste handling, IME handling, undo stack, search-within-editor, etc.

No Rust port of Monaco exists. Replacement candidates:

| Option | What | Cost | Loss vs. Monaco |
|---|---|---|---|
| **A. Monaco-in-iframe** | Embed Monaco from CDN inside an iframe; postMessage interface with the Rust app | ~1 week | Defeats "rebuild in Rust" goal; CSP friction; Monaco is still a JS dependency |
| **B. CodeMirror 6 via JS interop** | Use CodeMirror from Rust via `wasm-bindgen`; not Rust-native but lighter than Monaco | ~2 weeks | Smaller editor; missing JSON-language-service features |
| **C. `lapce-core` text engine + custom UI** | Lapce's text-buffer rope crate; build syntax highlighting + UI on top in Leptos | ~6-8 weeks | Months of editor work; only the text-buffer rope is reusable |
| **D. Custom Rust editor from scratch** | Build everything (rope, tokenizer, highlighter, decorations, accessibility) | ~3-6 months | This becomes a major sub-project of the rewrite |
| **E. Plain `<textarea>` with monospace styling + worker tokenizer** | No syntax highlighting in the editor; tree pane shows highlighted view | ~3 days | Significant UX regression; users notice |
| **F. Skip the editor entirely; viewer-only product** | Drop the editor pane; require drag-drop / URL load / paste-to-empty-state | ~0 (just remove from scope) | Product becomes "JSON viewer," loses the format / minify / repair flows |

**Recommendation: B (CodeMirror via JS interop) for v1, with C (Lapce text engine) as a post-launch upgrade.** Reasoning: CodeMirror is significantly lighter than Monaco, JSON-aware, has the editing affordances users expect, and doesn't require months of custom editor work. The JS-interop tradeoff is acceptable since this is the only major JS dependency in the rewrite.

**Decision required before Phase 0:** lock the editor choice. Slipping this decision means slipping Phase 4 indefinitely.

## Phased Buildout

Solo dev. No parallelism. Each phase is sequential.

### Phase 0 — Toolchain + skeleton (~1 week)

- `rust-toolchain.toml` pinned to current stable
- `Cargo.toml` workspace with `crates/json_engine` + `crates/json_tool_ui`
- `trunk.toml` config + dev server working
- One Leptos page rendering "Hello world" at `localhost:8080`
- CI workflow: `cargo check` + `cargo test` + `trunk build`
- Cloudflare Pages config for Trunk output

### Phase 1 — Routing + layout shell (~1 week)

- `leptos_router` with `/`, `/json-viewer`, `/ndjson-viewer`, `/large-json-viewer`, `/json-repair`
- Layout: TopBar, ResizablePanes (left/right), AppShell
- Dark/light mode toggle via signal
- Tailwind 4 via Trunk's CSS pipeline (or vanilla CSS modules)
- Each route renders an empty hero
- e2e smoke: `/` loads, route navigation works

### Phase 2 — JSON parsing engine (~3-4 weeks)

- `crates/json_engine`: pure Rust library (no WASM bindings yet)
- Streaming byte tokenizer with offset tracking
- Spine + stub builder (depth-2 cap, byte-range stubs, preview ranges)
- Pathological-key safety (RFC 6901 JSON Pointer identity, JSONPath display path)
- Partial-error reporting for truncated/malformed JSON
- 50+ unit tests including the pathological-keys fixture from the current repo
- `cargo bench` baseline for 200 MB / 500 MB synthetic fixtures
- **No UI integration yet** — engine is consumed by Phase 3+

### Phase 3 — Tree view + virtualization (~2-3 weeks)

- Materialized FlatRow representation
- Virtualized scrolling (own implementation; ~30k visible-row throughput target)
- TreeNode component variants: open / close / leaf / stub / line
- Caret + indent guides
- Click-to-toggle + click-to-focus
- Keyboard navigation: arrow keys + Home/End + Enter (drawer)
- Detail drawer panel

### Phase 4 — Editor (~2-4 weeks)

Per Risk #1 decision (assume B: CodeMirror via JS interop):

- CodeMirror 6 wrapper component
- Two-way sync between editor text and document signal
- Click-to-mount empty-state hero
- Paste-to-empty-state flow
- Drag-drop file handler with viewer-only-mode pivot at 10 MB
- ALLOWED_EXTENSIONS allowlist (.json / .ndjson / .jsonl)

### Phase 5 — Schema inference + emitters (~2-3 weeks)

- Reservoir sampling walker
- Schema IR (Rust struct with serde derive)
- JSON Schema emitter
- TypeScript emitter
- Zod emitter
- Tabbed UI (SchemaPane) with sub-tab switcher
- Refresh button + stale dot when document changes since inference

### Phase 6 — NDJSON + stub expansion (~1-2 weeks)

- NDJSON detection heuristic
- Line indexing in parser
- ndjson-line row type in tree
- Stub expansion via byte-range reparse with pointer/path rebase

### Phase 7 — Search + JSONPath query (~1-2 weeks)

- Synchronous FlatRow search with `c | 32` ASCII case-fold optimization
- Deep byte-range scan in worker for collapsed stubs
- Batched progress + abort
- JSONPath query bar via `jsonpath-plus`-equivalent Rust crate (or port the subset we use)
- Query result list with click-to-focus + flash animation

### Phase 8 — Diff + baseline (~1-2 weeks)

- Semantic-diff lib: same DiffOp shape as M2 Slice A1
- DiffPane UI: paste-both-sides + Run diff
- Compare-to-baseline with localStorage persistence
- Color-coded result list

### Phase 9 — Repair + Format + Table view (~2-3 weeks)

- JSON repair: port `jsonrepair` semantics (or call out to its WASM build if one exists)
- RepairDialog with side-by-side diff preview
- Format / minify / sort-keys (text-level transforms)
- TablePane with column derivation from sampled rows + sortable columns + sort-disable threshold for stub-backed rows

### Phase 10 — PWA + service worker (~1 week)

- Workbox-equivalent SW (likely hand-written; Rust workbox port doesn't exist)
- Precache manifest including .wasm
- "Update on reload" handling for dev
- App manifest with name, theme color, icons
- Offline parsing parity with current TS app

### Phase 11 — Share links + URL load + `?url=` security (~1 week)

- Share encode/decode with lz-string-equivalent compression (lz4-flex or similar)
- `#json=` URL fragment consumption
- Cross-route consume + redirect to `/`
- `?url=` pre-fill UX
- Synchronous `<head>` strip before any deferred script
- Fetch with `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, protocol allowlist
- Streaming response with maxBytes enforcement during read

### Phase 12 — SEO routes + SSR/SSG (~1-2 weeks)

- Leptos SSR for `/json-viewer`, `/ndjson-viewer`, `/large-json-viewer`, `/json-repair`
- OG / Twitter card metadata
- Per-route hero copy + bullets (brand-pending placeholders until brand lands)
- `robots.txt` + `sitemap.xml` (brand-coupled flip)

### Phase 13 — A11y + theming + responsive (~1-2 weeks)

- Keyboard tab order audit
- ARIA labels on tree rows, tabs, dialogs
- Focus management on dialog open/close
- Trusted Types policy registration
- CSP / HSTS / COOP / XFO via `_headers`
- Dark mode parity
- Mobile breakpoints (or explicitly skip per current product)

### Phase 14 — Test parity + e2e port (~2-3 weeks)

- Port all 31 e2e specs to drive the Rust app (Playwright stays; only selectors change)
- Port all 434 unit tests to Rust (engine crate has its own; UI tests via `wasm-bindgen-test`)
- Engine-matrix tests against fixture set
- Benchmark methodology re-measurement against the Rust build

### Phase 15 — Audit response items (~1 week)

- CI gates: `cargo check` + `clippy` + `cargo test` + `trunk build` + `cargo audit`
- Branch protection ask (same GitHub UI action)
- `_headers` with full security set
- Bundle-size budget enforcement
- Lighthouse cold-run against the deployed Rust build
- All `?url=` + share-link + privacy claims verified against the new implementation

## Feature Parity Mapping (Current TS → Rust)

| Current TS surface | Rust equivalent | Phase | Effort |
|---|---|---|---|
| `@streamparser/json` Tokenizer | Custom Rust byte tokenizer in `json_engine` | 2 | High |
| `parse-streaming.ts` | `json_engine::parse` | 2 | High |
| `parse-ndjson.ts` | `json_engine::ndjson::index` | 6 | Low |
| `parser.worker.ts` Comlink API | `web-sys::Worker` + serde messages | 2 | Medium |
| `tree/parse.ts` `TreeNode` | Rust enum with serde derive | 2 | Low |
| `tree/flatten.ts` | `FlatRow` builder in Rust | 3 | Medium |
| `tree/search.ts` | Rust search lib | 7 | Medium |
| `tree/splice.ts` | Rust splice helper | 6 | Low |
| `parser/identity.ts` | `json_engine::path` | 2 | Low |
| `parser/sample-index.ts` | `json_engine::sampling` | 2 | Low |
| `schema/infer.ts` + emitters | `json_engine::schema` + emit modules | 5 | Medium |
| `query/jsonpath.ts` (`jsonpath-plus`) | Port subset of JSONPath in Rust | 7 | Medium |
| `diff/semantic.ts` | Rust diff lib (similar shape to A1) | 8 | Low |
| `diff/baseline.ts` | `gloo-storage` wrapper | 8 | Low |
| `json/repair.ts` (`jsonrepair`) | Port jsonrepair logic OR FFI to a WASM build | 9 | High if porting |
| `json/format.ts` | Text transform helpers | 9 | Low |
| `share/share.ts` (`lz-string`) | `lz4-flex` or similar | 11 | Low |
| `share/useShareHashLoad.ts` | Leptos hook | 11 | Low |
| `net/fetchUrl.ts` | `web-sys::fetch` wrapper | 11 | Medium |
| `monaco/init.ts` + Monaco editor | CodeMirror 6 via JS interop OR custom | 4 | High |
| `components/tree/*` | Leptos components | 3 | Medium |
| `components/editor/*` | Leptos components | 4 | Medium |
| `components/schema/*` | Leptos components | 5 | Medium |
| `components/table/*` | Leptos components | 9 | Medium |
| `components/query/*` | Leptos components | 7 | Low |
| `components/diff/*` | Leptos components | 8 | Low |
| `components/editor/RepairDialog.tsx` (Monaco diff) | CodeMirror diff or custom | 9 | High |
| `components/editor/ShareDialog.tsx` | Leptos dialog | 11 | Low |
| `components/editor/EmptyStateHero.tsx` | Leptos component | 4 | Low |
| `components/layout/*` | Leptos layout | 1 | Low |
| `state/viewStore.ts` (Zustand) | Leptos signals + global Store struct | 3 | Medium |
| `state/documentStore.ts` | Leptos signals | 4 | Low |
| `state/parserHost.ts` | Worker host in Rust | 2 | Medium |
| `vite-react-ssg` routing | `leptos_router` | 1 | Low |
| Plausible script | Direct script tag in index.html | 0 | Trivial |
| `public/_headers` | Same file, same content | 15 | Trivial |
| `public/robots.txt` | Same | 12 | Trivial |
| `vite.config.ts` Workbox config | Manual SW in Rust or workbox via JS interop | 10 | Medium-High |

## What's Preserved from Existing Work

These artifacts survive the rewrite without modification:

- `PROJECT_PLAN.md` (strategy, positioning, three differentiators)
- `RESEARCH_PLAN.md` (customer discovery script, market analysis)
- `PLAN_M2.md` (M2 feature scope still applies)
- `launch-readiness-gate.md` (audit response, deferred items)
- `benchmarks/methodology.md` (measurement protocol, current baseline)
- `outreach/*.md` (cold email, customer call DM, launch narratives, log)
- Domain knowledge documented in code comments (parser semantics, stub model, JSON Pointer rationale, Plausible-ordering fix, etc.) — re-extract from the TS sources into Rust comments
- All audit response decisions (CI gates, branch protection, identity refactor strategy, privacy framing)

## What's Lost from Existing Work

Honest accounting:

- ~3 weeks of M1/M2 implementation code in TS — reference only, not reused
- 31 e2e spec assertions — must be ported (selectors will change)
- 434 unit test cases — must be ported to Rust
- Monaco integration (Trusted Types policy, click-to-mount, DiffEditor unmount race fix, etc.) — not reused if Monaco is dropped
- Workbox configuration nuances (precache glob, SW lifecycle, update-on-reload handling) — re-derived for the Rust SW

## Risks (ranked by likelihood)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Editor replacement blocks Phase 4 indefinitely | Pre-decide editor choice; CodeMirror via JS interop is the default path |
| 2 | Solo dev velocity in Rust UI is ~30-50% slower than React for equivalent UI | Budget pessimistically; accept the slip |
| 3 | Leptos signals API churn during the build window | Pin to a specific Leptos minor version; only upgrade after each phase ships |
| 4 | Brand decision still pending; launch slips equally either way | Brand session is unblocked by this plan but doesn't depend on it. Do brand in parallel, not sequentially. |
| 5 | 90-day company goal becomes infeasible | Restate the goal on a longer horizon (6-12 months to first paying customer). Communicate to anyone tracking. |
| 6 | Hire/contributor friction (small Rust UI community) | Stay solo dev for the foreseeable future. Don't plan around hires. |
| 7 | PWA + service worker complexity in Rust | Worst-case fall back to JS-authored SW + Rust app; the SW boundary tolerates it. |
| 8 | jsonrepair port has subtle behavior differences | Use the upstream JS library via JS interop in Phase 9; defer Rust port to post-launch. |
| 9 | Bundle size grows beyond user-acceptable threshold | Bundle-size budget enforced in CI (Phase 15); WASM tree-shake aggressively. |
| 10 | Customer discovery (cold-email + 5 calls) reveals wedge needs to change before this plan ships | Run discovery in parallel during Phases 0-5. If wedge changes, pivot the rewrite scope before Phase 6+. |

## Verification Framework

Same three-bar structure as `RUST_MIGRATION_PLAN.md`, expanded to cover the full app.

### Bar A — Feature parity with current TS app

Every feature in the Feature Parity Mapping table above must work in the Rust build with behavior identical to current TS, verified by:

- All 31 e2e specs ported and passing
- All 434 unit tests ported and passing (Rust-native via `cargo test` + `wasm-bindgen-test`)
- Manual walkthrough of the 7 JSONPath sample queries + the 5 diff scenarios from session testing
- 200 MB Telemetry sample loads + tree populates identically
- 500 MB fixture parses to under 60s + tree navigates

### Bar B — Performance parity OR improvement

The rewrite must NOT regress current perf. Targets:

| Operation | Current TS | Rust rewrite target | Tolerance |
|---|---|---|---|
| 200 MB JSON parse | 5.6 s | ≤ 5.6 s | 0% regression |
| 500 MB JSON parse | 13.9 s | ≤ 13.9 s | 0% regression |
| 200 MB search-keystroke INP worst | 168 ms | ≤ 168 ms | 0% regression |
| 500 MB search-keystroke INP worst | 560 ms | ≤ 560 ms | 0% regression |
| `/large-json-viewer` Lighthouse Perf | 97 | ≥ 95 | -2 point tolerance for WASM cold-load |
| `/large-json-viewer` Lighthouse A11y | 100 | 100 | no regression |
| PWA precache total | 5277.83 KiB | ≤ 6000 KiB | +13% tolerance for WASM blobs |
| Cold load to first interactive | unmeasured | ≤ 3.0 s on 4G throttling | new budget |

Better-than-current is the implicit goal but not required for "done."

### Bar C — Deployment + audit parity

- Cloudflare Pages deploys without manual intervention
- `_headers` ships CSP / HSTS / COOP / XFO / Trusted Types
- Privacy framing matches current ("we never see your data")
- No telemetry on JSON content
- No CDN editor (CodeMirror bundled locally if used)
- No regression on `?url=` security hardening
- Branch protection on `main` (user-owned action)
- All audit-response items from the 2026-05-22 review verified against the new build

### Single-question gate

"Are we done?" requires all three yes:

1. Does the Rust app pass all ported e2e + unit tests at feature parity with the current TS app?
2. Does it match or exceed current perf budgets?
3. Does it pass the audit-response checklist verbatim?

## Decision Points Still Open

These need answers before or during Phase 0:

1. **UI framework:** Leptos vs Yew — decide on the day Phase 0 starts based on current Leptos signal API stability.
2. **Editor:** Monaco-in-iframe vs CodeMirror-via-JS vs custom vs textarea vs skip — decide before Phase 4.
3. **SSR target:** Leptos SSR vs static-only — decide before Phase 12.
4. **Build tool:** Trunk (recommended) vs leptos-cli vs Vite+rsw — decide on the day Phase 0 starts.
5. **Brand:** still pending; doesn't block the rewrite but launch waits for it.

## Pivot Conditions

If during execution any of these triggers, pivot back to `RUST_MIGRATION_PLAN.md` (engine-only) or stay on current TS app:

- Phase 4 (editor) stalls beyond 4 weeks
- Cumulative elapsed time at end of Phase 7 exceeds 12 weeks (was budgeted ~10-15 weeks for Phases 0-7)
- Customer discovery reveals the wedge has changed AND the existing TS app could ship faster against the new wedge
- Bundle size at end of Phase 5 exceeds 1.5 MB gzipped (WASM + JS glue)
- Leptos signals API churns more than once in the build window

Pivot is **acceptable, not a failure.** A pivot back to the migration plan means: the engine work you've done in `crates/json_engine` ports cleanly into the existing TS app via WASM; only the UI work is sunk cost. That's a real fallback.

## Commit Cadence

Same as the current TS codebase:

- Atomic slices per feature within each phase
- 1-2 bullets per commit message, dense, WHY-not-WHAT
- `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` / `perf(...)` conventional prefixes
- No marketing verbs (no "implement"/"improve"/"emphasize")
- Verify-then-commit (`cargo check + clippy + test + trunk build` per slice)
- No Claude attribution

## Documentation Updates Required When This Plan Ships

When the rewrite is feature-complete (end of Phase 15):

- `README.md`: replace TS stack section with Rust stack
- `CONTRIBUTING.md`: Rust dev setup, `cargo` commands, Trunk workflow
- `PROJECT_PLAN.md`: update Month 1 verification list
- `PLAN.MD`: mark as historical artifact
- `PLAN_M2.md`: re-scope or merge into the rewrite plan's phases
- `launch-readiness-gate.md`: re-derive checklist against the new build
- `benchmarks/methodology.md`: new measurement section for the Rust build
- `RUST_MIGRATION_PLAN.md`: mark as superseded with a pointer to this file
- `docs/deploy-cf-pages.md`: Trunk-based deploy instructions

## Cross-Reference

- `RUST_MIGRATION_PLAN.md` — the engine-only alternative (cheaper, faster, less risky). This rewrite plan supersedes it ONLY if the user executes the rewrite; otherwise it stays valid.
- `PROJECT_PLAN.md` — strategic context, three differentiators, business model
- `RESEARCH_PLAN.md` — customer discovery, market validation
- `PLAN_M2.md` — M2 feature scope (unchanged; same features must rebuild in Rust)
- `benchmarks/methodology.md` — Phase 0 baseline against which the Rust rewrite is measured
- `launch-readiness-gate.md` — audit-response checklist that must be re-verified against the Rust build
