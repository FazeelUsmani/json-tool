# Unified Roadmap — json-tool

> **Master plan — LOCKED 2026-05-27 late evening.** Engine-only
> Rust is the final strategy. Synthesizes M1 carry-forwards +
> M2 slices + Rust engine migration into one calendar.
>
> **Active plans:**
> - `RUST_MIGRATION_PLAN.md` — engine-only Rust port via wasm-pack-built WASM crate consumed by the TS app. 6-8 weeks.
> - `PLAN.MD` — Month 1 wedge features (mostly shipped; remaining carry-forwards in `json-tool-app`)
> - `PLAN_M2.md` — Month 2 differentiator features (Slice A shipped in TS; B/C/D pending)
>
> **Parked alternatives** (design references only — NOT active):
> - `RUST_REWRITE_PLAN.md` — full from-scratch Rust app. Was active briefly today; abandoned after cost re-review.
>
> **Decision history** (preserved so future-self can audit): 5
> Rust-scope flips on 2026-05-27 (engine-only → rewrite → engine-only
> → rewrite → engine-only LOCKED). The "is this really what I want?"
> pattern surfaced repeatedly; this file captures the final answer.

---

## Status snapshot (2026-05-27 late evening)

| Track | State | Next action |
|---|---|---|
| **Existing TS app** (`json-tool-app` repo) | M1 + M2 Slice A shipped; ready to launch post-brand | Brand session → launch readiness → public launch |
| **Rust engine crate** (`json-tool` repo, new) | Phase 0 toolchain installed; engine_version() smoke fn passing fmt/clippy/test; wasm-pack build pending verify | Install wasm-pack + verify WASM artifact builds |
| **Brand decision** | Pending ~10 days | **W0 — same as before.** Required for TS-app launch. |
| **Customer discovery** | Cold-email batches + 5 calls + 15 interviews | Runs in parallel, brand-coupled for outreach |

## Two-repo structure (LOCKED)

| Repo | Local path | Content | Status |
|---|---|---|---|
| `json-tool-app` | `~/Documents/json-tool-app/` | React/TS app — full M1 + M2 Slice A. Public-facing product. | Ships post-brand; consumes Rust engine via WASM |
| `json-tool` | `~/Documents/json-tool/` (this repo) | Rust engine crate. Compiles to WASM via wasm-pack `--target web`. | Phase 0 scaffolded; Phase 1+ runs in parallel with TS-app launch |

**Artifact flow** (per pre-flight decision in `RUST_MIGRATION_PLAN.md`):
- `json-tool` Rust repo builds WASM via `wasm-pack build crates/json_engine --target web --release`
- Generated artifact at `crates/json_engine/pkg/` gets committed into `json-tool-app/src/generated/json_engine/` per the deploy-artifact policy (CF Pages keeps simple npm build, no Rust toolchain in deploy)
- TS app imports the generated `.d.ts` + `.js` + `.wasm`

## The binding constraint — brand decision (unchanged)

Brand is W0. The TS app at `json-tool-app/` is launch-ready except for brand-coupled items (README, SEO copy, OG metadata, cold-email signature, domain). The Rust engine work runs in PARALLEL — it does NOT block launch.

## Calendar — engine-only with TS-app launching in parallel

```
W0 (today): Brand session (90 min) — same as it's been for 10 days

W1: TS app — launch readiness (SEO copy, _headers, robots, branch protection, e2e expansion)
    Rust — wasm-pack install + Phase 0 verify (~half-day work; verify wasm-pack build succeeds + pkg/ artifact is consumable)
    + LAUNCH the TS app at end of W1 (HN/Reddit/Lobsters/Twitter)

W2: Cold-email batch 1 + customer call recruiting
    Rust Phase 1 — toolchain decisions formalized + engine API design (parseFile + expandStub + searchStubs signatures)
    M2 Slice B1 (API key UX) — in TS app, post-launch

W3-W4: M2 Slice B (AI explanations) in TS app
       Rust Phase 2 — engine parity work (identity, sampling, fixtures)
       Customer discovery W2-W3 calls (2-3 calls)

W5: M2 Slice B6 (cost circuit breaker) ships in TS app
    Rust Phase 3 — first parse behind a flag in json-tool-app (consume pkg/ artifact, route ?engine=rust)
    Customer call 4

W6: M2 Slice C (NL→jq) starts
    Rust Phase 4 — lazy stub-expand in Rust
    Cold-email batch 2

W7: M2 Slice C wraps
    Rust Phase 5 — NDJSON path
    Cold-email batch 1 reply review → Slice D gate decision

W8: M2 Slice D1-D2 (waitlist + CTAs, GATED on persona overlap)
    Rust Phase 6 — search slow-path

W9: M2 Slice D3 (content posts)
    Rust Phase 7 — default-flip gate (perf budgets met → flip default)
    Architecture cleanup #1

W10: M2 verification gates
     Rust Phase 8 — schema inference in parser worker
     Customer-discovery synthesis → M3 decision
     Architecture cleanup #2

W11 (slack): Rust Phase 9 (optional) + M3 prep
```

