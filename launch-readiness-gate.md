# Launch Readiness Gate

Distinct from `PLAN.MD`'s "build verification" — that's "what we set out to build." This is "what blocks shipping to the public domain on the brand URL."

Sources:
- `ENGINEERING_ASSESSMENT.md` (Mahira, 2026-05-22) — top-10 red flags + scoring
- This session's audit re-verification (2026-05-22 evening) — independently confirmed Mahira's `dompurify` finding
- Existing `PLAN.MD` Month-1 verification list

Last updated: **2026-05-22**.

---

## Hard blockers — must fix before public URL goes live

These are correctness / claim-alignment items that would either (a) break for real-world users, (b) make public claims false, or (c) embarrass the project on technical review (HN comments).

### Architecture / correctness

- [ ] **Internal path-IDs collision** — `parse-streaming.ts` / `parse.ts` build identity as `${path}.${key}`. Real-world keys containing `.`, `[`, `]`, or duplicate keys produce ID collisions → breaks collapse state, focus restoration, drawer restoration, search match indices, and splice targeting. Fix: switch internal identity to JSON Pointer or generated node IDs; display JSONPath separately. **~4-6 hours.** (Mahira §2 weakness 2, Red Flag #5)

- [ ] **`?url=` streaming gap** — `fetchUrl.ts` uses `response.text()`; full string materialized on main thread. 500 MB URL load is *claimed* (since the 2026-05-22 cap bump) but architecturally not supported. Either (a) implement `response.body.getReader()` with byte-cap during stream → Blob → route through worker, or (b) revert cap to a realistic number and adjust hero copy. **~3-4 hours for (a).** (Mahira §2 weakness 1, Red Flag #2; this session's own diagnostic miss)

- [ ] **`?url=` security hardening** — current `fetch(url)` does not set `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, or restrict protocols. Userinfo URLs not rejected. Fix bundled with the streaming refactor above. (Mahira §5 weakness 3-4)

### Privacy / claim alignment

- [x] **"100% client-side" badge over-claimed against Plausible** — badge text was rephrased to "Your JSON stays local" + tooltip now discloses Plausible analytics explicitly (2026-05-22 evening). Honest about what's local (the JSON content) without claiming the page itself is third-party-script-free. (Mahira §5 weakness 1, Red Flag #4)

### Process / production discipline

- [ ] **No CI gate** — direct-to-main with no `npm ci && typecheck && lint && test && build` enforcement. Test suite is locally green (335/336 passing) but no automated gate. Fix: GitHub Actions workflow with the standard pipeline. **~2-4 hours including iteration.** (Mahira §1 Red Flag, Top 10 #1)

- [ ] **Node version pin** — `.nvmrc` says `20` (loose); Vite needs `^20.19.0 || >=22.12.0`. Pin to `20.19.x` + add `engines.node` + `packageManager` field in `package.json`. **~15 minutes.** (Mahira §6 weakness 4)

### Dependencies

- [ ] **`dompurify` moderate vulnerabilities (transitive via Monaco)** — re-verified 2026-05-22 evening via `npm audit`: 8 advisories, all moderate severity (XSS, prototype pollution, template bypass). `npm audit fix --force` downgrades Monaco to 0.53.0 which is a breaking change. Plan: upgrade Monaco in a separate slice with browser smoke tests (JSON editing, diff editor in RepairDialog). **~2-4 hours including testing.** (Mahira §5 Red Flag, Top 10 #N/A but explicit finding)

---

## Soft blockers — should fix, can ship without if scoped honestly

### Content / SEO

- [ ] **SEO landing route copy** — `/json-viewer`, `/large-json-viewer`, `/ndjson-viewer`, `/json-repair` are currently bare-bones text + one CTA. PLAN.MD targets ~1,500 words each. Brand-coupled for tone. **~4-6 hours.**
- [ ] **README rewrite** — currently default Vite boilerplate. Replace with real setup / verify / benchmark / deploy / troubleshooting docs. Align npm/pnpm references. **~1-2 hours.** (Mahira §6 weakness 5, Top 10 #7)
- [ ] **Sitemap.xml + robots.txt `Allow: /` flip** — both gated on brand domain landing. (Mahira §6 weakness 6, Top 10 #8)
- [ ] **Unique `<title>` / `<meta>` / `<h1>` per route** — currently identical-ish across the SEO routes.

### Tests

- [ ] **Playwright e2e smoke** — drop small JSON, viewer-only large file, search, stub expand, repair, schema, table, SEO routes. No e2e currently. **~4-6 hours.** (Mahira §4 weakness 3, Top 10 #2)
- [ ] **Component-level tests** — TablePane, SchemaPane, EmptyStateHero, RepairDialog, MemoryHud, useDebugFlag currently have zero React-side test coverage. Logic tests (parser/tree/schema/sort/columns) are excellent; UI is uncovered. **~half day** for the core flows.
- [ ] **Worker boundary tests** — Comlink, abort, supersede, search batches, worker failure paths. (Mahira §4 weakness 4)

### Security headers

- [ ] **CSP tighten + HSTS + COOP + XFO + Trusted Types** — `public/_headers` exists but is minimal. Lighthouse Best Practices 77 → ~95 expected after this. Deploy-config, not code. **~1-2 hours including verification.** (Mahira §5 weakness 5-6)
- [ ] **CSP reporting endpoint** — for post-launch monitoring of XSS attempts.

### Customer / validation

- [ ] **Customer calls ≥3** with documented notes
- [ ] **Cold-email persona-overlap data** (reply rate, overlap rate, qualitative quotes)
- [ ] **Native-structured-output disruption test** (5 schemas in GPT-4o strict mode)
- [ ] **5 stranger feedback sessions** with bug capture
- [ ] **A11y response pre-written** for HN comments

---

## Polish — can ship without; flag for M2 / post-launch

### Architecture cleanup

- [ ] **Schema worker `root: TreeNode` structured-clone elimination** — currently clones ~225MB at 200MB JSON / ~6s extrapolated at 505MB on every Schema-tab Refresh. Document already in `schema.worker.ts` + `methodology.md`. M2 fix routes inference through the parser worker (which already holds the tree). (Mahira §2 weakness, this session's deferred item)
- [ ] **`viewStore.ts` split** into `viewState` + `parserSession` — explicit "tipping point" note in the file itself.
- [ ] **TreeView orchestration extraction** — parse dispatch, NDJSON detection, search orchestration, keyboard wiring all in one 500-line file.
- [ ] **NDJSON indexing in worker** — currently main-thread (~200ms allocation + ~100ms scan on 200MB). Acceptable today; worker offload deferred.
- [ ] **Large-file splits**: TreeNode (566), parse-streaming (538), TreeView (501), TablePane (478). (Mahira §2 weakness, §3 weakness 1)

### Code-reuse cleanup

- [ ] **`useDarkClass` extraction** — duplicated in MonacoPane + RepairDialog (3 sites total). (Mahira §3 weakness 2)
- [ ] **`formatBytes` consolidation** — 3 implementations (samples, MonacoPane, EditorToolbar). (Mahira §3 weakness)
- [ ] **`makeAbortError` + `isAbortError` dedup** between parserHost / schemaHost.
- [ ] **`isLazyNode` type guard** for stub-kind triple-check (5+ sites).
- [ ] **`treeNodeToValue` triplication** (useRowMaterialization + TablePane + infer.ts walkValue).
- [ ] **`schemaHost.ts` terminate-on-every-call** — should only terminate when in-flight.
- [ ] **`TablePane` no-op outer wrapper** — TablePane just passes props to TableBody.
- [ ] **`sort.ts` JSON.stringify in comparator** — 10× speedup possible via pre-stringify pass.
- [ ] **Comment density audit on schema slices** (~40% comments, judgment-heavy).

### Telemetry / logging

- [ ] **Production console logs** — `[parser] parseFile` / `[parser] setFlat` / `[worker] setFlat stored` etc. should be gated by `?debug=1` or a build flag. Currently always-on. (Mahira §3 weakness 4)

### Deferred features

- [ ] **JSONPath / jq query bar** — design locked (this session); implementation ~6 hours.
- [ ] **Cohesive UI direction** — palette + tokens + icons across all surfaces. Brand-coupled.
- [ ] **Tree token syntax highlighting** — brand-agnostic, ~45 min.
- [ ] **Plausible event wiring** — page views, parse-success, parse-error, repair-used, large-file-loaded-{50,200,500}, ndjson-loaded, query-run, share-created.
- [ ] **Share links + email capture** — W4-Thu work; brand-blocked.

---

## Sign-off checklist before public launch

Once hard blockers are closed and the brand domain is live, run this checklist on the production URL (not localhost) before flipping the repo public + posting on HN:

- [ ] All hard blockers ✓
- [ ] `npm ci && npm run build && npm test` green from a fresh clone on Node 20.19+
- [ ] `npm audit` clean (or accept-and-document for any remaining)
- [ ] Lighthouse 90+ on all 4 SEO routes (currently 95-97 Perf on three routes; `/json-viewer` still untested)
- [ ] Cold-load 200 MB JSON works on the production URL (not just localhost)
- [ ] `?url=` load works with the new streaming path at 200 MB (or scoped-back claim)
- [ ] Privacy / analytics disclosure visible in the badge tooltip + CSP page
- [ ] A11y response pre-drafted in case HN engages
- [ ] 5 stranger feedback sessions completed
- [ ] Customer-call notes confirm the wedge resonates
- [ ] Repo flipped public

---

## What this document is NOT

- **Not the build verification list.** That's PLAN.MD lines 411-469.
- **Not a roadmap.** This is one-shot pre-launch.
- **Not a post-mortem template.** Use a separate doc after launch.
