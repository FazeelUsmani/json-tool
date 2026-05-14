# Customer-call DM — discovery interviews

**Goal:** learn *workflows and operational pain*, not validate willingness to pay. This is the conversation that surfaces the language users actually use, the tools they've tried, and the failure modes that matter.

**Audience:** engineers shipping LLM-powered features in production. One-degree connections in your network or via Twitter/LinkedIn. 5 calls total in W2–W3 (Tue/Thu afternoons per PLAN.MD).

**Ask:** 20-min call. Lightweight, low-pressure, engineer-to-engineer.

**Difference from `cold-email.md`:** that one tests *demand*. This one tests *understanding*. Different audience (network vs. strangers), different ask (workflow shop-talk vs. paid-pain validation), different voice (curious peer vs. founder doing research).

---

## Twitter DM version

```
Hey {Name} —

Engineer-to-engineer Q. When an AI response is valid JSON but the
values are still wrong — drifted enum, field reshaped between prompt
versions — what does your team actually do? Retry, manual fix,
custom check?

Trying to learn how teams handle this in practice. 20 min call sometime
in the next 2 weeks?

— {Your name}
```

## LinkedIn DM version

Slightly more formal — LinkedIn convention favors a brief context line.

```
Hi {Name} —

We connected via {mutual / company / event}. Quick research Q: when
your team gets AI responses that are technically valid JSON but the
values are wrong (drifted enum, reshaped field, etc.), what's the
actual debugging workflow?

Trying to understand how teams handle this in practice. 20 min call in
the next 2 weeks?

— {Your name}
```

---

## Why this voice

- **"Engineer-to-engineer"** sets the frame. You're not selling; you're asking shop-talk. Engineers respond to this when they wouldn't respond to a vendor.
- **Same concrete example as cold-email** (drifted enum / reshaped field). Re-using the example across both channels makes you sound consistent, which matters when one person mentions you to another.
- **"Promise no sales pitch"** — explicit because DMs are pitched constantly. The line directly addresses the silent objection ("is this guy going to pitch me?"). It lowers reply friction more than any other word in the message.
- **"In the next 2 weeks"** — a window, not a specific time. Avoids the back-and-forth "what time works for you" loop. They reply, then *they* propose a time.
- **No link, no calendar, no product mention.** Same rule as the cold email. The moment a calendly link appears, this becomes outreach instead of a conversation.

---

## Per-DM personalization

- [ ] `{Name}` — first name from their profile
- [ ] `{Your name}` at the end
- [ ] (LinkedIn only) `{mutual / company / event}` — *real* shared context. If none, don't use the LinkedIn version; default to Twitter or skip.

---

## On the call itself (20 min, follow this loop)

Asking experience, not opinions. Per the strategy note: experience = signal, opinions = noise.

1. **(5 min) Walk me through the last time an LLM structured output broke something in production.** What happened, how long to debug, how did you find the root cause? Get specifics.
2. **(3 min) When a vendor API or LLM changes payload shape without warning — what's your team's actual workflow?** Tests, alerts, log review, gut feeling?
3. **(3 min) Show me (screen-share if possible) how you currently monitor or validate structured outputs.** Watch the workflow. What do they log? What do they alert on?
4. **(3 min) Are you using Langfuse / Helicone / Arize / Braintrust / Instructor / `jsonrepair`?** What do you like, what's missing?
5. **(3 min) If a tool let you {paid-product one-liner — refine after first 2 calls}, who on your team would be the buyer and roughly what's the budget zone?** Per-seat or per-event monitoring? Annual or monthly?
6. **(3 min) Open: what else have I not asked that I should be asking?**

Record (with permission). Transcribe. Tag pain quotes for the landing page.

---

## What we're measuring (per PLAN.MD decision rules)

| Pattern across the 5 calls | Decision |
|---|---|
| < 4 of 5 say "yes this is real pain" | Re-evaluate the wedge |
| < 2 of 5 indicate any budget for this | Re-evaluate monetization (ads/sponsorship, not SaaS?) |
| > 3 of 5 already happy with Langfuse / Helicone / etc. | Need a sharper wedge between us and them |
| > 3 of 5 mention semantic drift or cross-version comparison unprompted | Lock "compare against working sample" as the killer feature |

---

## Notes go in one file

Single `outreach/customer-notes.md` across all 5 calls. Not 5 separate files. Easier to scan for recurring quotes and contradictions. One section per call, dated, with the recording link.
