# Engineering Assessment: `json-tool`

Assessment target: `/Users/fazeelusmani/Documents/Repo/json-tool`  
Branch reviewed: `main`  
Review date: 2026-05-22  
Scope: repository, git history, architecture, tests, documentation, security posture, and launch readiness.

## Validation Note

After drafting this assessment, its concrete claims were checked against the repository's files, git history, and configuration. The material claims held up. One caveat: the `npm audit` finding is recorded as specialist-reported evidence; local verification in the main review path was limited by missing dependencies / environment mismatch.

## Executive Summary

This is a high-output solo build with a genuinely non-trivial technical core: a browser-only JSON tool designed around large-file parsing, lazy byte-range expansion, NDJSON support, schema emitters, repair UX, and a read-only table view. The developer shows strong autonomy, performance awareness, test intent, and documentation discipline.

The repo is not production-launch ready. The biggest risks are process and operational: direct-to-main commits, no CI, no e2e tests, no deployed URL/domain readiness, stale/default README, crawler-blocking robots, placeholder analytics, and privacy/security gaps around third-party analytics and `?url=` auto-fetch. Architecturally, the local file path is strong; URL loading and NDJSON/search scaling are weaker than the public 500 MB story implies.

Overall score: **68 / 100**

Estimated developer level: **Senior**, with a strong bias toward product-minded IC execution and performance engineering. Not staff-level on production process/security/ops yet.

Production trust verdict: **Trust with guardrails.** I would trust this developer with production work behind CI, code review, branch protection, and security review. I would not let this repo launch publicly in its current state without closing the listed launch and security gates.

Close supervision needed: **No for day-to-day implementation; yes for production release discipline.**

Weekly output: **Above average**. The repo has 82 commits from 2026-05-14 to 2026-05-22, with 74 commits during 2026-05-18 to 2026-05-22. That is substantially above normal weekly output for a solo developer.

## Specialist Scorecard

| Perspective | Score | Verdict |
|---|---:|---|
| Staff Engineer | 7.2 / 10 | Strong large-file architecture, but URL path, internal IDs, state ownership, and scaling limits need correction. |
| Engineering Manager | 7.5 / 10 | Very high output and coherent progression, but direct-to-main without CI is a major process risk. |
| Security Reviewer | 6.5 / 10 | Good baseline CSP and local processing intent, but privacy claims conflict with third-party JS and weak URL loading. |
| QA/Test Engineer | 5.5 / 10 | Good pure-unit coverage, poor executable/e2e/integration confidence. |
| DevOps / Production Readiness | 5.0 / 10 | PWA and benchmark work exist, but no CI/CD, no deploy manifest, incomplete setup docs, and launch config gaps. |
| Product Delivery | 6.8 / 10 | Core technical wedge is real; launch and customer-validation work lag behind. |

## 1. Git Workflow & Commit Quality

Score: **7.5 / 10**

### Evidence

- 82 commits on `main`, all linear, no merge commits visible.
- Daily commit distribution from `git log --date=short`: 8 on 2026-05-14, 17 on 2026-05-18, 13 on 2026-05-19, 13 on 2026-05-20, 15 on 2026-05-21, 16 on 2026-05-22.
- Commit progression is coherent:
  - `63e799c chore: initial vite scaffold`
  - `72d02f9 feat(editor): mount Monaco pane with JSON language + format helpers`
  - `05692f4 feat(parser): streaming spine parser with offset-indexed stubs`
  - `a07266f feat(ndjson): pure detection + line-offset index`
  - `f4a4bac feat(schema): walker + sampler for schema inference`
  - `6c03d4e feat(repair): wire jsonrepair to editor toolbar with Monaco diff review`
  - `c7a7df4 feat(table): read-only sortable table view of top-level arrays`
- Very large commits exist:
  - `bd58e1d`: 11,570 insertions, mostly dependency/config.
  - `7a6e985`: 5,904 insertions for shadcn/Radix primitives and lockfile.
  - `c7a7df4`: 1,387 insertions for table view.
- Plan itself says CI is not configured: `PLAN.MD:468`.

### Strengths

