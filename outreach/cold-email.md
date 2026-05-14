# Cold email — SDK conversion experiment

**Goal:** validate whether the *paid* pain (production reliability for LLM structured outputs) is real and budget-worthy — *independent* of whether free-tool users convert.

**Audience:** founders / engineering leads at recent YC AI startups (W24, S24, F24, W25, S25 batches). 50 messages total over the next 2 weeks.

**Ask:** 20-min call. *Not* a product demo. A research conversation about their structured-output pain in production.

---

## Primary subject line

> **How is `{Company}` handling LLM JSON drift in production?**

## Alt subject (A/B against the primary in batches of 10)

> **20 min: structured-output reliability — your team's workflow?**

## Body

```
Hey {Name} —

Saw {Company} is shipping {specific recent launch}. Quick Q.

When the AI returns JSON that parses fine and matches your schema, but
the *values* are still wrong — `priority: "urgent-high-critical"`
instead of one of your three enums, or a field quietly reshapes between
prompt versions and breaks downstream — how does your team deal with it
today? Retry loops, manual review, custom validators, something else?

Doing 20-min calls to understand how teams handle this in practice.
Just trying to make sure I'd be solving real pain. Curious what
patterns you've seen.

Got 20 min this week or next?

— {Your name}
{credibility: keep it lightweight. e.g. "been building backend infra a
while and keep running into this." NOT "next-gen AI reliability infra."}
```

---

## Why this voice

- **Subject names a specific operational pain** (not "AI tooling" or "viewer"). Engineers open emails that look like another engineer's problem, not a vendor's pitch.
- **Concrete example up front.** The user-direction made this explicit and it's right: vague "structured output failures" gets vague answers. `priority: "urgent-high-critical"` is the kind of bug an LLM-shipping engineer has seen, instantly.
- **"Research question" framing, not "would you pay" framing.** We're asking for *experience*, not opinions. Opinions are cheap; experience is signal.
- **Reciprocity built in** ("happy to share what I'm seeing from other teams"). Founders trade information; that's the conversational currency. Without this, the cold email is asking and giving nothing.
- **No product name, no link, no calendar embed, no marketing landing.** The moment those appear, the email becomes a pitch. Pitches get filed under "vendors" and ignored.
- **Out clause at the end** ("no worries if not relevant"). Lowers pressure, raises response rate. Counter-intuitive but consistent across cold-outreach research.

---

## Per-message personalization (non-negotiable — generic = junk filter)

Before sending each one, fill in:

- [ ] `{Name}` — first name, never "team" or "founder"
- [ ] `{Company}` — exact casing
- [ ] `{specific recent launch / feature / batch}` — *one sentence* that proves you read their product. Examples: "the agent-based pipeline you launched in October," "the move from Claude 3.5 to Sonnet 4." If you can't write this in one sentence, skip this lead.
- [ ] `{Your name}` + 1-line credibility

If three of those four can't be filled, don't send. A blank or generic merge field is worse than not emailing.

---

## What we're measuring

| Signal | Target | Decision rule |
|---|---|---|
| Reply rate | ≥ 5% (2.5 of 50) | <5% = the message isn't landing; rewrite or pick wrong list |
| "Yes I'd take a call" rate | ≥ 4% (2 of 50) | <2 of 50 = real demand signal is weak — escalate as wedge risk |
| "Yes this is a real problem, not buying yet" | n/a | Track quotes — useful for landing-page copy regardless |
| "We already use X (Langfuse/Helicone/Instructor)" | n/a | Track which — tells us the competitive cluster |

**Decision** (per PLAN.MD Parallel Ops): if <5% reply or <2/10 "would pay," wedge needs a rethink in W2, not M3.

---

## Send mechanics (kept light intentionally)

- **Plain text, no HTML, no signature image.** Looks like a real person typed it.
- **Send from a real personal address** (not `hi@company.com`). Personal addresses get past spam filters that bulk addresses don't.
- **No tracking pixels.** Engineers spot them; trust drops.
- **Batches of 10**, 24 hours between batches. Lets you adjust subject / opener based on early replies.
- **Track responses in `outreach/log.md`** (one row per send: date, name, company, batch, response).
