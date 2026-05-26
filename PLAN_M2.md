# Month 2 Implementation Plan — JSON Tool

> Companion to `PLAN.MD` (Month 1 — wedge build), `PROJECT_PLAN.md`
> (3-month strategic plan), `RESEARCH_PLAN.md` (customer discovery
> protocol), and `launch-readiness-gate.md` (launch checklist).
>
> What this IS: M2's tactical execution doc — the 4 differentiator
> slices, the customer-discovery cadence, the architecture cleanups
> queued from M1.
> What this is NOT: speculation about M3 paid product shape — that
> depends on customer-discovery output. M3 gets its own plan.

Last updated: **2026-05-26** (created same day JSONPath landed in M1).

---

## Strategic context — the three core differentiators

Per `PROJECT_PLAN.md` § "Three core differentiators", these are the **only three things we will be world-class at in the free tool**. Every other M2 feature is either polish or a paid-product teaser. M1 shipped #1 + half of #3. M2's job: ship #2 + the rest of #3.

| # | Differentiator | M1 status | M2 status |
|---|---|---|---|
| 1 | **Huge-JSON handling** (500MB ceiling, streaming parse, virtualized tree, NDJSON, viewer-only mode) | ✅ shipped | — (M2 polish only) |
| 2 | **Semantic diff + "compare against working sample"** — detects renames, type changes, enum shifts, structural drift. NOT textual diff. Killer feature for paid lead-gen. | not started | **M2 priority** |
| 3 | **AI grounded explanations + schema inference** — paste JSON → schema (✅ M1) + AI-cited path-by-path explanations of what fields mean and what looks suspicious. No free-form chat. | schema ✅; AI layer not started | **M2 priority** |

Why these three (from `RESEARCH_PLAN.md` synthesis):

- Differentiator #1 is the **technical moat + benchmark-able claim**. Done.
- Differentiator #2 is the **paid-product seed** — semantic-drift detection IS the paid SDK's killer feature in M3.
- Differentiator #3 is the **AI wedge** that justifies the "AI-native structured data debugger" positioning vs. Stack.hu / JSONFormatter.org commodity-viewer competition.

**Wedge framing recap** (from `PROJECT_PLAN.md` § Why this framing):
- LLM-only positioning has model-layer disruption risk (OpenAI `response_format: json_schema` + Anthropic strict tool use kill *syntactic* failures within ~12 months).
- M2 leans into *semantic* failures, *cross-version drift*, *business-logic anomalies* — the part native structured output can't solve.

---

## Pre-flight — prerequisites from M1

M2 doesn't start until these all ship:

- [ ] Brand decision locked (name + domain + handles + trademark cleared)
- [ ] CF Pages live at canonical domain with `_headers` (CSP/HSTS/COOP/Trusted Types)
- [ ] `robots.txt` flipped to `Allow: /` + sitemap published + canonical domain
- [ ] 4 SEO routes have real ~1,500-word content (replacing StubBanner placeholders)
- [ ] Plausible dashboard receiving production traffic
- [ ] HN Show HN posted; r/dataengineering + r/webdev + Lobsters + Twitter sent
- [ ] First batch of cold-email (50 messages, 2 persona variants) sent + first 5 responses categorized
- [ ] Auth scaffold landed (Clerk or Auth.js — needed for waitlist + paid-tier teasers in M2)
- [ ] Analytics + custom event tracking working (`sample_loaded`, `share_link_created`, `url_load_attempted` at minimum)
- [ ] Email capture wired with a real Resend/Postmark sender on the brand domain

If any are open at M2 start, finish them before locking M2 work.

---

## M2 feature slices

### Slice dependency graph

```
Slice B (API key UX, B1)
  ├─ enables → Slice B (B2–B5: AI grounded explanations)
  └─ enables → Slice C (C1: NL→jq translation)

Slice C (C2: jq-wasm runtime) — independent

Slice A — independent of B/C/D

Slice D — D1 (waitlist) gated on persona-overlap data (see Slice D gate)
        — D2 (in-context CTAs) depends on A + B existing (CTAs fire at
          repair-triggered + diff-detected moments — those are A/B events)
        — D3 (content posts) — independent
```