- Commit messages are usually meaningful and scoped: `feat(parser)`, `fix(search)`, `perf(parser)`, `docs(bench)`.
- History shows logical progression from scaffold to editor, tree, parser, benchmarks, NDJSON, search, schema, repair, table.
- Frequent `fix(...)` and `perf(...)` commits show self-review and measurement-driven iteration, not just feature dumping.
- Documentation commits track decisions and benchmark results.

### Weaknesses

- Everything appears to land directly on `main`; there is no PR, branch, or merge review history.
- No visible CI gate, branch protection, or release workflow.
- Some commits are too large for reliable review, especially generated UI primitives and feature bundles.
- The speed of commits is impressive but could easily outrun review, QA, and product validation.

### Red Flags

- Direct-to-main plus no CI is the main process risk.
- Date drift in `PLAN.MD`: entries reference `2026-05-23 W4-Wed` even though relevant commits are dated 2026-05-22 and the environment date is 2026-05-22.
- Large risky parser/performance changes landed rapidly without an automated regression gate.

### Suggested Improvements

1. Protect `main` and require PRs, even for solo development.
2. Add CI before new features: `npm ci`, typecheck, lint, unit tests, build, Playwright smoke.
3. Split future feature commits into logic, tests, UI wiring, and docs.
4. Keep generated/vendor code isolated and clearly labeled.
5. Add weekly release notes summarizing shipped, measured, broken, and deferred work.

## 2. Architecture & System Design

Score: **7.2 / 10**

### Evidence

- Main app is a two-pane SSG route: `src/App.tsx`, `src/routes.tsx`.
- Large-file entry point skips Monaco above 10 MB and caps files at 500 MB: `src/components/editor/MonacoPane.tsx`.
- Worker parser host: `src/state/parserHost.ts`.
- Streaming parser with shallow spine, byte-range stubs, preview ranges, and sampled byte index: `src/lib/parser/parse-streaming.ts`, `src/lib/parser/parser-types.ts`.
- NDJSON detection and line indexing: `src/lib/json/ndjson.ts`, `src/lib/parser/parse-ndjson.ts`.
- View state and parser session state are mixed in `src/state/viewStore.ts`; the file itself warns this is near a split point.
- Right pane has Tree, Schema, Table tabs: `src/components/tree/RightPane.tsx`.

### Strengths

- Large-file local-file architecture is thoughtful: worker boundary, `Blob.stream()`, shallow materialization, lazy expansion, byte ranges, virtualization.
- Domain logic is mostly separated from React: parser, tree flatten/search/splice, schema inference/emitters, table columns/sort, JSON repair/format.
- Cost-aware UX exists:
  - Monaco disabled for large files.
  - Table sorting disabled above `SORT_DISABLE_THRESHOLD` for stub-backed rows.
  - Stub previews and row materialization use Blob-keyed WeakMap caches.
- Schema inference samples large arrays instead of walking everything.
- PWA and SSG are considered early rather than bolted on.

### Weaknesses

- URL loads bypass the best large-file architecture. `fetchUrl.ts` uses `response.text()`, then `EditorToolbar.tsx` stores the full string; `TreeView.tsx` wraps it into a Blob afterward. That defeats the streaming design for remote 500 MB payloads.
- Internal identity is unsafe JSONPath strings. `parse-streaming.ts` and `parse.ts` append object keys with `${path}.${key}`. Keys containing `.`, `[`, `]`, or duplicate keys can collide and break collapse state, focus restoration, drawer restoration, search matching, and splicing.
- `TreeView.tsx` is doing too much: parse dispatch, NDJSON detection, parse telemetry, worker search orchestration, keyboard wiring, and render composition.
- `viewStore.ts` mixes view state with parser-session state: `root`, `flat`, `sourceBlob`, `parseMode`, search state, and expansion state.
- NDJSON indexing runs on the main thread and materializes one JS node per line.
- Search remains O(rows) on the main thread plus O(file size) in the worker for deep stubs.
- Some large files are hard to reason about: `TreeNode.tsx` 566 lines, `parse-streaming.ts` 538 lines, `TreeView.tsx` 501 lines, `TablePane.tsx` 478 lines.

### Red Flags

- The 500 MB claim is only well-supported for dropped local files, not URL loads.
- Collision-prone path IDs are a correctness bug waiting to happen with real-world JSON keys or duplicate keys.
- Main-thread NDJSON and flat-row scanning may become the next performance ceiling.

### Suggested Improvements

