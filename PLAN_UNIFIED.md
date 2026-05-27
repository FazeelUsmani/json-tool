# Unified Roadmap — json-tool

> **Master plan as of 2026-05-27 (evening).** Captures the active
> rewrite path + brand-session-first calendar + customer-discovery
> interleave + reference-doc map.
>
> **Active path:** Full Rust rewrite per `RUST_REWRITE_PLAN.md`.
>
> **Reference docs** (NOT active scope — used as parity reference for
> what to rebuild in the new Rust app):
> - `PLAN.MD` — M1 wedge features (parser, NDJSON, schema, repair, table, share, JSONPath)
> - `PLAN_M2.md` — M2 differentiator features (semantic diff [shipped in TS], AI explanations, NL→jq, paid waitlist)
>
> **Parked alternative** (real fallback if rewrite-cost becomes blocking):
> - `RUST_MIGRATION_PLAN.md` — engine-only WASM migration (cheaper, faster, lower-risk; 6-8 weeks vs. rewrite's 20-30)
>
> **Decision history** preserved so future-self can audit the
> trajectory: this file went through three states on 2026-05-27 —
> engine-only-active (afternoon) → rewrite-active (evening). The
> flip is captured in commit messages + memory `project_rust_strategy`.

---

## Status snapshot (2026-05-27 evening)

| Track | State | Next action |
|---|---|---|
| **Existing TS app** (this repo) | M1 + M2 Slice A shipped; treated as reference implementation under rewrite. Not shipped publicly under rewrite path. | Rename repo to `json-tool-app`; archive after Rust app reaches parity |
| **Rust rewrite** (new repo) | Not started. Plan authored. | Brand session → new repo setup → Phase 0 toolchain |
| **Brand decision** | Pending ~10 days | **W0 — today.** Same dependency under rewrite path. |
| **Launch readiness** | Audit response shipped to TS app; not deployed publicly under rewrite | Reconsidered post-Phase-3 (when Rust app reaches first useful state) |
| **Customer discovery** | Cold-email batches + 5 calls + 15 customer interviews | Runs in parallel with Rust phases, independent of stack |

## New repo structure (decided 2026-05-27 evening)

| Repo (GitHub) | Local path | Content | Status |
|---|---|---|---|
| `json-tool-app` (renamed from `json-tool`) | `/Users/fazeel/Documents/json-tool-app/` | React/TS app — full M1 + M2 Slice A implementation. Reference for what the new Rust app must achieve parity with. | Archive after parity confirmed |
| **`json-tool`** (new repo) | `/Users/fazeel/Documents/json-tool/` | Rust app — Leptos/Yew + WASM, fresh start | Phase 0 toolchain → 15-phase buildout per `RUST_REWRITE_PLAN.md` |

## The binding constraint — brand decision (unchanged)

Brand decision is still W0. Same dependencies under rewrite path:

- New repo name on GitHub is `json-tool` for now, but the **public-facing brand name** still needs to be picked (it shows in OG metadata, README, HN post, cold-email signature, app's `<title>` tag, etc.).
- Domain registration, GitHub org name, npm scope, Twitter handle — all need the brand name.
- Cold-email batches can't send without a brand to introduce yourself as.
- Customer-call recruiting needs the brand name in the DM.

The rewrite **doesn't bypass brand**; it delays when brand matters publicly (Phase 12 SEO routes, Phase 15 launch). But it's still W0 because every parallel non-rewrite track depends on it.

## Calendar — brand-session-first + rewrite phases

Solo dev. ~20-30 weeks total elapsed time. Optimistic targets below; pessimistic adds ~50%.

```
W0 (today, 2026-05-27 evening):
  - Brand session (90 min)
  - GitHub: rename current repo `json-tool` → `json-tool-app`
  - GitHub: create new repo `json-tool` (or `[brand]` if brand → main repo name)
  - Local: mv json-tool json-tool-app + mkdir new json-tool
  - Memory directory move (Claude memory tied to working dir path)

W1: Rust Phase 0 (new repo) — toolchain + skeleton (~half-day work, rest of week is skill ramp prep)
    + Customer-call recruiting from W1 (cold email pre-brand can't send yet; LinkedIn DMs can)

W2-W4: Rust skill ramp (2-3 weeks per pre-flight decision)
       Toy WASM project: hello_world + a tokenizer kata
       Customer call #1 + #2

W5: Rust Phase 1 — routing + layout shell (~1 week)
W6-W9: Rust Phase 2 — JSON parsing engine (~3-4 weeks)
W10-W12: Rust Phase 3 — tree view + virtualization (~2-3 weeks)
W13-W14: Rust Phase 4 — editor (CodeMirror via JS interop per Risk #1) (~2 weeks)
W15-W16: Rust Phase 5 — schema inference + emitters
W17: Rust Phase 6 — NDJSON + stub expansion
W18: Rust Phase 7 — search + JSONPath query
W19: Rust Phase 8 — diff + baseline (M2 Slice A parity)
W20-W21: Rust Phase 9 — repair + format + table view
W22: Rust Phase 10 — PWA + service worker
W23: Rust Phase 11 — share links + URL load + ?url= security
W24-W25: Rust Phase 12 — SEO routes + SSR/SSG (brand-coupled copy ships now)
W26: Rust Phase 13 — A11y + theming + responsive
W27-W28: Rust Phase 14 — test parity + e2e port (31 e2e + 434 unit tests)
W29: Rust Phase 15 — audit response items (CI, headers, etc.)
W30+: Launch prep + cold-email batches + HN/Reddit/Lobsters post
```

**Launch (first public version of Rust app)** targets W30+ ≈ ~7 months from today (optimistic). Pessimistic: W42 ≈ ~10 months.

**90-day company goal of 10 paying teams: voided.** Restate goal on a 12-18 month horizon (or as "0 paying teams in 90 days, 10 paying teams in 18 months").

## What gets discarded vs preserved from existing TS app

**Preserved** (rolls into the new repo as reference / strategy / measurement, not code):
- `PLAN.MD` (M1 scope reference)
- `PLAN_M2.md` (M2 scope reference)
- `PROJECT_PLAN.md` (strategic positioning)
- `RESEARCH_PLAN.md` (customer-discovery protocol)
- `benchmarks/methodology.md` (perf baseline — parity floor for Rust app)
- `outreach/*.md` (cold-email templates, customer-call notes)
- Domain knowledge in code comments (parser semantics, stub model, JSON Pointer rationale)
- Audit-response decisions (CI patterns, branch protection ask, identity refactor, privacy framing)
- Test fixtures (port the inputs; assertions get re-derived)

**Discarded** (not directly reused as code):
- ~3 weeks of M1/M2 TS implementation (~140 source files, ~10K LOC)
- 31 Playwright e2e specs (assertions get re-written for new app; selectors will change)
- 434 unit tests (must be ported to Rust)
- Monaco integration (replaced with CodeMirror per Risk #1 default)
- Workbox PWA configuration (re-derived in Rust SW)
- vite-react-ssg routing (replaced by leptos_router or yew-router)

## Customer discovery runs in parallel (independent of stack)

Per `PLAN_M2.md` § Customer discovery — same protocol applies. Stack choice is irrelevant to customer-call recruiting + cold-email batches + 15 interviews + competitive deep-dives.

- 15 customer interviews across W2-W20
- 50-message cold-email batches at W6 / W12 (post-brand, pre-launch)
- Competitive deep-dive cadence: 1 / week
- Disruption-risk test: GPT-4o strict mode (anytime W3-W10)

If customer-discovery reveals the wedge needs to change, **pivot the rewrite scope before Phase 6+** per `RUST_REWRITE_PLAN.md` § Pivot Conditions. Phases 0-5 are wedge-agnostic.

## Pivot conditions (re-stated from RUST_REWRITE_PLAN.md)

If any of these trigger, pivot back to `RUST_MIGRATION_PLAN.md` (engine-only) OR back to shipping the existing TS app:

- Rust Phase 4 (editor) stalls > 4 weeks
- Cumulative elapsed time at end of Phase 7 > 12 weeks (budgeted 10-15 weeks for Phases 0-7)
- Customer discovery reveals wedge has changed AND existing TS app could ship faster against the new wedge
- Bundle size at end of Phase 5 > 1.5 MB gzipped (WASM + JS glue)
- Leptos signals API churns more than once in the build window

**Pivot is acceptable, not a failure.** Engine work done in the Rust crate ports cleanly into the existing TS app via WASM (the migration-plan path). Only the UI rebuild is sunk cost.

## Verification — three-bar framework

Same structure as `RUST_REWRITE_PLAN.md` § Verification Framework:

- **Bar A — Feature parity** with existing TS app (all 31 e2e + 434 unit tests ported and passing)
- **Bar B — Perf parity OR improvement** (200 MB parse ≤ 5.6s, INP ≤ 168ms, etc. — current TS budgets are the floor)
- **Bar C — Deploy + audit parity** (CF Pages, `_headers`, branch protection, no privacy regression)

Single-question gate: "Are we done?" = all three yes. "Mostly" or "almost" = not done.

## Cross-reference

- `RUST_REWRITE_PLAN.md` — **active plan**, 15 phases, feature parity mapping, stack decisions, editor-replacement risk analysis
- `RUST_MIGRATION_PLAN.md` — parked engine-only alternative; Phase 0 baseline still valid as parity floor
- `PLAN.MD` — M1 scope reference (what to rebuild in Phases 6-11)
- `PLAN_M2.md` — M2 scope reference (Slices B/C/D to rebuild in Phases 8-9)
- `PROJECT_PLAN.md` — strategic positioning + three differentiators + business model
- `RESEARCH_PLAN.md` — customer-discovery Q1-Q7 + decision rules
- `benchmarks/methodology.md` — perf measurement protocol + Phase 0 TS baseline
- `outreach/*.md` — cold-email templates, customer-call DM, launch narratives, log
- `launch-readiness-gate.md` — audit response checklist (reference for what to re-derive in Rust app)

## Cadence (unchanged)

- Atomic slice per commit, 1-2 bullets max
- Verify-then-commit (`cargo check` + clippy + test + trunk build per slice)
- `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` / `perf(...)` prefixes
- No marketing verbs; no Claude attribution
- Stage + draft + stop — user runs commits