Order if maximizing reuse: B1 → C2 → A → B2-5 → C1 → C3 → D. Order if maximizing visible-product-value: A → B → C → D (the current Slice ordering). Either works.

### Slice A — Semantic diff + compare-to-sample (differentiator #2)

**Goal:** ship the killer feature that demonstrates the paid product's seam.

| Sub-slice | Scope | Time |
|---|---|---|
| A1. Semantic-diff lib | `src/lib/diff/semantic.ts` — walks two TreeNodes side-by-side, classifies each leaf as: same / value-changed / type-changed / renamed (heuristic on neighbor similarity) / added / removed / structurally-drifted. Tested against 10 fixture pairs covering all 7 categories. | ~1.5 days |
| A2. Diff UI | New `/diff` route + `DiffPane` sub-tab in RightPane (or main route depending on UX call) — paste-both-sides OR drop-both-files OR drop-one-then-baseline pattern. Inline color-coded tree with hover-explanations. | ~2 days |
| A3. "Compare against working sample" | "Save current as baseline" button → localStorage stash (no backend yet). Reopen with a new payload → automatic diff against the baseline. Surfaces drift in moments of frustration → CTA to paid waitlist. | ~1 day |
| A4. e2e + unit specs | Round-trip on each diff category + paste-both-sides UI flow | ~0.5 day |

**Total: ~5 days** — this is the biggest M2 slice; pace accordingly.

### Slice B — AI grounded explanations (differentiator #3 completion)

**Goal:** paste JSON → get cited explanations + suspicious-field flags.

**Non-negotiables (from `PROJECT_PLAN.md`):**
- Every claim cites a JSON path. No free-form "chat with your JSON."
- Schema-inference output (M1) feeds the prompt — model has structural context, not just raw text.
- Output rendered as a sidebar/dialog with path → explanation pairs, clickable to scroll the tree.