1. Rebuild URL loading around `response.body` streaming and store a Blob-like source, not a full string.
2. Separate display JSONPath from internal identity; use JSON Pointer/token arrays/generated node IDs.
3. Split `viewStore` into `viewState` and `parserSession`.
4. Extract TreeView parse/search effects into dedicated hooks or hosts.
5. Move NDJSON indexing to a worker and consider compact typed-array storage for line ranges.
6. Add segmented or incremental flattening before large expanded documents make `FlatRow[]` the bottleneck.
7. Remove legacy/dead-ish code and dependencies such as unused `stream-json` if no longer part of the architecture.

## 3. Code Quality

Score: **7.0 / 10**

### Evidence

- Source is organized under `src/components`, `src/lib`, `src/state`, `src/pages`.
- Utilities use discriminated unions and typed result objects: `src/lib/json/format.ts`, `src/lib/net/fetchUrl.ts`, `src/lib/json/repair.ts`.
- Comments are unusually detailed, especially in parser, worker, schema, and benchmark code.
- Explicit TODOs/placeholder search shows unresolved launch/config items:
  - `src/lib/monaco/init.ts`: tree-shake Monaco TODO.
  - `src/lib/net/fetchUrl.ts`: streaming max-size enforcement TODO.
  - `vite.config.ts`: `BRAND-PLACEHOLDER`.
  - `index.html`: `REPLACE-WITH-CF-PAGES-SUBDOMAIN`.
  - `src/routes.tsx`: SEO route stubs.

### Strengths

- Naming is generally clear and intention-revealing: `parseStreaming`, `sampleByteIndex`, `useStubExpansion`, `inferSchemaForRoot`, `deriveColumns`.
- Pure helpers are testable and mostly small.
- Error handling often uses typed results instead of throwing for expected failures.
- Code comments capture rationale, tradeoffs, and future tripwires.
- Store design attempts to preserve UX state across reparses and stub expansion.
- Lazy loading is used for Monaco and repair diff editor.

### Weaknesses

- Some files have grown beyond comfortable review boundaries.
- There is duplication: dark-mode observer logic exists in both `MonacoPane.tsx` and `RepairDialog.tsx`.
- Some comments are stale, e.g. `fetchUrl.ts` still references an old 100 MiB constraint while code sets 500 MiB.
- Production code still logs parse timings to console in `parserHost.ts` and `TreeView.tsx`.
- `README.md` is still default Vite boilerplate, which is a codebase quality/documentation smell.
- Dead or obsolete surfaces remain: `parseToTree`, `deriveVisible`, `stream-json` dependency, and spike code are not clearly quarantined from current architecture.

### Red Flags

- Stale comments and plan/date drift reduce trust in operational docs.
- Internal path identity bug is both an architecture and maintainability issue.
- `fetchUrl` has a known unbounded memory path for chunked/no-length responses.

### Suggested Improvements

1. Refactor large UI orchestration files after adding integration tests.
2. Centralize dark theme detection.
3. Prune obsolete parser paths/dependencies or mark them explicitly as test-only/legacy.
4. Replace console instrumentation with debug-mode telemetry or guarded logging.
5. Update comments and README to match current behavior.
6. Add stricter type-aware ESLint once the project stabilizes.

## 4. Testing & Reliability

Score: **5.5 / 10**

### Evidence

- 25 tracked `*.test.ts/tsx` files under `src`.
- Approximately 4,096 lines of test code under `src`.
- Unit tests cover parser, NDJSON, tree, schema emitters, table logic, repair, fetch URL, clipboard, and viewStore.
- `benchmarks/smoke-200mb.test.ts` is skipped unless `SMOKE=1`.
- `package.json` has `test` and `test:run`, but no e2e script.
- `@testing-library/react`, `jsdom`, and Playwright are dependencies, but there is no `playwright.config.*` and no meaningful component/e2e usage.
- Local verification was not completed in this session: initial checkout lacked `node_modules`; active shell had Node v18.20.3 while `.nvmrc` asks for Node 20; an `npm ci --ignore-scripts` attempt produced long peer warnings and was interrupted.

### Strengths

