# Project Plan

> Working name: **json-tool** (placeholder — rename once chosen)
> Owner: Fazeel
> Timeline: ~90 days to first paying customers
> Last updated: 2026-05-14

---

## What we're building

A **reliability + observability platform for structured data**.

Two surfaces, one company:

1. **Free public web tool** — JSON viewer / formatter / repair / validator with shareable links. Best-in-class craft. This is the **acquisition channel**, not the product.
2. **Paid SaaS** — SDK + dashboard that AI and integration teams plug into production to monitor, validate, repair, and debug structured outputs over time. This is the **business**.

Entry wedge: LLM JSON reliability (where urgency is hottest today).
Long-term: any structured payload — LLM outputs, third-party APIs, webhooks, internal services.

---

## Why this, not something else

Three independent research signals converged on the same conclusion:

| Signal | Conclusion |
|---|---|
| JSON tooling competitive landscape | "Viewers" are commodity. JSON Hero, JSON Crack, Stack.hu have huge traffic and tiny revenue. |
| Market gap analysis | Operational intelligence for structured data is the biggest underbuilt category. |
| AI tooling pain | LLM apps generate JSON, all of them break, current tooling is primitive (regex, manual logs, blind retries). |

The free JSON tool gets us traffic, SEO, and brand. The paid product captures a real, growing pain point in a market where engineers have budgets.

