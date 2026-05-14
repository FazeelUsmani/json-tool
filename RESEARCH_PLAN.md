# Research Plan & Log

> Two parts:
> **Part A** — research already completed (sources, findings, conclusions we're acting on).
> **Part B** — research still needed (customer validation, competitive seams, disruption risk).
> Last updated: 2026-05-14

---

# Part A — Research already completed

## Sources

We synthesized across:

1. **ChatGPT research session #1** — JSON tool market overview, competitive landscape, monetization patterns. Covered JSON Hero, JSON Crack, Stack.hu, JSON Editor Online, JSONFormatter.org, Postman/Insomnia, observability companies.
2. **ChatGPT research session #2** — 10 specific market gaps in JSON/API/AI tooling.
3. **ChatGPT research session #3** — biggest opportunities for someone with backend/AI/dev-tooling background. Pushed toward "AI-native structured data debugger."
4. **ChatGPT research session #4** — concrete limitations of each top JSON viewer + the "what would the perfect JSON viewer look like" wishlist.
5. **Direct product experience** — user's own use of jsonhero.io and jsonviewer.stack.hu as reference products.
6. **Synthesis pass** — categorizing findings, mapping gaps to plan, identifying convergent vs divergent signals.

## Convergent conclusion (the answer all sources agreed on)

> The biggest underbuilt category in this space is **"operational intelligence for structured data"** — not viewing JSON.

LLM JSON reliability is the hottest urgency *today*. The broader category includes API payload drift, schema evolution, and multi-system payload correlation. The free JSON tool is the wedge / acquisition channel; the paid product is reliability + observability SaaS for AI and integration teams.

## Competitive landscape (what we know exists)

### Direct comparables (web-based JSON tools)

| Tool | Strengths | Weaknesses we exploit |
|---|---|---|
| **JSON Hero** (jsonhero.io) | Beautiful UI, schema/column/tree views, smart previews, OSS, by Trigger.dev | Crashes on 50–500MB files. Weak editing. No AI understanding. "Too modern" for quick debugging. |
| **JSON Viewer Stack.hu** | Fast, lightweight, simple, long-trusted | Outdated UI. No diff / AI / schema gen / collab. Lags on large files. Increasing ads. |
| **JSON Crack** (jsoncrack.com) | Viral graph visualization | Graphs unusable for huge/deep JSON. GPU heavy. Pivoted to ToDiagram because viz alone wasn't a business. |
| **JSON Editor Online** | Powerful editor, dual-pane, diff | Cluttered UI, freezes on large files, intimidating for beginners. |
| **JSONFormatter.org** | High SEO traffic, simple utility | Toolbox feel, no platform/semantic layer, struggles with big files. |
| **Dadroit (native desktop)** | Handles huge files via native parser, SIMD, virtualized rendering | Desktop-only, not shareable, no web/team workflows. |

### Adjacent paid players (the real-revenue reference class)

| Category | Examples | What we learn |
|---|---|---|
| LLM observability | Langfuse, Helicone, Arize, Braintrust | Real B2B revenue. Focused on prompts/traces, not structured-output reliability specifically. Our wedge. |
| LLM structured output libs | Instructor (Python), Outlines, Guidance, llguidance | Solve constrained generation. Open source. Don't solve operational monitoring / drift. |
| JSON repair | `jsonrepair` (JS library) | Excellent OSS lib. We wrap it with UX + telemetry. |
| Webhook infra | Hookdeck, Svix | Own delivery problem, not the *drift / understanding* problem. |
| API platforms | Postman, Insomnia, Bruno | Massive incumbents. Don't compete head-on. |
| Observability | Datadog, Splunk, Elastic, New Relic | Care about JSON logs at scale. Adjacent, not competitive. |
| Model-layer | OpenAI Structured Outputs, Anthropic strict tool use | Kill *syntactic* failures. Don't kill *semantic* / drift / RCA failures. **Disruption risk to validate in Part B.** |

## Market gaps identified

From the 10-gap analysis, ranked by relevance to our plan:

| Gap | Relevance | How we address |
|---|---|---|
| LLM structured output reliability | Core — entry wedge | Month 3 paid SDK + dashboard |
| Massive / streaming JSON inspection | Differentiator #1 | Month 1 huge-JSON handling |
| Semantic JSON debugging | Differentiator #2 | Month 2 semantic diff + "compare against working sample" |
| Schema drift intelligence | Adjacent business expansion | Month 3+ |
| AI-native API observability | Long-term company direction | Year 2 |
| NL querying for structured data | Free-tool feature | Month 2 NL → jq |
| AI-powered RCA | Long-term paid product | Month 3+ |
| API contract intelligence | Out of scope | Skip |
| AI-native debugging UX | Cross-cutting | Reflected in differentiator #3 (grounded AI) |
| Multi-system payload correlation | Long-term moat | Design data model in Month 3 to enable this later |

## Business-model insights (why most JSON tools don't make money)

- "Developers love JSON tooling but rarely pay for viewing JSON." Confirmed across multiple sources.
- Successful JSON tools historically take one of three paths:
  1. **Free utility + ads/SEO** — Stack.hu, JSONFormatter.org. Modest income.
  2. **OSS flagship for brand** — JSON Hero (Trigger.dev's brand asset). Doesn't monetize directly.
  3. **Adjacent paid business** — JSON Editor Online (modest paid tier), Postman (huge), Datadog (huge). Our path.
- JSON Crack pivoted to ToDiagram for a reason — graph viz alone wasn't durable.
- Enterprise pays for: outage reduction, faster debugging, schema governance, compliance — **not** for pretty trees.

## What we ruled out and why

| Direction | Why ruled out |
|---|---|
| Pure JSON viewer business | No willingness to pay, saturated |
| Generic graph visualization | JSON Crack already maxed this; not durable |
| Full API platform | Postman/Insomnia own the space |
| "Chat with your JSON" as main feature | Low pull, easy to replicate with raw ChatGPT |
| Mobile-first | Nobody pastes JSON on a phone |
| Native desktop (this quarter) | Splits focus from web; revisit Year 2 |
| Real-time collaboration | Huge surface, low pull until paying teams ask |
| VSCode extension (Month 1) | Distribution channel for later, not a starting product |

## What we committed to (based on this research)

1. **Direction:** Reliability + observability for structured data. LLM wedge, broader category long-term.
2. **Free tool tagline:** "The JSON tool that handles files everyone else crashes on — and helps you understand them with AI."
3. **Three core differentiators:** huge-JSON handling, semantic diff + compare-to-sample, AI grounded explanations + schema inference.
4. **Business model:** free tool = acquisition; paid SDK + dashboard = revenue.
5. **North star:** 10 paying teams in 90 days.
6. **Open-source split:** SDK open, dashboard/backend closed (Posthog/Langfuse model).

## Stop researching, start building

Four converging research sources is enough. The remaining unknowns are not answerable by more desk research — they require **talking to customers** and **building the product**. That's Part B.

---

# Part B — Research still needed

> Purpose: validate the four assumptions that could still break the plan.
> Timebox: **2 weeks**, in parallel with Month 1 build. Research must not delay shipping.

## Why we're doing more research

We already have strong signal that "operational intelligence for structured data" is a real gap. But four assumptions could still break the plan, and they need validation from real humans, not more market analysis:

1. **Demand** — Will AI/integration teams actually pay for this?
2. **Competitive seams** — Where exactly do we wedge between Langfuse, Helicone, Arize, Instructor, jsonrepair, and native structured output?
3. **Disruption risk** — How much of the LLM JSON problem will be solved by native structured output in 12 months?
4. **Conversion path** — Does a free JSON tool actually convert to paid SaaS, or are they two unrelated funnels?

What we're **not** doing more of: reading more market-analysis ChatGPT outputs. We've seen four converging sources. More analysis won't change the answer — only customer conversations will.

---

## Questions, prioritized

### P0 — must answer before Month 2

#### Q1. Customer pain validation (15 conversations)

**Who:**
- 10 engineers shipping LLM-powered features in production (founders, IC engineers at AI startups, AI engineers at non-AI-first companies)
- 5 integration engineers (third-party API work — fintech, e-commerce, SaaS integrations)

**Script (~20 min each):**
1. Walk me through the last time an LLM or third-party API output broke something in production. What did you do? How long did it take to debug?
2. What do you do today when a vendor changes a payload shape without warning?
3. Show me your current monitoring for structured outputs. What's missing? What do you log? What do you alert on?
4. If a tool did [paid product description in one sentence], what would your team pay per month? Who would be the buyer?
5. Are you using Langfuse / Helicone / Arize / Braintrust / Instructor? What do you like? What's missing?

**Decision rules (be honest with ourselves):**
| Result | Decision |
|---|---|
| < 8 / 15 say "yes this is real pain" | Re-evaluate direction |
| < 3 / 15 would pay anything | Re-evaluate monetization (maybe ads/sponsorship instead of SaaS) |
| > 12 / 15 already use Langfuse/etc and are happy | Re-evaluate wedge — find a sharper one |
| > 10 / 15 say semantic drift / cross-version comparison would matter | Lock the "compare against working sample" feature as the killer |

**Where to find them:**
- AI engineer Discord/Slack: LangChain community, OpenAI Discord, vector DB communities, MLOps Slack
- Twitter/X DMs to founders of AI products (look at recent launches)
- Indie Hackers AI tag
- Cold email to recent YC batches (look for AI startups)
- Reddit: r/LocalLLaMA, r/MachineLearning, r/LangChain
- Personal network: anyone we know building with LLMs

#### Q2. Competitive deep dive

For each competitor:
1. **Langfuse** (LLM observability, OSS)
2. **Helicone** (LLM observability)
3. **Arize Phoenix** (ML/LLM observability)
4. **Braintrust** (LLM evals + observability)
5. **Instructor** (Python lib — LLM structured output)
6. **jsonrepair** (JS library — JSON repair)
7. **OpenAI Structured Outputs** (`response_format: json_schema`)
8. **Anthropic strict tool use**
9. **Outlines / Guidance / llguidance** (constrained decoding)

For each, document:
- Exact feature set (what specifically they do for structured outputs)
- Pricing (free tier shape, entry paid, top tier)
- Customer reviews (G2, Reddit, Twitter, HN)
- What they explicitly **don't** do
- The seam where we wedge in

**Deliverable:** `competitive_matrix.md` — one big table.

#### Q3. Disruption risk: native structured output

How much of the "malformed LLM JSON" problem is already solved by:
- OpenAI `response_format: json_schema` (strict mode)
- Anthropic tool use with strict schemas
- Gemini structured output
- Outlines / Guidance / llguidance (constrained decoding)

**The specific question we need answered:**
If a customer uses GPT-4o with strict JSON schema mode, what failure modes remain that our product solves?

**Hypothesis to test:**
Native structured output kills *syntactic* failures (malformed JSON, missing required fields, wrong types). It does NOT kill:
- Semantic failures (wrong enum value that's *valid* under the schema but *wrong* in context)
- Cross-version drift (today's output is valid; yesterday's was too; but they're shaped differently)
- Business-logic anomalies (the JSON is valid but the values are nonsense)
- Production failure root-causing (why did 0.4% of outputs break this hour?)

**Validation method:**
- Try GPT-4o strict mode on 5 real-world schemas, induce failures, see what slips through
- Read every recent OpenAI/Anthropic structured output post-mortem we can find
- Ask 3 of the customer-discovery interviewees specifically about this

**If the hypothesis fails** (i.e., native structured output really does solve most of it): pivot the wedge toward the API-payload-drift angle, where there's no model-level solution.

---

### P1 — answer during Month 1 build (don't block)

#### Q4. Distribution & SEO research

Pull data from SimilarWeb / SEMrush / Ahrefs for:
- jsonformatter.org
- jsonviewer.stack.hu
- jsonhero.io
- jsoncrack.com
- jsoneditoronline.org

For each:
- Monthly traffic
- Top organic keywords
- Geographic mix
- Bounce rate / session length

**What we want to learn:** which queries drive most of this market's traffic (likely "json formatter", "json viewer online", "json beautify", "json validator"). These dictate which SEO landing pages we build first.

**Deliverable:** `seo_landscape.md` — top 20 keywords + which competitors rank for each.

#### Q5. Pricing benchmarks

Pull pricing from:
- AI observability: Langfuse, Helicone, Arize, Braintrust
- Webhook infra: Hookdeck, Svix
- API tools: Postman, Insomnia (for reference, not direct comp)
- AI tooling adjacent: Vercel AI SDK pricing (free), Helicone, LangSmith

**Deliverable:** `pricing_matrix.md` — table with free tier, entry paid, mid tier, enterprise.

---

### P2 — answer before launching paid (Month 3)

#### Q6. Open source vs closed source

JSON Hero is open source. Did that help or hurt them?
PostHog, Langfuse, Supabase are all OSS-core with paid hosted — does this model work for our shape?

**Decision factors:**
- OSS = brand strength, contributors, harder direct monetization
- Closed = cleaner SaaS path, weaker community

**Working hypothesis:** open-source the SDK (the integration surface developers touch); keep the dashboard + monitoring backend closed. Mirror the Posthog / Langfuse / Sentry split.

#### Q7. Name + domain

Generate name candidates *after* P0 research locks the positioning. Candidates need:
- `.com` domain available (or `.dev` / `.ai` as fallback)
- GitHub org name available
- Twitter / X handle available
- Doesn't conflict with existing trademark

---

## How we do the research

- **Customer calls run in parallel with Month 1 build.** Not before. Building informs the questions.
- **1 call per day max.** Quality > quantity. Take notes, tag pain points.
- **Single `customer_notes.md`** across all calls — not separate files. Easier to scan for patterns.
- **Record calls (with permission).** Memory will fail us in week 6.
- **Outreach in batches of 10.** Send 10 cold messages → see who replies → iterate the message.

---

## Anti-patterns to avoid

- Reading more market analysis instead of talking to humans (we've already converged — three sources agree)
- Designing the product more before validating demand
- Building features for Month 1 that we *hope* matter — let customer calls inform Month 2 priorities
- Benchmarking against Postman / Datadog (wrong reference class — they're 1000-person companies, not our shape)
- Letting research delay shipping the free tool

---

## Exit criteria for the research

By end of week 2:
- 15 customer conversations done, notes synthesized
- Competitive matrix done
- Disruption risk hypothesis tested
- Decision: continue as planned / pivot wedge / pivot direction

If we hit the "pivot wedge" branch: project plan gets revised, but Month 1 free-tool build is still useful for any version of the product.

If we hit the "pivot direction" branch: stop, regroup, re-plan. This is what research is for — better to find out in week 2 than month 3.