| Sub-slice | Scope | Time |
|---|---|---|
| B1. API key UX | User brings own OpenAI/Anthropic key — stored in localStorage (encrypted-at-rest with WebCrypto if scope allows). Settings dialog with "Test connection" button. NO server-side key storage. | ~1 day |
| B2. Prompt engineering + cost estimation | System prompt that forces JSON-path citation in output. Cost-per-explanation estimate shown before user hits Run. Token-budget guard for huge JSONs (sample-walk only, not full document). | ~1 day |
| B3. ExplainPane UI | Sidebar with explanations + click-to-scroll-tree integration (reuses the JSONPath QueryPane's pattern — `setFocusedIndex` + ancestor-collapsed toast). | ~1.5 days |
| B4. Privacy framing | Prominent banner: "Your JSON goes to {OpenAI/Anthropic} when you click Explain. Toggle off to skip the AI layer." Aligns with "We never see your data" promise — we don't see the JSON, but their provider does. | ~0.5 day |
| B5. e2e + unit specs | Mock the API in tests; verify citation parsing + click-to-scroll. | ~0.5 day |
| **B6. Cost circuit breaker** | Per-explanation hard token-cap (default 50K input + 4K output) + per-session $ cap (default $1, user-editable) + document-size cap (>1 MB triggers automatic sample-walk truncation before any API call). Display estimated cost + actual session-spend prominently in the API key dialog. **Defaults matter — most users won't change them.** | ~1 day |

**Total: ~5.5 days** (was ~4.5 before B6 cost breaker added)

### Slice C — NL → jq query

**Goal:** lower the jq learning curve by accepting natural-language input.

| Sub-slice | Scope | Time |
|---|---|---|
| C1. NL→jq translation | Same API key UX as Slice B (reuse). LLM call translates "show me events with status=error" → `.events[] | select(.status == "error")`. | ~1 day |
| C2. jq runtime | `jq-wasm` worker host + result-render pane. Reuses jq-as-wasm work that was cut from M1 (jq query bar). | ~2 days |
| C3. Editable translation | NL → translated jq shown to user → user can edit before Run → result. Educates users about jq syntax over time. | ~1 day |
| C4. e2e + unit specs | | ~0.5 day |

**Total: ~4.5 days**

### Slice D — Paid-tier teasers + waitlist

**Goal:** capture qualified leads at moments of frustration WITHOUT breaking the free-tool UX promise.

**Slice D gate (per `PROJECT_PLAN.md` risk #1, `RESEARCH_PLAN.md` Q1):**

Don't ship D1 (waitlist form) OR D2 (in-context CTAs) until cold-email batch returns **≥10 responses with ≥3 showing persona overlap** (free-tool users who also work with LLM JSON). If overlap is < 30%, the paid-tier framing needs to change BEFORE the form copy lands — otherwise we collect leads on a wedge we're about to pivot. D3 (content posts) is exempt from this gate — content drives traffic regardless of paid framing.

| Sub-slice | Scope | Time |
|---|---|---|
| D1. Waitlist with use-case capture | Form at `/waitlist`. Captures: email, company, role, primary pain (3 options), free-text use case. Persists to Postgres (backend setup) OR an Airtable / Notion API as MVP. | ~1 day |
| D2. In-context CTAs | Subtle CTAs in moments of frustration: after JSON repair fires ("This was a repaired payload — want alerts when your LLM ships malformed JSON?"), after semantic diff detects drift ("Want to monitor this payload over time?"). NOT a marketing banner on every page. | ~1 day |
| D3. Two deep-dive content posts | (a) "Why your LLM ships 0.3% malformed JSON and nobody notices" — real failure modes seen across our customer-discovery interviews + benchmark data. (b) "Semantic drift in API payloads: the post-mortem you didn't write" — case study format. Both 2,000+ words, technical, defensible. | ~3 days writing |

**Total: ~5 days** (most of D3 is writing, parallelizable with code work)

---

## Performance budgets per slice

M1 had explicit perf targets (200 MB parse < 10s, search-keystroke INP < 200ms, etc.). M2 features without budgets are scope-creep risk:

| Slice | Operation | Budget | Failure mode if missed |
|---|---|---|---|
| A. Semantic diff | 200 MB × 200 MB compare | < 3s on M-series MBP | Reduce to spine-only diff with stub-warn |
| A. Diff render | 50K diff entries | < 500ms first paint | Virtualize result list with react-window |
| B. AI explain | 1 MB JSON, 50K tokens | < 8s end-to-end | Truncate sample-walk earlier |
| B. AI cost ceiling | Per explanation | **< $0.20 default** | Hard cap; user opt-in to higher |
| B. AI cost ceiling | Per session | **< $1 default** | Hard cap; UI shows running spend |
| C. NL → jq translation | 1 query | < 2s | Show cached examples while waiting |
| C. jq-wasm cold load | First Query-tab activation | < 800ms | Preload on Query tab hover |
| D. Waitlist submit | Submit → confirmation toast | < 500ms | Defer Postgres write to background |

Measured against the same protocol as `benchmarks/methodology.md` (Apple M-series, Chrome stable, production build via `npm run preview`).

---

## Telemetry events to wire

Custom Plausible events that drive M3 decisions. Wire these as each M2 slice lands — without them we have no signal for what's working.

| Event | When fires | Why |
|---|---|---|
| `semantic_diff_run` | User clicks Diff with both sides loaded | Validates differentiator #2 demand |
| `compare_baseline_saved` | User clicks "Save as baseline" | Hottest signal for paid-product seed |
| `ai_explain_requested` | User clicks Explain | Validates differentiator #3 demand + AI-key adoption |
| `ai_explain_cost_capped` | Cost circuit breaker fires | Tells us when defaults are too tight |
| `nl_jq_translated` | User accepts/edits an NL→jq translation | Slice C usefulness |
| `waitlist_signup` | Form submitted on `/waitlist` | Primary M2 conversion metric (target 200) |
| `paid_cta_clicked` | In-context CTA click | Frustration-moment conversion rate |
| `paid_cta_dismissed` | CTA closed without action | Annoyance signal — kill the CTA if dismiss > 10× click |

Privacy framing carries forward: events contain NO JSON content, NO user identifiers, NO third-party trackers (per `PROJECT_PLAN.md` § strong privacy pitch).

---

## Customer discovery (parallel — per `RESEARCH_PLAN.md` Part B)

Runs alongside the build, not before. Hard cadence: 1 call per day max; quality > quantity.

| Activity | Target | Source |
|---|---|---|
| Customer conversations | 15 (10 LLM engineers + 5 integration engineers) | Cold-email batches + Discord/Slack DM + personal network |
| Cold email batches | 50 messages, batches of 10 with iteration | YC recent batches, AI engineer Discord/Slack, indie hackers AI tag |
| Launch posts | HN Show HN + Indie Hackers + Reddit r/LocalLLaMA, r/MachineLearning, r/LangChain | Single-day burst per `outreach/launch-narratives.md` |
| Competitive deep-dive | **Cadence:** 1 competitor / week, 90-min timebox per dive. Output appended to `competitive_matrix.md` (NEW). Order: Langfuse → Helicone → Arize → Braintrust → Instructor → jsonrepair → OpenAI Structured Outputs → Anthropic strict tool use → Outlines/Guidance/llguidance. 9 weeks total — runs past M2 into M3 prep. | Tractable; no marathon dive day |
| Disruption risk validation | Test GPT-4o strict mode on 5 real-world schemas. Document what slips through. | Per `RESEARCH_PLAN.md` Q3 |

**Decision rules** (from `RESEARCH_PLAN.md` Q1):
- <8/15 say "yes this is real pain" → re-evaluate direction
- <3/15 would pay anything → re-evaluate monetization
- \>12/15 already use Langfuse/etc and happy → find sharper wedge
- \>10/15 say "compare against working sample" matters → that's the killer; lock it

---

## Architecture cleanup track (parallel — runs regardless of feature work)

All deferred from M1 audit per `launch-readiness-gate.md` § Architecture cleanup. The Playwright e2e suite landed in M1 W5 — the safety net these refactors needed is in place.

| Item | Time | Why now |
|---|---|---|
| TreeView orchestration extraction | ~half-day | 520 LOC orchestration file; parse dispatch + NDJSON detection + search wiring all in one place |
| `parse-streaming.ts` split | ~half-day | 588 LOC; extract tokenizer-pump + stub-emit logic |
| TablePane decomposition | ~half-day | 524 LOC; extract column-derivation + sort coordinator |
| viewStore split (`viewState` + `parserSession`) | ~1 hr | Explicit "tipping point" note in the file |
| Schema worker root-clone elimination | ~2 hrs | Route inference through parser worker (already holds the tree); eliminates ~225 MB structured-clone on every Refresh |
| Identity consistency pass | ~1–2 hrs | 2 dormant sites with legacy `path`-keying (parse-streaming arrayLengths, ByteIndexEntry) |
| Stub-expand e2e + tree-row testids | ~1 hr | Markup tweak on TreeNode + a new e2e spec; closes the §Action #2 sub-gap |
| Worker integration tests | ~half-day | Parser worker + schema worker boundary tests |
| React component test infrastructure | ~half-day | @testing-library/react for unit-level UI work alongside Playwright integration |

Target: land at least 2 of these in M2.

---

## Production hardening track (parallel)

| Item | Time | Notes |
|---|---|---|
| Trusted Types browser smoke validation | ~30 min | Manual pass on deployed URL: editor mount + JSON syntax + hover + diagnostics + RepairDialog + 10MB viewer-only |
| CSP-reporting endpoint | ~half-day | Minimal backend OR Sentry/Report-URI |
| Client error reporting (Sentry/Bugsnag) | ~half-day | Defer until launch traffic justifies cost |
| `?url=` connect-src tightening | ~30 min | Once trusted destination set is known from telemetry |
| Dompurify override removal | ~5 min when ready | Wait for Monaco upstream patch |
| Lighthouse CLI fix | ~half-day | `Page.navigate: Target closed` in headless; defer if DevTools panel keeps working |

---

## Customer-driven backlog

Items land here when they show up in calls / HN comments / cold-email replies / GitHub issues. Pre-populated with plausible items based on M1 audit signal; **none ship without customer signal** (≥2 different customers ask).

- CSV export from Table view
- Diff view between two JSON documents *(now an M2 slice — see Slice A)*
- Multi-file workspace (open N files in tabs)
- Mobile-friendly tree navigation
- Keyboard shortcut overlay (`?` to show)
- Schema export to OpenAPI fragment
- "Pin" UI for frequently-referenced subtrees
- Compare JSON to JSON Schema (validate + report violations)

---

## Out of scope for Month 2

Explicit cuts (per `PROJECT_PLAN.md` § What we are explicitly NOT building):

- **VSCode extension** — distribution channel for later, not a starting product
- **Native desktop (Tauri/Electron)** — Year 2
- **Real-time collaboration** — huge surface, low pull until paying teams ask
- **Full API platform** — Postman/Insomnia own this
- **API request replay / mocking** — same
- **Mobile-optimized layout** — nobody pastes JSON on a phone
- **Self-hosted enterprise tier** — M3+ when there's revenue justifying it
- **Multi-system payload correlation** — Year 2 moat (design data model in M3 to enable this later)
- **Generic LLM observability (prompt traces, eval frameworks)** — Langfuse/Helicone own this; we wedge on structured-output reliability specifically

---

## Cut order if M2 slips

When timing pressure hits, cut in this exact order. Don't cut earlier items first — they're the wedge.

1. **Slice C (NL → jq)** — biggest cuttable single slice (~4.5 days). jq value alone is real but small for the free-tool target persona; NL layer is novelty. Cut to "jq query bar only, no NL translation" first, then drop entirely.
2. **Slice D2 (in-context CTAs)** — can ship D1 (waitlist form) without D2 (frustration-moment CTAs). D2 lands as a post-launch follow-up once we know which CTAs actually convert.
3. **Architecture cleanup track** — target was "land 2." Can drop to 0 if features need the time. Each item is genuinely deferable (e.g., parse-streaming.ts split has been deferred since M1).
4. **D3 (deep-dive content posts)** — 2 posts → 1 post → defer to M3-launch period.

**Do NOT cut:** Slice A (semantic diff — the differentiator + paid seed), Slice B core (B1-B5, the AI grounded explanations), Slice B6 cost breaker (load-bearing safety), Slice D1 (waitlist — only path to capture launch traffic as qualified leads). These are the M2 spine.

---

## M2 exit / M3 trigger

M2 ends when EITHER:

- All "Verification gates" met (gate-based exit), OR
- **Calendar Day 28 of M2** (calendar exit), whichever comes first

If calendar exit fires with gates unmet:
1. Pause new M2 work
2. Take 3 days to finish whichever gate is closest to met
3. OR explicitly cut to M3

**No "M2 extension."** Drift is the failure mode the cut order exists to prevent — extending M2 indefinitely is what kills startups. If we hit Day 28 with 3 of 9 gates met, M3 still starts on Day 32; the unmet gates either get re-scoped into M3 or get explicitly killed.

---

## Verification gates — M2 done

Per `PROJECT_PLAN.md` § Month 2 exit criteria:

| Gate | Measurement |
|---|---|
| Differentiator #2 shipped | Semantic diff lives in production; compare-to-sample working |
| Differentiator #3 completed | AI grounded explanations shipped (schema was M1) |
| NL → jq shipped | Free-tier feature live |
| **200 waitlist signups** | Tracks paid-product interest |
| **10 verbal "yes, I'd pay" commits** | Validates monetization assumption |
| Pricing locked | From P1 research + customer-discovery findings |
| ≥ 2 architecture cleanups landed | Parallel-track productivity check |
| Customer discovery synthesis complete | Decision: continue / pivot wedge / pivot direction |
| Disruption-risk hypothesis tested | GPT-4o strict mode failure-mode analysis published |

---

## Risks & mitigations (from `PROJECT_PLAN.md` § Risks)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Native structured output kills the entry wedge | Position broader: semantic + drift + cross-version, not just "valid JSON". Slice A (semantic diff) is the hedge. |
| 2 | Free tool gets traffic but nobody converts | Slice D in-context CTAs at moments of frustration (repair, drift), NOT marketing banners. |
| 3 | Langfuse / Helicone add structured-output features and out-distribute | Own the structured-output-reliability niche specifically; don't fight on prompt observability. |
| 4 | Pain is real but budgets are individual ($10–20), not team | Validate in customer-discovery before M3 paid build. Decision rule: <3/15 would pay → re-evaluate monetization. |
| 5 | We polish the viewer instead of shipping M2 differentiators | Hard exit date on each M2 slice. Move on even if imperfect. |
| 6 | OSS SDK gets forked, dashboard has no moat | Keep dashboard + monitoring backend closed; SDK is the wedge not the product. (M3 concern; ignore in M2.) |

---

## What feeds M3 (paid product) — explicit handoff list

M3 builds the paid SDK + dashboard. Items M2 must produce for M3 to start:

| M3 input | Source in M2 |
|---|---|
| SDK first language (TS or Python) | 15 customer-discovery interviews answer this |
| Exact pricing | P1 pricing-benchmarks research + customer "would pay X" answers |
| Persona-overlap data | Cold-email batch + customer-call notes (shapes M3 dashboard's primary audience) |
| Disruption-risk verdict | Native-structured-output test → either lean into LLM wedge or pivot to API-drift positioning |
| Top 5 failure modes seen in real customer data | Forms the M3 dashboard's default alerting suite |
| 200+ waitlist signups | Initial M3 outreach target |
| 10+ verbal pay commits | M3 first-customer conversion list |

---

## Open questions to resolve during M2

1. **Which AI provider for differentiator #3?** OpenAI vs. Anthropic vs. both vs. user-choice. Cost + structured-output reliability + latency tradeoffs.
2. **Auth provider** — Clerk vs. Auth.js. Per M1 pre-flight; decision deferred to M2 start.
3. **Backend stack for waitlist persistence** — Bun + Postgres on Fly/Railway vs. simpler-MVP (Airtable / Notion API).
4. **Does compare-to-sample need backend storage or stays localStorage?** Pure-localStorage is the privacy-symmetric choice but loses cross-device sync.
5. **Open-source split** — SDK open + dashboard closed (Posthog/Langfuse model) per `PROJECT_PLAN.md`. **Decide by M2 Week 3** — before any M3 architecture work starts. Decision affects: repo topology (mono vs split), license file in SDK, contributor agreement template, OSS-friendly README structure.

---

## Cadence + commit hygiene (unchanged from M1)

- Atomic slice per commit, 1–2 bullets max (`feedback_short_commit_messages`)
- Verify-then-commit (tsc + unit + e2e green)
- `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` / `perf(...)` conventional prefixes
- No marketing verbs in commit messages (avoid "implement"/"improve"/"enhance")
- Feature freeze from M1 is lifted; M2 features are explicitly authorized
- Customer-discovery-driven items still gate on the "≥2 customers ask" rule

---

## Cross-reference

- `PLAN.MD` — Month 1 scope + locked stack + week-by-week M1 plan
- `PROJECT_PLAN.md` — 3-month strategic plan + three differentiators + business model + risks
- `RESEARCH_PLAN.md` — customer discovery protocol (Part B questions Q1–Q7) + decision rules
- `launch-readiness-gate.md` — launch checklist + deferred architecture items (the M2 cleanup track)
- `ENGINEERING_ASSESSMENT.md` — 2026-05-22 audit driving the W5 audit-response work
- `outreach/launch-narratives.md` — A/B narrative drafts, perf numbers, HN drafts
- `outreach/log.md` — customer-call notes (populates W1 of M2 onward)
- `benchmarks/methodology.md` — measurement protocol for any perf claims