**Launch (public)** ≈ end of W1 / start of W2. **90-day "10 paying teams" goal stays achievable** (rough target W12-13 = ~3 months from today).

## What does NOT happen under engine-only

- No UI rewrite — React/TS UI keeps shipping
- No Monaco replacement — Monaco stays in the TS app
- No `crates/json_tool_ui/` — only `crates/json_engine/` exists in the Rust repo
- No 20-30-week elapsed-time hit
- No 90-day goal void

## Per-track detail

### Track 1 — Launch readiness (TS app, W0-W1)

Per `PLAN.MD` § Verification + `launch-readiness-gate.md`:
- Brand session (90 min)
- README rewrite (brand-coupled)
- SEO route copy × 4 (~6,000 words; brand-coupled)
- `_headers` CSP / HSTS / COOP / XFO / Trusted Types
- `robots.txt` flip to Allow + sitemap
- Branch protection on `main`
- Playwright e2e suite expansion
- Plausible custom events
- HN + Reddit + Lobsters + Twitter posts queued
- Repo flip public

### Track 2 — M2 features (TS app, W2-W10)

Per `PLAN_M2.md`. Slice A shipped. Remaining:
- Slice B (AI explanations) — ~5.5 days, W2-W5
- Slice C (NL → jq) — ~4.5 days, W6-W7
- Slice D (waitlist + CTAs + content posts) — ~5 days, W8-W9 (D1+D2 gated on persona data)

### Track 3 — Rust engine migration (json-tool repo, W1-W10)

Per `RUST_MIGRATION_PLAN.md`. Phase 0 toolchain done. Phases 1-9:
- Phase 1: API design + skill ramp (~1 week)
- Phase 2: Engine parity (identity, sampling) (~1 week)
- Phase 3: First parse behind `?engine=rust` flag in TS app (~2 weeks)
- Phase 3.5: Optimization passes (if Phase 3 misses perf budgets) (up to 1 week)
- Phase 4: Interactive lazy stub-expand (~1 week)
- Phase 5: NDJSON path (~1 week)
- Phase 6: Search slow-path (~1 week)
- Phase 7: Default-flip gate (~few days)
- Phase 8: Schema inference in parser worker (~1 week)
- Phase 9: Optional grind (~1 week)

Pre-flight decisions all resolved per `RUST_MIGRATION_PLAN.md` § Pre-Phase-0 Decisions.

## Cut order — what goes if total slips

Combined cut order:

1. **Rust Phase 9** (optional grind) — pure nice-to-have
2. **M2 Slice C3** (editable jq translation) — feature works without it
3. **M2 Slice D2** (in-context CTAs) — D1 waitlist ships alone
4. **Rust Phase 8** (schema in parser worker) — defer to M3
5. **M2 Slice D3** (content posts) — 2 → 1 → 0
6. **Architecture cleanup items** — already deferred from M1
7. **M2 Slice C entirely** (NL→jq)
8. **Rust Phases 5-6** (NDJSON + search in Rust)

DO NOT CUT:
- Brand decision (binding constraint)
- M2 Slice B (B1-B6 — load-bearing AI differentiator)
- M2 Slice A (already shipped, just don't regress)
- M2 Slice D1 (waitlist)
- Rust Phases 1-4 if you've committed to Rust at all
- Track 1 launch-readiness items

## Verification — three-bar framework (per migration plan)

- **Bar A — Functional parity**: Rust engine produces same output as TS engine for all fixtures + e2e specs pass with `?engine=rust` flag
- **Bar B — Performance ROI**: 11 perf budgets in `benchmarks/methodology.md` — any miss > 30% triggers stop/optimize/revert
- **Bar C — Cleanup**: `?engine=rust` flag removed after default flip; TS parser path either gone or documented

Single-question gate: "Are we done?" = Bar A green + Bar B budgets met + Bar C clean.

## Cross-reference

- `RUST_MIGRATION_PLAN.md` — **active** engine-only build plan
- `RUST_REWRITE_PLAN.md` — parked full-rewrite design reference
- `PLAN.MD` — M1 wedge features (mostly shipped in TS app)
- `PLAN_M2.md` — M2 feature slices A/B/C/D (Slice A shipped, B/C/D pending)
- `PROJECT_PLAN.md` — 3-month strategic plan + three differentiators
- `RESEARCH_PLAN.md` — customer-discovery Q1-Q7
- `benchmarks/methodology.md` — perf baseline + parity floor
- `outreach/*.md` — cold-email, launch narratives, log
- `launch-readiness-gate.md` — audit response status + soft blockers

## Cadence (unchanged)

- Atomic slice per commit, 1-2 bullets max
- Verify-then-commit (cargo check + clippy + test for Rust; tsc + lint + test for TS)
- `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` / `perf(...)` prefixes
- No marketing verbs; no Claude attribution
- Stage + draft + stop — user runs commits