- Parser tests are strong for byte offsets, stubs, previews, multibyte safety, partial errors, pathological shapes, and chunk boundaries.
- NDJSON tests cover detection, indexing, blank lines, CRLF, and parsing.
- Schema inference and emitters have broad edge-case coverage.
- Table logic has unit tests for column derivation, primary array selection, and sorting.
- `fetchUrl` and JSON repair/format have focused unit tests.

### Weaknesses

- No CI means test existence does not equal enforced reliability.
- No React component tests despite complex UI state.
- No Playwright/e2e smoke tests for the main user flows.
- Worker boundaries are under-tested: Comlink, abort, supersede, search batches, worker failure paths.
- Large-file claims rely on manual benchmark documentation, not automated performance gates.
- Some timing assertions in tests may be flaky on slower CI if added as-is.

### Missing Critical Tests

1. Drag/drop file path, including viewer-only mode.
2. `?url=` load path and oversize/no-Content-Length behavior.
3. Repair dialog apply/cancel flow.
4. Schema tab first-click infer and stale refresh.
5. Table tab render/sort on materialized and stub-backed rows.
6. Tree keyboard navigation, stub expansion, cancel/abort.
7. Worker `searchStubs` batching and abort.
8. PWA/offline behavior and route SSG output.
9. Path collision behavior for keys containing `.`, `[`, `]`, and duplicates.

### Red Flags

- The repo cannot currently prove green status from a fresh checkout without environment repair.
- Most user-critical flows are untested end-to-end.
- Performance benchmark tests mostly log metrics rather than asserting release gates.

### Suggested Improvements

1. Add CI immediately.
2. Add Playwright smoke tests for `/`, drop small JSON, viewer-only large file, search, stub expand, repair, schema, table, and SEO routes.
3. Add worker integration tests.
4. Convert benchmark smoke into explicit pass/fail thresholds where stable.
5. Replace brittle timing unit assertions with benchmark-only checks or loose CI thresholds.

## 5. Security

Score: **6.5 / 10**

### Evidence

- Top bar claims client-side privacy: `src/components/layout/TopBar.tsx`.
- `index.html` loads Plausible from `https://plausible.io/js/script.js` and has a placeholder domain.
- CSP in `public/_headers` allows `script-src 'self' https://plausible.io` and `connect-src 'self' https:`.
- `fetchUrl.ts` auto-fetches arbitrary URLs after `new URL(url)` validation.
- `EditorToolbar.tsx` auto-loads `?url=` on mount.
- `fetchUrl.ts` has a TODO for streaming size enforcement and currently uses `response.text()`.
- Monaco disables remote schema fetching in `src/lib/monaco/init.ts`.
- No secrets, `.env`, certs, or obvious private keys were found.
- No auth/backend/database exists yet.
- Security specialist reported running `npm audit --json` and finding 2 moderate vulnerabilities involving `monaco-editor` and transitive `dompurify`; this was not independently re-run in the main review path because dependencies/environment were not fully set up.

### Strengths

- CSP baseline is better than typical early projects: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`.
- Monaco is bundled locally rather than CDN-loaded.
- Monaco remote JSON schema fetching is disabled.
- File drops enforce extension and 500 MiB cap.
- No `dangerouslySetInnerHTML`, `eval`, or `new Function` usage found in source.
- No backend/auth/database surface yet, reducing server-side exposure.

### Weaknesses

- Privacy claim is too strong while third-party analytics JS runs on the editor page.
- `?url=` auto-load can leak signed/tokenized URLs to browser history, DOM display, analytics, referrer, or third-party script context.
- `fetch(url)` does not set `credentials: 'omit'` or `referrerPolicy: 'no-referrer'`.
- No explicit `http:`/`https:` protocol allowlist or userinfo URL rejection.
- `connect-src 'self' https:` is broad; if an XSS/dependency compromise lands, exfil destinations are unrestricted across HTTPS.
- No HSTS, COOP/CORP, Trusted Types, CSP reporting, or `script-src-attr 'none'`.
- `response.text()` can materialize unbounded remote content when `Content-Length` is absent or false.

### Red Flags

- "Your JSON never leaves the browser" conflicts with running third-party JS in the same page context.
- Auto-fetching arbitrary `?url=` on page load is risky for privacy and drive-by resource usage.
- URL cap is incomplete for malicious or chunked responses.

### Suggested Improvements

1. Remove third-party analytics from the editor route, or clearly weaken/disclose the privacy claim.
2. Do not send full URLs/query strings to analytics.
3. Require a user gesture before `?url=` auto-load, or show an explicit confirmation.
4. Harden URL loading: protocol allowlist, reject userinfo, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`.
5. Stream remote responses with enforced byte caps.
6. Tighten CSP and add HSTS, COOP/CORP, `X-Frame-Options: DENY`, `script-src-attr 'none'`, CSP report endpoint.
7. Resolve Monaco/DOMPurify audit findings.

