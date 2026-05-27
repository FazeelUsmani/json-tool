# Unified Roadmap — json-tool

> **Master plan.** The active product path is the existing
> Vite/React/TypeScript app. Brand decision unblocks launch;
> M2 features follow; M3 paid product comes after customer validation.

## Status snapshot

| Track | State | Next action |
|---|---|---|
| TS app (`~/Documents/json-tool`) | M1 shipped + M2 Slice A shipped (semantic diff lib + DiffPane + baseline) | Launch readiness + remaining M2 features |
| Architecture cleanup | Schema worker root-clone elimination shipped (eliminates ~225 MB structured-clone on every Refresh) | Continue with TreeView orchestration extraction OR viewStore split |
| Brand decision | Pending | **W0 launch unblock** — required for README, SEO copy, cold-email signature, domain |
| Customer discovery | Pending batches + calls | Runs in parallel with launch work |

## The binding constraint — brand decision

Brand session is W0 and gates:
- README rewrite (~2 hr)
- 4 SEO routes × ~1,500 words copy
- OG metadata + Twitter handle + domain registration
- Cold-email signature + sender domain
- HN post + Reddit + Lobsters + Twitter launch

Engineering work runs in parallel but doesn't substitute. 90-min focused session.

## Calendar

```
W0 (now): Brand session (90 min)
W1: Launch readiness (SEO copy, _headers, robots, branch protection,
    e2e expansion) + LAUNCH (HN/Reddit/Lobsters/Twitter)
W2: Cold-email batch 1 + customer call recruiting + M2 Slice B1
    (API key UX, bring-your-own-key for AI explanations)
W3-W4: M2 Slice B (AI grounded explanations — B2-B5: prompts,
    ExplainPane, privacy framing, tests)
W5: M2 Slice B6 (cost circuit breaker) + Customer calls 1-2
W6: M2 Slice C1-C2 (NL→jq translation + jq-wasm runtime)
W7: M2 Slice C3-C4 + cold-email batch 2
W8: M2 Slice D1-D2 (waitlist + in-context CTAs, GATED on
    persona-overlap data ≥ 10 responses with ≥ 3 showing overlap)
W9: M2 Slice D3 (deep-dive content posts) + architecture cleanup
W10: M2 verification gates + customer-discovery synthesis → M3 decision
```

90-day "10 paying teams" target around W12-13.

## Three orthogonal tracks

### Track 1 — Launch readiness (W0-W1)

Per `PLAN.MD` § Verification + `launch-readiness-gate.md`:

- Brand decision (90 min)
- README rewrite (brand-coupled)
- 4 SEO routes × ~1,500 words content
- `_headers` CSP / HSTS / COOP / XFO / Trusted Types
- `robots.txt` flip + sitemap
- Branch protection on `main`
- Playwright e2e suite expansion
- Plausible custom events
- HN + Reddit + Lobsters + Twitter posts queued
- Repo public flip on launch day

### Track 2 — M2 features (W2-W10)

Per `PLAN_M2.md`. Slice A shipped (semantic diff). Remaining:

- **Slice B (AI grounded explanations)** — ~5.5 days, W2-W5
  - B1: API key UX (WebCrypto-encrypted-at-rest localStorage)
  - B2: Prompt engineering with JSON-path citation
  - B3: ExplainPane UI + click-to-scroll-tree
  - B4: Privacy framing banner
  - B5: e2e + unit specs
  - B6: Cost circuit breaker (per-call + per-session $ caps)
- **Slice C (NL → jq)** — ~4.5 days, W6-W7
  - C1: NL→jq translation via shared API key
  - C2: jq-wasm runtime worker + render
  - C3: Editable translation UI
  - C4: e2e + unit specs
- **Slice D (waitlist + CTAs + content posts)** — ~5 days, W8-W9
  - D1: `/waitlist` form (GATED on persona-overlap data)
  - D2: In-context CTAs at repair-fired + diff-detected moments (GATED same)
  - D3: Two deep-dive content posts (NOT gated)

### Track 3 — Architecture cleanup (parallel)

Per `PLAN_M2.md` § Architecture cleanup track. Target: land at least 2 in M2.

- ✅ Schema worker root-clone elimination — shipped (~225 MB structured-clone removed per Refresh)
- TreeView orchestration extraction (520 LOC)
- `parse-streaming.ts` split (588 LOC)
- TablePane decomposition (524 LOC)
- viewStore split (`viewState` + `parserSession`)
- Identity consistency pass
- Stub-expand e2e + tree-row testids
- Worker integration tests
- React component test infrastructure

## M3 territory (not in current scope)

These are future paid-product infrastructure:

- Node.js + TypeScript backend
- Postgres (waitlist persistence beyond MVP Airtable/Notion)
- Redis / BullMQ for jobs
- Object storage at scale (R2 reserved for share-link blobs > 4 MB; URL-hash share shipped instead)
- ClickHouse for SDK event analytics
- Paid SDK (TS or Python — customer-discovery decides)

## Cut order if M2 slips

1. M2 Slice C3 (editable jq translation)
2. M2 Slice D2 (in-context CTAs)
3. Architecture cleanup items
4. M2 Slice D3 (content posts)
5. M2 Slice C entirely (NL→jq)

**DO NOT CUT:**
- Brand decision (binding constraint)
- M2 Slice B (B1-B6 — AI differentiator with cost-breaker safety)
- M2 Slice A (shipped; just don't regress)
- M2 Slice D1 (waitlist — only launch-traffic capture)
- Track 1 launch-readiness items

## Verification — M2 exit gates (per PLAN_M2.md)

| Gate | Measurement |
|---|---|
| Differentiator #2 shipped | Semantic diff + compare-to-sample (A shipped ✅) |
| Differentiator #3 completed | AI grounded explanations shipped (Slice B) |
| NL → jq shipped | Slice C live |
| 200 waitlist signups | Track 2 conversion (D1) |
| 10 verbal "yes I'd pay" commits | Customer-discovery output |
| Pricing locked | Customer-discovery + P1 research |
| ≥ 2 architecture cleanups landed | Schema worker root-clone done; one more needed |
| Customer discovery synthesis | 15 interviews → continue / pivot wedge / pivot direction |
| Disruption-risk hypothesis tested | GPT-4o strict mode failure-mode published |

## Cross-reference

- `PLAN.MD` — M1 wedge features (mostly shipped)
- `PLAN_M2.md` — M2 feature slices A/B/C/D
- `PROJECT_PLAN.md` — 3-month strategic plan + three differentiators
- `RESEARCH_PLAN.md` — customer-discovery Q1-Q7
- `benchmarks/methodology.md` — perf baseline + measurement protocol
- `outreach/*.md` — cold-email, launch narratives, log
- `launch-readiness-gate.md` — audit response status + soft blockers

## Cadence

- Atomic slice per commit, 1-2 bullets max
- Verify-then-commit (tsc + lint + unit + e2e green)
- `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` / `perf(...)` prefixes
- No marketing verbs
- Stage + draft + stop — user runs commits
