# Outreach log

One row per outreach attempt. Updated as replies come in.

**Why this file matters:** by Week 3 you'll start seeing patterns — certain pains repeat, certain wording gets replies, certain segments care more. That's the actual product-market-fit signal, not the technical wedge.

---

## Cold email batch (recent-YC AI founders, target: 50)

| # | Date | Contact | Company / segment | Subject variant | Status | Pain mentioned | Call booked? | "Would pay"? | Notes |
|--:|------|---------|---|---|---|---|--:|--:|-------|
| 1 |      |         |   | A or B |   |   |   |   |       |
| 2 |      |         |   |        |   |   |   |   |       |
| 3 |      |         |   |        |   |   |   |   |       |

**Status values:** `queued` / `sent` / `replied-positive` / `replied-pass` / `bounced` / `no-reply-7d` / `call-scheduled` / `call-done`

---

## Customer-call DM batch (network, target: 5 booked calls)

| # | Date | Contact | Channel | How connected | Status | Notes |
|--:|------|---------|---------|---|---|---|
| 1 |      |         | Twitter / LinkedIn |   |   |       |
| 2 |      |         |        |   |   |       |
| 3 |      |         |        |   |   |       |

---

## Pattern tracker (fill in as data accumulates)

Once you have 10+ responses across both channels, start filling these. They convert into landing-page copy + Month 2 priorities.

### Pains mentioned more than once

- *(quote / paraphrase)* — mentioned by N teams
- *(quote / paraphrase)* — mentioned by N teams

### Words people actually use

Their phrasing, not yours. Drop these into the landing page hero / OG image / HN post copy.

- *e.g. "our pipeline keeps shitting itself"*
- *e.g. "we manually patch schemas every Tuesday"*
- *e.g. "the validator burns CPU and still misses things"*

### Tools they already use (and what's missing)

| Tool | Mentioned by | What they like | What's missing |
|---|---|---|---|
| Langfuse |   |   |   |
| Helicone |   |   |   |
| Arize Phoenix |   |   |   |
| Braintrust |   |   |   |
| Instructor |   |   |   |
| `jsonrepair` |   |   |   |
| Custom internal |   |   |   |

### Buyer profile (per call — converges by call 3–4)

- Title that holds the budget: ___
- Buying trigger (incident, feature ask, OKR): ___
- Price ceiling per seat / team / event: ___
- Procurement friction (security review, SSO requirement, etc.): ___

---

## Decision rules (from PLAN.MD Parallel Ops)

Update which branch we're on after each batch:

- **Cold email reply rate < 5%** → message isn't landing OR wrong list. Rewrite subject + opening. Don't escalate yet.
- **Cold email reply rate ≥ 5% but "would pay" < 2/50** → demand soft. Wedge needs a sharper test.
- **Calls: < 4 of 5 say "yes this is real pain"** → re-evaluate the wedge direction (not just the message).
- **Calls: > 3 of 5 mention semantic drift / cross-version unprompted** → lock "compare against working sample" as the killer feature for Month 2.
- **Calls: > 3 of 5 already happy with Langfuse / Helicone** → need a sharper wedge between us and them; not a closeable competitor.
