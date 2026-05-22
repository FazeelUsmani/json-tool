# Launch narratives (W3-Fri draft)

Two narratives pre-baked per PLAN.MD W3 — pick one when the W3-Fri benchmark + cold-email data lands. Numbers below come from real measurements as of 2026-05-21 unless flagged otherwise.

---

## Decision matrix

| If by W3-Fri… | Pick |
|---|---|
| 500MB regular JSON parses in <60s on M-series Mac, search-slow-path lands, no crashes across fixture matrix | **A-narrative** |
| 200MB regular JSON solid; 500MB only works in indexed-mode (parse OK, full search slow, expand on demand); search needs explicit "keep going" UX | **B-narrative** |
| Either + cold-email overlap <10% | Lead with B-narrative regardless of perf — wedge is shakier than performance |

Current state (updated 2026-05-22 W4-Mon, post-INP fix):

- **200MB regular JSON**: validated end-to-end. **5.6 s parse · 168 ms worst-case search-keystroke INP (under Chrome's "good" 200 ms threshold) · 262 MB heap on NDJSON / 1.16 GB on regular JSON.** Strongest demo size.
- **200MB NDJSON**: validated end-to-end on `telemetry-900000.ndjson` (201 MB). 1.30× heap expansion vs 3.35× for regular JSON — a real B-narrative selling point.
- **500MB regular JSON**: validated end-to-end on `telemetry-2250000.json` (505 MB). **13.9 s parse @ 36.4 MB/s · 560 ms worst-case search-keystroke INP (borderline poor by Lighthouse; type-to-filter works but felt as ~0.5 s feedback) · 1.69 GB heap peak / 1.16 GB steady.** Cap is 500 MB; 505 MB measured via temporary working-tree-only bump.
- **Search slow path**: shipped (commit `c3a0747`). Byte-level scan in worker, progress bar, abort on new keystroke.
- **Schema inference**: shipped W4-Mon (commits `f4a4bac` → `7efd062`). JSON Schema / TypeScript / Zod from any loaded file via Schema sub-tab.
- **Lighthouse `/large-json-viewer`**: 97 / 100 / 77 / 63 (code-side 97 + 100 pass PLAN.MD's 90+ target; infra-side 77 + 63 are deploy-time gates — CSP headers + brand-domain `Allow: /` robots cutover).

---

## A-narrative — "500MB hits"

**Headline:** "Open a 500MB JSON file in your browser. 30 seconds. No server. No upload."

**Sub:** "Built for engineers staring at telemetry exports, LLM training corpora, and database dumps that crash every other viewer."

**Why this works:** lead with the wedge claim, not the technology. Engineers who've fought 500MB JSON know the pain immediately. Browser-only is the differentiator vs. server-side tools and the "trust" pitch vs. uploading sensitive data.

### HN post (draft)

> **Show HN: A JSON viewer that opens 500MB files in your browser**
>
> I got tired of waiting for jq or VSCode to choke on telemetry exports. This one streams the file through a Web Worker, materializes only the top 2 levels of the tree, and lets you expand the rest on demand. Nothing leaves your browser — no uploads, no server.
>
> Benchmarks on an M-series Mac:
> - 200MB regular JSON: 5.6s parse, top-3-levels navigable
> - 500MB regular JSON: <30s parse, indexed search
> - 200MB NDJSON: detection auto-switches to line-paginated mode
>
> Built with @streamparser/json's Tokenizer (because JSONParser allocates the full tree in worker RAM), Comlink for the worker boundary, react-window for virtualized rendering. Source: github.com/[brand]/json-tool (link).
>
> Known limits today:
> - Search across collapsed subtrees is incremental (worker scan, abortable)
> - 1GB+ untested — architecture is streaming but I haven't pushed past 500MB
>
> Roadmap for next month: schema inference (JSON Schema / TS / Zod), `jsonrepair` for LLM output, JSONPath/jq query bar, table view for top-level arrays.
>
> Feedback wanted: what's the worst JSON file in your work life that no tool can open? Drop a description in the comments — building toward those.

### OG / preview card

- **Image:** dark-mode screenshot of the 200MB telemetry tree open, with the heap-size graph below showing it stayed under 600MB
- **Title:** "500MB JSON in your browser — no server, no upload"
- **Description:** "Streaming parser, virtualized tree, in-place expansion. Built for files that crash other viewers."

### Video script (90 seconds)

- 0:00–0:10 — "If you've ever opened a JSON file bigger than 100MB, you know this:" → cut to VSCode loading spinner / jq running for minutes / browser crash dialog
- 0:10–0:25 — "Drop a 500MB file in here." → drag the fixture, the viewer shows the placeholder, the tree pane populates in real time
- 0:25–0:45 — Demo expand on collapsed events, keyboard nav, search jumping across matches
- 0:45–0:65 — "Three things you can verify yourself: (1) zero network requests in DevTools, (2) memory stays under 1.2GB, (3) source on GitHub."
- 0:65–0:85 — "I built this because I was tired of [X]. If you've got a worse file, send it to me."
- 0:85–0:90 — URL + GitHub.

---

## B-narrative — "200MB smooth; 500MB indexed"

**Headline:** "Browse 200MB JSON like it's 2MB. 500MB indexed for jump-anywhere."

**Sub:** "Stop uploading sensitive data to viewers that crash anyway."

**Why this works:** more conservative claim, but harder to disprove. "Indexed" is a real feature with a meaningful distinction — even if the user can't search a 500MB file instantly, they can jump to any byte range and expand any subtree. "Like it's 2MB" anchors to the 200MB number, which is the *demonstrated* sweet spot, not the stretch.

### HN post (draft)

> **Show HN: A JSON viewer where 200MB files feel small**
>
> Telemetry exports, LLM training dumps, MongoDB JSON — past 50MB, every viewer I've tried either freezes my browser tab or asks me to upload the file. So I built one that does neither.
>
> The trick: stream the file through a Web Worker, materialize only the top 2 levels of the tree, leave the rest as byte-range references the user can expand on demand. Result on an M-series Mac:
> - 200MB regular JSON: 5.6s parse, scroll/expand/search feel like a 2MB file
> - 500MB regular JSON: indexed (parse OK, search runs incrementally with progress, expand any subtree on click)
> - 200MB NDJSON: auto-detected, paginated by line
>
> What "indexed" means at 500MB: you can navigate the top of the tree and expand any subtree instantly. Full-text search runs in the worker with a progress bar — you stop it when you find what you need, or let it finish.
>
> Source: github.com/[brand]/json-tool. Nothing leaves your browser.
>
> Built on: @streamparser/json (Tokenizer-level, not JSONParser), Comlink, react-window. Comments welcome on the architecture write-up linked from the README.

**Numbers backing the B-narrative claims (measured 2026-05-22, Apple Silicon M-series, Chrome 147):**

| Size | Parse | Heap | Search-keystroke INP | Notes |
|------|-------|------|----------------------|-------|
| 200 MB regular JSON | 5.6 s | 1.16 GB | **168 ms** (worst) / 24–96 ms (typical) | Below Chrome's "good" 200 ms INP threshold |
| 201 MB NDJSON       | ~0.6 s* | 262 MB | (same as above) | 1.30× heap expansion vs 3.35× for regular JSON |
| 505 MB regular JSON | 13.9 s | 1.69 GB peak / 1.16 GB steady | **560 ms** (worst) / 344–472 ms (typical) | Type-to-filter works; "needs improvement" by Chrome's INP threshold |

\* NDJSON parse log line wasn't captured in the 2026-05-22 session (HUD bug); fix shipped same day, re-measure next session. Heap + line-count + tab-survival all captured.

The "indexed at 500 MB" language is honest: tree navigation + subtree expansion are instant; type-to-filter has ~0.5 s feedback at the high end; worker progress-bar search handles content-deep queries that exceed the materialized FlatRow array.

### OG / preview card

- **Image:** side-by-side: jsonhero loading spinner forever on a 200MB file vs. our tree fully populated, both timestamped
- **Title:** "200MB JSON, like it's 2MB. Browser-only."
- **Description:** "Streaming parser, indexed navigation, no server. Built for engineers."

### Video script (90 seconds)

- Same shape as A, but explicitly demos the "search progress bar" UX on 500MB, and emphasizes "you can stop and start as you find what you need" — turning a perf limit into a feature.

---

## What to write today (W3-Fri) before picking

These need to be done either way:

- 4-route SEO content (1500 words each) — `/`, `/json-viewer`, `/large-json-viewer`, `/ndjson-viewer`. **Title/description here drives organic discovery, not narrative pick.**
- Benchmark methodology page — hardware, browser, fixture shapes, repro commands. **Same content for either narrative.**
- A11y response pre-write — top 5 expected HN comments + canned-but-thoughtful replies.

These depend on narrative pick:

- HN post body (one of A / B above, polished)
- OG card image (different screenshots)
- Video script + recording

---

## Open questions to resolve W3-Fri morning

1. **Did 500MB validate?** Run `node benchmarks/generate.mjs --shape telemetry --size 500` + drag-drop, capture parseMs. If <60s on M-series and tab stays alive → A-narrative open.
2. **Did search slow path ship?** Required for both narratives to credibly claim "search works at scale." Task #73.
3. **Cold-email overlap rate?** If <10%, the wedge framing might be wrong regardless of perf — narrative needs to pivot toward whichever persona actually responded.
4. **Brand name + domain locked?** Replace `[brand]` placeholders above with the actual chosen name before sending anywhere.

---

## Numbers as of 2026-05-21 (end of W3-Thu)

- 201MB regular JSON: parseMs 5645–5800ms, ≈34.7 MB/s (single browser run, M-series, Chrome 147)
- JS-direct (Node): 3308ms, ≈60.8 MB/s — about 1.8× faster than browser, expected gap
- Memory: 584MB RSS at flatten complete (Node measurement); browser tab peak not yet measured cleanly
- Heap during 201MB parse: never hit the per-tab ceiling (~1.5GB on typical 8GB Mac)
- Tab survived the parse → viewer-only mode prevented Monaco from blowing up on the 201MB string
- Tree render: tab stays interactive once parse completes; expand/collapse/search-jump all responsive (152ms p95 for stub expansion)
- NDJSON: 22KB fixture → instant; 43KB fixture → instant; 200MB fixture: not yet generated

**Caveat for both narratives:** the 500MB numbers above are projected from architecture, not measured. Don't ship either HN post without a clean 500MB run captured to video.