## 6. Production Readiness

Score: **5.0 / 10**

### Evidence

- `package-lock.json` exists; repo is npm-shaped.
- `.nvmrc` contains `20`, but active shell in this review was Node v18.20.3.
- Vite lockfile dependency requires Node `^20.19.0 || >=22.12.0`.
- `package.json` scripts exist for dev/build/lint/test/preview.
- No `.github`, `vercel.json`, `netlify.toml`, `wrangler.toml`, Dockerfile, or Playwright config found.
- `public/robots.txt` disallows all indexing.
- No `public/sitemap.xml`.
- `README.md` is default Vite template.
- `index.html` has `REPLACE-WITH-CF-PAGES-SUBDOMAIN`.
- `vite.config.ts` has `BRAND-PLACEHOLDER`.
- `public/_headers` exists for Cloudflare-style headers.
- PWA is configured in `vite.config.ts`.
- Debug HUD exists behind `?debug=1`.

### Strengths

- Build system is conventional: Vite, SSG, lockfile, scripts.
- PWA support is present and thought through.
- Security headers are staged.
- Benchmark methodology is detailed and reproducible in spirit.
- Debug HUD provides useful manual telemetry for parser/heap/worker status.
- Large-file local behavior has measured results documented.

### Weaknesses

- No CI/CD.
- No deploy manifest/runbook.
- Node version is imprecisely pinned and local shell did not match it.
- Docs conflict between npm and pnpm. The repo has `package-lock.json`, while benchmark methodology uses `pnpm`.
- README is not usable for onboarding.
- SEO launch is blocked by robots and missing sitemap.
- Analytics/branding are placeholders.
- No production-safe logging/error reporting.
- No Lighthouse CI or automated performance regression tracking.

### Red Flags

- A fresh clone cannot be trusted to build/test without environment setup fixes.
- No automated release gate exists for parser, worker, security, or PWA changes.
- The project is not deployable as-is for public SEO acquisition.

### Suggested Improvements

1. Pin exact Node version: `20.19.x` or `22.x`; add `engines.node` and `packageManager`.
2. Align all docs on npm or pnpm.
3. Add CI/CD with build, lint, tests, audit, and browser smoke.
4. Add Cloudflare Pages deployment runbook or config.
5. Replace README with real setup, verify, benchmark, deploy, and troubleshooting docs.
6. Configure analytics domain/events or remove analytics before launch.
7. Open robots only when canonical domain and sitemap are ready.
8. Add Playwright config and production-preview smoke tests.
9. Add privacy-safe client error reporting and CSP reporting.
10. Review PWA precache size and Monaco chunk tree-shaking.

## 7. Delivery Assessment

Score: **6.8 / 10**

### Evidence

- `PLAN.MD` tracks month-one goals and checkboxes.
- Completed technical items include 200 MB JSON, 500 MB local-file JSON, 200 MB NDJSON, schema inference, repair, table view, and benchmark methodology.
- Open plan items include public URL/name/domain, JSONPath/jq, SEO content, sitemap, share modal, email capture, analytics events, launch video, customer validation, CI.
- `outreach/log.md` is still blank.
- No `outreach/customer-notes.md` exists.
- `routes.tsx` and landing pages explicitly label SEO pages as stubs.

### Strengths

- Meaningful work completed is substantial. This is not a toy scaffold.
- Technical wedge has depth and measured performance.
- Product planning artifacts are much more thorough than typical early repos.
- Scope discipline exists: docs explicitly defer desktop, VSCode, collaboration, mobile, broad SaaS work.
- Launch narratives and benchmark methodology were drafted before launch.

### Weaknesses

- Product-facing launch polish lags far behind engineering core.
- Customer validation is mostly planned, not executed.
- Free-tool to paid-SaaS persona overlap remains unresolved.
- JSONPath/jq, share links, email capture, and SEO content are open despite being in the Month 1 plan.
- README and public-facing docs do not match the product.

