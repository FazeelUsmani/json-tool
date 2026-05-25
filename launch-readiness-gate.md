# Launch Readiness Gate

Distinct from `PLAN.MD`'s "build verification" — that's "what we set out to build." This is "what blocks shipping to the public domain on the brand URL."

Sources:
- `ENGINEERING_ASSESSMENT.md` (2026-05-22) — top-10 red flags + scoring
- This session's audit re-verification (2026-05-22 evening) — independently confirmed the dompurify finding
- Existing `PLAN.MD` Month-1 verification list

Last updated: **2026-05-25**.

---

## Hard blockers — must fix before public URL goes live

These are correctness / claim-alignment items that would either (a) break for real-world users, (b) make public claims false, or (c) embarrass the project on technical review (HN comments).

### Architecture / correctness

- [ ] **Internal path-IDs collision** — `parse-streaming.ts` / `parse.ts` build identity as `${path}.${key}`. Real-world keys containing `.`, `[`, `]`, or duplicate keys produce ID collisions → breaks collapse state, focus restoration, drawer restoration, search match indices, and splice targeting. Fix: switch internal identity to JSON Pointer or generated node IDs; display JSONPath separately. **~4-6 hours.** (2026-05-22 review §2 weakness 2, Red Flag #5)

- [x] **`?url=` streaming gap** — closed 2026-05-25 (commit `a08133c`). `fetchUrl` now streams `response.body.getReader()` and enforces `maxBytes` during read; on overflow it cancels the reader and returns `too-large`. Returns a `Blob` so the parser worker reads via `blob.stream()` end-to-end without main-thread string materialization. `EditorToolbar` mirrors file-drop dispatch (under `VIEWER_ONLY_THRESHOLD` decodes for Monaco + carries the Blob; over threshold goes viewer-only). (2026-05-22 review §2 weakness 1, Red Flag #2; this session's own diagnostic miss)

- [x] **`?url=` security hardening** — closed 2026-05-25 (commit `a08133c`). `fetch(url)` now sets `credentials: 'omit'` + `referrerPolicy: 'no-referrer'`; URL parsing rejects non-`http:`/`https:` protocols and any URL carrying userinfo. New error kinds `invalid-protocol` + `userinfo-not-allowed` surfaced through the editor's error pill. (2026-05-22 review §5 weakness 3-4)

- [x] **`?url=` auto-fetch leak** — closed 2026-05-25. Two-part fix:
  - **No auto-fetch (slice 3.5):** `?url=` is now a pre-fill convenience, not an auto-load command — the user clicks Load to fire the fetch, so destination servers receive a request only on explicit intent.
  - **Synchronous strip before Plausible (commit `ddbfeef`):** the param-strip lives in an inline `<head>` script that runs during HTML parse, **before** the deferred Plausible script queues. (The initial slice-3.5 React-useEffect strip ran too late — Plausible's auto-pageview captured `window.location.href` before React mounted, leaking the param to analytics. Caught during the post-slice-4 review.) The original `?url=` value is stashed on `document.documentElement.dataset.pendingUrl` for `EditorToolbar` to read on mount for the input pre-fill.
  - Closes the "auto-load can leak signed/tokenized URLs to browser history, DOM display, analytics, referrer" finding. (2026-05-22 review §5 weakness 2, Action Item §5 #3)

### Privacy / claim alignment

- [x] **"100% client-side" badge over-claimed against Plausible** — badge text was rephrased to "Your JSON stays local" + tooltip now discloses Plausible analytics explicitly (2026-05-22 evening). Honest about what's local (the JSON content) without claiming the page itself is third-party-script-free. (2026-05-22 review §5 weakness 1, Red Flag #4)

### Process / production discipline

- [ ] **No CI gate** — direct-to-main with no `npm ci && typecheck && lint && test && build` enforcement. Test suite is locally green (335/336 passing) but no automated gate. Fix: GitHub Actions workflow with the standard pipeline. **~2-4 hours including iteration.** (2026-05-22 review §1 Red Flag, Top 10 #1)

- [ ] **Node version pin** — `.nvmrc` says `20` (loose); Vite needs `^20.19.0 || >=22.12.0`. Pin to `20.19.x` + add `engines.node` + `packageManager` field in `package.json`. **~15 minutes.** (2026-05-22 review §6 weakness 4)

### Dependencies

- [x] **`dompurify` moderate vulnerabilities (transitive via Monaco)** — closed 2026-05-25 (slice 4). `package.json` `overrides` forces Monaco's transitive `dompurify` to `^3.4.5` (above all known advisory ranges); the same field overrides `qs` to `^6.15.2` (transient via shadcn → @modelcontextprotocol/sdk → express). `npm audit` returns 0 vulnerabilities; CI gate raised from `--audit-level=high` to `--audit-level=moderate`. Rationale + revert conditions in `docs/dependency-overrides.md`. Monaco itself untouched (forward upstream upgrade had no version available — `0.56.0-dev-*` still pulls dompurify `3.2.7`). Browser smoke verified hover renders + script-injection paste shows as escaped text + RepairDialog DiffEditor mounts. (2026-05-22 review §5 Red Flag)

---

## Soft blockers — should fix, can ship without if scoped honestly

### Content / SEO

- [ ] **SEO landing route copy** — `/json-viewer`, `/large-json-viewer`, `/ndjson-viewer`, `/json-repair` are currently bare-bones text + one CTA. PLAN.MD targets ~1,500 words each. Brand-coupled for tone. **~4-6 hours.**
- [ ] **README rewrite** — currently default Vite boilerplate. Replace with real setup / verify / benchmark / deploy / troubleshooting docs. Align npm/pnpm references. **~1-2 hours.** (2026-05-22 review §6 weakness 5, Top 10 #7)
- [ ] **Sitemap.xml + robots.txt `Allow: /` flip** — both gated on brand domain landing. (2026-05-22 review §6 weakness 6, Top 10 #8)
- [ ] **Unique `<title>` / `<meta>` / `<h1>` per route** — currently identical-ish across the SEO routes.

### Tests

- [~] **Playwright e2e smoke** — **mostly closed 2026-05-25.** Config + on-demand CI workflow + the following specs under `e2e/`:
  - `e2e/smoke.spec.ts` — cold-load → click Telemetry sample → tree pane populates
  - `e2e/regressions/tablepane-sort.spec.ts` — pins the TablePane peek-by-`node.path` bug from `ddbfeef` via a synthetic 20-line NDJSON fixture (served by `page.route()`, not in `public/`); clicks the score column header and asserts ascending order is real, not the null-at-end clump
  - `e2e/regressions/url-strip-ordering.spec.ts` — pins the `?url=` Plausible ordering bug from `ddbfeef`: (i) address bar clean post-load, (ii) `plausible.io/js/script.js` route mock captures `window.location` at script-eval time, (iii) URL input pre-fill UX intact, plus (iv) full happy-path: pre-fill → Enter → fetch + tree populates
  - `e2e/regressions/drag-drop.spec.ts` — small-file drop populates Monaco + tree; large-file (>10 MB) drop pivots to viewer-only placeholder while tree still populates from underlying Blob (2026-05-22 review §4 #1)
  - `e2e/regressions/repair-dialog.spec.ts` — Apply path replaces text + closes cleanly; Cancel path same. Both assert no `TextModel got disposed` console error (pins commit `94493de` DiffEditor unmount fix). (2026-05-22 review §4 #3)
  - `e2e/regressions/schema-tab.spec.ts` — first-click triggers inference; edit text → staleness flag flips. (2026-05-22 review §4 #4)
  - `e2e/regressions/tree-keyboard-nav.spec.ts` — arrow nav doesn't error; Escape clears search query. (2026-05-22 review §4 #6)
  - `e2e/regressions/pwa-ssg.spec.ts` — each SEO route renders with body content pre-hydration (JS disabled); `sw.js` + `manifest.webmanifest` served. (2026-05-22 review §4 #8)
  - CI integration: `.github/workflows/e2e.yml` runs on `workflow_dispatch` only (not on push/PR) — Playwright's ~150MB browser install + ~3-5min runtime would inflate the main CI gate. Promote to on-PR once the suite is proven stable. Browser cache keyed on `package-lock.json` to skip the install on stable dep runs.
  - **Still pending** for full 2026-05-22 review §4 surface: search (#5 covers materialized rows minimally via the schema test's tree interaction, but search-keystroke + result-jump flow is its own slice), stub expansion + cancel (overlap with keyboard nav but specific to async cancel mid-expand), full PWA offline behavior (Playwright service-worker timing is brittle — current spec covers SSG output + asset presence, not offline reload).
  - (2026-05-22 review §4 weakness 3, Top 10 #2)
- [ ] **Component-level tests** — TablePane, SchemaPane, EmptyStateHero, RepairDialog, MemoryHud, useDebugFlag currently have zero React-side test coverage. Logic tests (parser/tree/schema/sort/columns) are excellent; UI is partially covered now by e2e specs above. **~half day** for any remaining React-Testing-Library coverage.
- [x] **Worker boundary tests** — closed 2026-05-25. `src/lib/parser/parser.worker.test.ts` exercises `searchStubs` via the exported `api` const (Comlink mocked at module load): match-and-batch contract, empty needle / empty ranges short-circuit, case-insensitive matching, abort-mid-flight short-circuits the terminal tick. 5 cases; pins the worker boundary without requiring real Worker integration. (2026-05-22 review §4 weakness 4)

### Security headers

- [~] **CSP tighten + HSTS + COOP + XFO** — mostly closed 2026-05-25. `public/_headers`:
  - `connect-src` tightened from `'self' https:` to `'self' https://plausible.io` — locks XSS exfil destinations to the one analytics endpoint.
  - `Cross-Origin-Resource-Policy: same-origin` added (was missing).
  - HSTS `max-age` bumped 1yr → 2yr (63072000) to qualify for HSTS preload submission.
  - CSP `report-uri /csp-report` directive added as placeholder — endpoint goes live at brand-domain cutover.
  - Already had: HSTS, COOP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, script-src-attr 'none', Permissions-Policy, frame-ancestors 'none', base-uri 'self', form-action 'self', object-src 'none', upgrade-insecure-requests.
  - **Trusted Types deferred** (separate slice): the `require-trusted-types-for 'script'` directive enforces a TrustedTypePolicy on every `innerHTML`-shaped assignment. Monaco's editor internals use `innerHTML` directly; turning Trusted Types on without registering a permissive policy for Monaco breaks the editor. Needs its own slice with policy wiring + browser smoke (editor, RepairDialog, viewer-only fallback). (2026-05-22 review §5 weakness 5-6)
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

- [ ] **Schema worker `root: TreeNode` structured-clone elimination** — currently clones ~225MB at 200MB JSON / ~6s extrapolated at 505MB on every Schema-tab Refresh. Document already in `schema.worker.ts` + `methodology.md`. M2 fix routes inference through the parser worker (which already holds the tree). (2026-05-22 review §2 weakness, this session's deferred item)
- [ ] **`viewStore.ts` split** into `viewState` + `parserSession` — explicit "tipping point" note in the file itself.
- [ ] **TreeView orchestration extraction** — parse dispatch, NDJSON detection, search orchestration, keyboard wiring all in one 500-line file.
- [ ] **NDJSON indexing in worker** — currently main-thread (~200ms allocation + ~100ms scan on 200MB). Acceptable today; worker offload deferred.
- [ ] **Incremental / segmented flatten** — `FlatRow[]` is rebuilt on every parse + every stub expand. Largest measured case (2.25M rows at 505MB) still works; defer until profiling shows a regression. Worth tracking so a future fixture doesn't surprise us. (2026-05-22 review §2 Suggested Improvement #6)
- [ ] **Remove dompurify override** — currently forced to `^3.4.5` via `package.json` `overrides` (slice 4 close-out, 2026-05-25). Drop the override when Monaco ships a stable release bundling `dompurify >= 3.4.0` upstream. Track via `npm view monaco-editor dependencies` periodically; see `docs/dependency-overrides.md` for the full revert checklist. (Same applies to the `qs ^6.15.2` override — drop once shadcn / express bump their pins.)
- [ ] **Identity consistency pass** — surfaced by the post-slice-4 review (2026-05-25). After the Phase 3 identity migration (`c05d030`) and the follow-on TablePane fix (`ddbfeef`), two sites still use the legacy `path` keying. Both dormant today:
  - `parse-streaming.ts` `arrayLengths` Map is keyed by `frame.path` / `stub.path`; `sample-index.ts` `keepEntry` finds the first `[` to locate the array bracket. For arrays under bracket-quoted unsafe keys (`$["a.b"][42]`), the slice misidentifies the bracket and the lookup misses — sampler over-keeps, no crash. Same bug shape as the closed TablePane peek.
  - `ByteIndexEntry` tuple is `[path, range]`. No current consumers other than `sample-index.ts`; future reverse byte-offset lookups would resurface the same class of bug. Cheap to migrate now while there are zero downstream callers.
  - Type-system tightening: introduce a branded `PointerId` (or `JsonPath`) string type so the compiler catches future "called with the wrong identity" sites that today pass silently. Both `node.id` and `node.path` are bare `string` — TypeScript can't flag the misuse.
  - Bundle as one slice: ~1-2 hours. Add a regression test using a fixture with an array under an unsafe key (extend `pathological-keys.json` or sibling fixture).
- [ ] **Large-file splits** — TreeNode (566), parse-streaming (588), TreeView (510), TablePane (509). **Deferred until Playwright e2e suite lands.** Reason: these are React orchestration files where behavior emerges from useEffect ordering + state interactions. Refactoring without integration test coverage risks the silent-render-reorder bug class — exactly the shape of the two regressions caught manually on 2026-05-25 (TablePane peek-by-path, Plausible ordering). 2026-05-22 review §2 weakness + §3 Suggested Improvement #1 conditioned this on "after adding integration tests." Sequencing: Playwright suite first, then the refactor. (2026-05-22 review §2 weakness, §3 Suggested Improvement #1)

### Code-reuse cleanup

- [ ] **`useDarkClass` extraction** — duplicated in MonacoPane + RepairDialog (3 sites total). (2026-05-22 review §3 weakness 2)
- [ ] **`formatBytes` consolidation** — 3 implementations (samples, MonacoPane, EditorToolbar). (2026-05-22 review §3 weakness)
- [ ] **`makeAbortError` + `isAbortError` dedup** between parserHost / schemaHost.
- [ ] **`isLazyNode` type guard** for stub-kind triple-check (5+ sites).
- [ ] **`treeNodeToValue` triplication** (useRowMaterialization + TablePane + infer.ts walkValue).
- [ ] **`schemaHost.ts` terminate-on-every-call** — should only terminate when in-flight.
- [ ] **`TablePane` no-op outer wrapper** — TablePane just passes props to TableBody.
- [ ] **`sort.ts` JSON.stringify in comparator** — 10× speedup possible via pre-stringify pass.
- [ ] **Comment density audit on schema slices** (~40% comments, judgment-heavy).

### Telemetry / logging

- [ ] **Production console logs** — `[parser] parseFile` / `[parser] setFlat` / `[worker] setFlat stored` etc. should be gated by `?debug=1` or a build flag. Currently always-on. (2026-05-22 review §3 weakness 4)
- [x] **Automated perf regression gate** — closed 2026-05-25. `benchmarks/smoke-200mb.test.ts` now asserts catastrophic-tolerance thresholds (parseMs < 60s, flattenMs < 30s, rssAfterParse < 4GB, parse-error undefined, flat rows > 100k). On-demand CI workflow `.github/workflows/perf.yml` generates the 200MB fixture + runs `SMOKE=1`. Wide tolerances deliberately catch only egregious regressions; subtle slowdowns still need the methodology.md manual workflow because GitHub-hosted runner CPU variance defeats tighter thresholds. Promote to weekly schedule or self-hosted runners once stable. (2026-05-22 review §4 Red Flag #3)

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

## Smoke protocols

Manual validation steps that close out a hard-blocker fix once the unit tests are green. Run on `pnpm/npm run build && npm run preview` — dev mode adds React strict-mode double-invokes that mask split-state bugs.

### Path-IDs collision fix smoke (commits `c05d030` + `520692c`)

Model-layer identity is locked by the 12 vitest cases in `src/lib/parser/pathological-keys.test.ts`. This protocol validates the React + viewStore layer those tests don't reach — collapse Set, drawer, search, copy-path, all keyed by the new pointer ids.

**Setup (~2 min)**

1. `npm run build && npm run preview` — note the local URL
2. Open in Chrome. DevTools → Application → Service Workers → tick **Update on reload**. Hard-reload once.
3. Append `?debug=1` to the URL for the Memory HUD.

**Render check (~1 min)**

1. Drag-drop `src/lib/parser/__fixtures__/pathological-keys.json` into the editor pane.
2. Expect: tree pane renders 12 top-level keys (including the empty-string one), nested `{a:{b}}`, and `arr` of 2 elements.
3. HUD: Parse < 50 ms, zero console errors.

**Collision-case checks (~5 min)** — **primary validation**

1. **Dot key vs nested structure.** Expand the `"a"` row → see child `"b"`. Now collapse the `"a.b"` row.
   - Pass: `"a.b"` shows `{...}` / collapsed, `"a"."b"` stays visible.
   - Fail (regression): both collapse together, or only one rows out.

2. **Bracket key vs array index.** Expand `"arr"` → see `arr[0] = 3.5`. Collapse the `"[0]"` row.
   - Pass: `"[0]"` collapses; `arr[0]` stays visible.

3. **Slash + tilde.** Expand `"~contains/slash"` is leaf (number 7) — click its info button → drawer opens. Path field reads `$["~contains/slash"]` (display, not the `/~0contains~1slash` pointer).

4. **Empty key.** Click row for `""` → drawer Path reads `$[""]`. Copy button → paste into a scratch buffer → expect exactly `$[""]`. Pointer id `/` MUST NOT appear in user-visible text.

**Display surfaces (~1 min)** — proves Phase-5 absorption

1. Focus the `"a.b"` row, press `c` → toast description reads `$["a.b"]`. Clipboard paste → `$["a.b"]`.
2. Focus the `"[0]"` row, press `c` → toast / clipboard read `$["[0]"]`.
3. Anywhere a `/a.b` or `/[0]` (pointer form) appears in UI text → fail (Phase 5 incomplete).

**Search (~2 min)**

1. Type `slash` in search — both `"has/slash"` and `"~contains/slash"` highlight by key match. Ancestor chain visible.
2. Type `~` — `"~with~tildes"` + `"~contains/slash"` highlight.
3. Clear, type `7` — `"~contains/slash": 7` highlights via value match.

**Numbers to capture**

- HUD Parse: ___ ms
- HUD leaves: ___
- Console errors: should be 0
- Copy-path clipboard exact values for `a.b` / `[0]` / empty-key (paste into the smoke log)

**Pass criteria (all must hold)**

- Every collision pair above keeps distinct collapse state.
- Every display surface shows JSONPath (`$.*` / `$["..."]`), never the pointer form (`/...`).
- Search finds key-matches in pathological keys.
- Zero console errors during the run.

If any fail: do NOT mark the hard-blocker closed — file the specific failure mode and re-open the relevant phase (3 if collapse state regressed, 5 if display surface leaked a pointer).

---

## What this document is NOT

- **Not the build verification list.** That's PLAN.MD lines 411-469.
- **Not a roadmap.** This is one-shot pre-launch.
- **Not a post-mortem template.** Use a separate doc after launch.