**What we are explicitly NOT building (this quarter, and possibly never):**
- "Another JSON viewer." That's the wedge surface, not the product.
- A full API platform (Postman territory — we lose).
- Generic LLM observability (Langfuse/Helicone territory — we'd need a sharper wedge).
- A graph/diagram visualizer (JSON Crack already proved this is viral but not durable).
- **Native desktop app** (Tauri/Electron). Web-first. Desktop is a "year 2" question.
- **Real-time collaboration** (presence, CRDTs, shared cursors). Huge surface, low pull until we have paying teams asking.
- **VSCode extension.** A distribution channel for later — *after* the web tool has traction.
- **API request replay / mocking.** Postman/Insomnia own this.
- **Mobile.** Nobody pastes JSON on their phone.

Trying to do "all the gaps" is a 2-year roadmap. We pick three and go deep.

---

## Strategic positioning

**Company-level (long-form):**
> "Reliability + observability for structured data — wherever it comes from."

**Free-tool tagline (public-facing):**
> "The JSON tool that handles files everyone else crashes on — and helps you understand them with AI."

Why this framing and not pure "LLM JSON reliability":

- LLM-only positioning has **model-layer disruption risk**: OpenAI `response_format: json_schema` and Anthropic strict tool use will kill the syntactic half of the problem within ~12 months.
- The same operational pain exists for vendor APIs, webhooks, internal services.
- Wider TAM. But LLM stays the entry wedge because the urgency is sharpest there *today*.

The bet: native structured output kills *syntactic* failures (malformed JSON, missing fields). It does not kill *semantic* failures (wrong enum, drifted business logic, cross-version inconsistency, payload-level anomalies). That's where we live.

## Three core differentiators

These are the only three things we will be world-class at in the free tool. Every other feature is either a polish item or a "later" item.

1. **Huge-JSON handling.** Smooth interaction on 500MB → 1GB files via streaming parse + virtualized rendering. Every other browser viewer crashes at ~50MB. This is our technical moat and our most posh-able benchmark.
2. **Semantic diff + "compare against working sample."** Not textual diff. Detects renames, type changes, enum shifts, structural drift. This is the killer-feature seed for the paid product.
3. **AI grounded explanations + schema inference.** Paste JSON → get schema (JSON Schema / TS / Zod) + AI-cited explanations of what each field means and what looks suspicious. No free-form chat — every claim cites a JSON path.

---

## North-star metric

**Day-90 target: 10 paying teams using the paid product.**

Not signups. Not free-tool visits. Paying teams that have integrated the SDK.

Secondary metrics:
- 100k free-tool monthly visits by end of Q1
- 200 waitlist signups before paid product launch
- ≥ 5% free-tool → waitlist conversion

---

## Three-month build plan

### Month 1 — Free tool + foundation

**Goal:** ship a polished public JSON tool that earns its own traffic. Lay groundwork for the paid product.

**Stack:**
- Frontend: Vite + React + TypeScript + Tailwind
- Editor pane: Monaco
- Tree pane: custom recursive renderer + react-window for virtualization
- Hosting: Vercel or Cloudflare Pages
- Backend (minimal): Bun/Node + Postgres for shareable links, analytics, waitlist

**Free-tool features:**
- Paste / drag-drop / URL load
- Format, minify, sort keys
- **Huge-JSON handling (wedge feature).** Streaming parse (web worker + chunked parser like `@streamparser/json`) + virtualized tree rendering. Benchmark targets:
  - 50MB: instant
  - 200MB: smooth tree expand/search
  - 500MB: usable (open, navigate, search) — most competitors crash here
  - 1GB streamed: "load partial, search index" mode
- Search keys + values, click-to-copy JSON path
- Schema inference → export as JSON Schema, TypeScript, Zod
- JSON repair (wrap [`jsonrepair`](https://github.com/josdejong/jsonrepair) with great UX)
- Shareable links
- Strong "100% client-side, your JSON never leaves your browser" pitch

**Public benchmark for distribution:** post a comparison table — "Here's how we handle a 500MB JSON file vs. JSON Hero, Stack.hu, JSON Crack, JSONFormatter.org." Real numbers, real video, real link. This is our HN/Reddit launch hook.

**Infrastructure for Month 2:**
- Auth scaffold (Clerk or Auth.js)
- Analytics (Plausible + custom event tracking)
- Email capture on the free tool

**Exit criteria:**
- Public domain live
- 5 strangers have used it
- One SEO landing page indexed
- Auth + email capture working

### Month 2 — Differentiation + paid product hint

**Goal:** ship the features that justify a paid tier. Qualify paid leads.

**Free-tier additions:**
- **Semantic JSON diff** — paste two JSONs, highlight renames, type changes, enum shifts, structural changes (not just textual)
- **"Compare against working sample"** — the killer feature from the research
- **NL → jq query** — paste JSON, type a question, get the answer + the jq expression
- **"Explain this payload"** — grounded LLM that cites specific JSON paths, no free-form chat

**Paid-tier teaser:**
- "Monitor this payload over time" CTA in moments of frustration (when repair triggers, when diff shows drift)
- Waitlist with use-case capture
- Two deep-dive content posts on LLM JSON reliability

**Customer discovery (in parallel):**
- 15 conversations from the Research Plan
- 50 cold emails to YC-backed AI startups
- Launch on HN / Indie Hackers / Show HN

**Exit criteria:**
- 200 waitlist signups
- 10 "yes, I'd pay" verbal commits
- Pricing locked

### Month 3 — Paid SDK + dashboard MVP

**Goal:** ship the paid product. Land 10 paying teams.

**SDK (TypeScript first, Python second):**
- `wrap()` function: takes an LLM call + a schema, returns validated output with auto-repair attempts, intelligent retry, full logging
- Sends every call to our dashboard
- Open-source on GitHub (the SDK only — backend stays closed)

**Dashboard:**
- Org/team accounts
- Per-call log: input prompt (with redaction), output, repairs applied, validation result, latency
- Aggregate view: success rate over time, top failure modes, field-level schema conformance, drift detection
- Alerts: success rate drops below threshold, new failure mode detected

**Pricing (placeholder — confirm in P1 research):**
- Free: 1k validations/mo, 7-day retention
- Pro: $49/mo, 50k validations, 30-day retention
- Team: $199/mo, 500k validations, 90-day retention, SSO
- Enterprise: contact us

**Distribution:**
- Direct outreach to 200 waitlist signups
- HN launch + Product Hunt
- Public posts on real failure modes we see in customer data (sanitized)

**Exit criteria:**
- 10 paying customers
- $1k MRR
- One public case study / testimonial

---

## Risks (ranked by likelihood)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Native structured output kills the entry wedge | Position broader: semantic + drift + cross-version, not just "valid JSON" |
| 2 | Free tool gets traffic but nobody converts | Put paid CTAs in moments of frustration (repair triggers, drift detection), not on a marketing page |
| 3 | Langfuse/Helicone add structured-output features and out-distribute | Own the specific niche of structured-output reliability. Don't fight on prompt observability. |
| 4 | Pain is real but budgets are individual ($10–20), not team | Validate in P0 customer-discovery research before building the paid product |
| 5 | We get distracted polishing the viewer and never ship paid | Hard exit date on Month 1. Move on even if viewer isn't perfect. |
| 6 | Open-source SDK gets forked, our dashboard doesn't have moat | Keep dashboard + monitoring backend closed; SDK is the wedge, not the product |

---

## Decisions deferred (and when to make them)

| Decision | Decide by |
|---|---|
| Final name + domain | End of week 1 (after P0 research finalizes positioning) |
| Open-source split (currently: SDK open, backend closed) | End of Month 1 |
| Exact pricing | End of Month 2 (after P1 research) |
| SDK first language (TS vs Python) | Ask the 15 customer-discovery interviewees |
| Hosting (Vercel vs Cloudflare vs self) | Week 1 of Month 1 |
| Backend stack (Node/Bun + Postgres assumed) | Week 1 of Month 1 |

---

## What needs to happen this week

1. **Accept or push back on this plan.** If something here is wrong, change it now, not in week 6.
2. **Name + domain.** Pick a working domain. We can rename later but the directory and repo need a name.
3. **First three customer-discovery calls scheduled** (see Research Plan).
4. **Approve the Month 1 stack** so I can scaffold the repo.