### Red Flags

- The repo looks technically impressive but not yet customer/launch validated.
- Acquisition channel work is incomplete: SEO pages are stubs and robots blocks indexing.
- Some public claims need narrower wording, especially around URL loads and privacy.

### Suggested Improvements

1. Freeze new features until launch gates are closed.
2. Decide explicitly whether JSONPath/jq/share/email capture are cut from Month 1 or must ship.
3. Replace all SEO stubs with real content or remove the claim that they are done.
4. Run and record customer discovery before Month 2 planning.
5. Update launch copy to match measured behavior exactly.

## Top 10 Red Flags

1. Direct commits to `main` with no CI, branch protection, or PR review.
2. `?url=` loading uses `response.text()` and bypasses the streaming large-file architecture.
3. Remote response cap only checks `Content-Length`; chunked or lying servers can force huge materialization.
4. Third-party Plausible script conflicts with "Your JSON never leaves the browser" privacy posture.
5. Internal IDs are unsafe JSONPath strings and can collide for dotted/bracketed/duplicate keys.
6. No e2e/component tests for the main user workflows.
7. README is still default Vite boilerplate.
8. SEO launch blocked by `robots.txt` `Disallow: /`, no sitemap, stub landing pages.
9. Setup reproducibility is weak: `.nvmrc` is vague, docs mix npm/pnpm, local Node was incompatible.
10. Customer validation is not evidenced; outreach templates exist but logs are blank.

## Top 10 Positive Signals

1. High-output coherent build: 82 commits, logical progression from scaffold to complex features.
2. Strong large-file local parser architecture with worker, spine, stubs, byte ranges, lazy expansion.
3. Real performance measurement and benchmark methodology, not hand-wavy claims.
4. Good pure-unit test coverage for parser, tree, schema, table, NDJSON, repair, and fetch helpers.
5. Thoughtful cost-aware UX: viewer-only mode, virtualization, sort disable threshold, WeakMap caches.
6. Clear domain separation for many pure modules under `src/lib`.
7. Commit messages are mostly scoped and meaningful.
8. Planning docs show product thinking, scope control, risks, and launch narratives.
9. Security basics are considered: CSP headers, local Monaco, remote schema fetching disabled, no obvious secrets.
10. Developer shows self-correction through fix/perf commits and documented benchmark-driven changes.

## Top 10 Action Items For Next Week

1. Add CI with Node 20.19+ or 22.x: `npm ci`, typecheck, lint, unit tests, build, audit.
2. Add Playwright config and smoke tests for `/`, SEO routes, file drop, viewer-only mode, search, stub expansion, schema, repair, and table.
3. Fix `?url=`: stream response bodies, enforce byte caps during read, use `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, protocol allowlist, and user confirmation.
4. Remove third-party analytics from the editor route or rewrite privacy claims and analytics handling.
5. Replace unsafe JSONPath internal IDs with collision-safe node identity.
6. Replace README with real setup/build/test/deploy/benchmark docs and align npm/pnpm.
7. Add exact Node/package manager metadata: `.nvmrc`, `engines`, `packageManager`.
8. Complete launch SEO basics: real route copy, sitemap, canonical domain, robots `Allow: /` when ready, OG metadata.
9. Split `viewStore` and extract TreeView parse/search orchestration into smaller hooks or hosts.
10. Record real customer/outreach data and decide whether free JSON tool users overlap with the paid SaaS buyer.

## Final Hiring / Trust Assessment

I would rate this developer as **senior** for solo product engineering and technically challenging frontend/performance work. They demonstrate strong autonomy, speed, architecture judgment, and measurement discipline.

I would not rate the current working style as production-safe without process guardrails. The missing CI, direct-to-main workflow, incomplete e2e coverage, and privacy/launch gaps are not minor. They are the difference between an impressive prototype and a reliable public product.

Recommended management mode: give them ownership of hard technical systems, but require:

- CI before further feature work.
- PR review for parser/security/URL/PWA changes.
- Weekly delivery review against launch gates.
- Security review before public launch.
- A clear product cut line for Month 1.

With those controls, this developer is worth trusting with production work. Without them, the risk is not lack of ability; it is uncontrolled velocity.
