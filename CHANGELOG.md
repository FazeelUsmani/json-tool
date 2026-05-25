# Changelog

Weekly cadence — shipped / measured / broken-or-found / deferred.
Inaugural entry per the 2026-05-22 engineering assessment
(§1 Suggested Improvements #5). Format intentionally terse; the
git log carries the per-commit detail.

---

## Week of 2026-05-25 (covering 2026-05-18 → 2026-05-25)

### Shipped

- **Streaming spine parser** — worker + Comlink host + byte-range
  stubs + lazy expansion via click/keyboard/drawer with ESC abort.
  MAX_SPINE_DEPTH=2; depth-2 composites become stubs that re-tokenize
  on demand.
- **NDJSON support** — pure detection + line-offset index + line-
  paginated render + in-place line expansion via caret / ArrowRight /
  Enter.
- **Schema inference** — walker + sampler, JSON Schema (draft-07) /
  TypeScript / Zod emitters, worker + host with supersede pattern,
  UI tab with first-click infer + staleness dot.
- **Table view** — read-only sortable view of top-level arrays;
  sort disabled above `SORT_DISABLE_THRESHOLD` for stub-backed rows.
- **JSON repair** — jsonrepair wired to the editor toolbar with a
  Monaco diff dialog for review-before-apply.
- **Search worker scan** — content scan inside collapsed stubs +
  NDJSON lines, streaming batches back to `viewStore.stubSearchMatches`;
  sync `findMatches` lowered to inline ASCII case-folding to cut INP
  at 200MB.
- **Editor empty-state hero** — sample quick-loads when no document
  is open.
- **Viewer-only mode** — files > 10MB bypass Monaco and render
  directly into the tree pane.
- **Stub previews** — inline preview text for closed composites via
  Blob-keyed WeakMap caches, surviving virtualization remounts.
- **Memory HUD (`?debug=1`)** — heap / parse / worker status panel.
- **CI workflow** — GitHub Actions running `npm ci`, typecheck, lint,
  test, build, audit on every push + PR.
- **Node version pin** — `.nvmrc` to `20.19.x`, `engines.node`,
  `packageManager` field added.
- **Identity refactor** — TreeNode + parser + viewStore + splice + UI
  switched from JSONPath-as-id to RFC 6901 pointer ids. Display
  surfaces still read `node.path` so users see `$.events[42]`, not
  `/events/42`. Closes the 2026-05-22 review's Red Flag #5.
- **Pathological-keys regression fixture** — 12 cases proving keys
  with `.`, `[`, `]`, `/`, `~`, empty string produce distinct ids;
  pins the identity refactor.
- **`?url=` streaming + security hardening** — `fetchUrl` reads
  `response.body.getReader()` and enforces `maxBytes` during read,
  returning a `Blob` that the parser worker consumes via
  `blob.stream()` end-to-end. Adds `http:`/`https:`-only allowlist,
  rejects userinfo URLs, sets `credentials: 'omit'` +
  `referrerPolicy: 'no-referrer'`. EditorToolbar mirrors the
  file-drop dispatch so 500MB URL loads behave the same as 500MB
  drops. Closes the 2026-05-22 review's Red Flags #2 + #3.
- **`?url=` auto-fetch removed** (slice 3.5) — `?url=` now pre-fills
  the URL input instead of auto-firing the fetch; user clicks Load to
  trigger. `history.replaceState` strips the param from
  `window.location` on mount so Plausible's auto-pageview can't
  capture it. Closes the 2026-05-22 review's §5 weakness 2 (auto-load leaks signed
  URLs to history / analytics / referrer).
- **dompurify advisory cleared via `overrides`** (slice 4) —
  `package.json` `overrides` forces Monaco's transitive `dompurify`
  to `^3.4.5` (above all known XSS / prototype-pollution / template-
  bypass advisory ranges). Same override field clears a transient
  `qs` DoS advisory (shadcn → express → qs `6.15.1` → `^6.15.2`).
  `npm audit` returns 0 vulnerabilities; CI audit gate raised from
  `--audit-level=high` to `--audit-level=moderate`. Monaco itself
  untouched (no forward upgrade exists — `next` channel still
  bundles dompurify `3.2.7`). Rationale + revert conditions in
  `docs/dependency-overrides.md`. Closes the 2026-05-22 review's §5 Red Flag.
- **RepairDialog DiffEditor unmount race** — `setModel(null)` on
  apply/cancel before React unmounts the dialog clears Monaco's
  widget model pointer ahead of the TextModel disposal, silencing
  the `TextModel got disposed before DiffEditorWidget model got
  reset` console error that fired on every close cycle. Pre-existing
  bug surfaced during slice 4 browser smoke.
- **EmptyStateHero paste handler** — window-level `paste` listener
  while the empty-state hero is mounted pipes the clipboard text
  into `documentStore` (`kind:'paste'`), mounting Monaco with the
  pasted content. Without this, the "or paste text to begin" copy
  promised behavior that didn't work — Monaco doesn't exist yet to
  receive a paste event when the editor is truly empty. Listener
  short-circuits if any input is focused so it doesn't hijack future
  search bars or URL fields.
- **Playwright skeleton + 2 regression pins** — `playwright.config.ts`
  + `e2e/` folder with `smoke.spec.ts` (sample-mount happy path) and
  `regressions/` for the TablePane peek-by-`node.path` and `?url=`
  Plausible-ordering bugs caught earlier today. CI wired as on-demand
  workflow (`.github/workflows/e2e.yml`, `workflow_dispatch` only)
  with Playwright browser-cache keyed on `package-lock.json`.
- **Playwright surface fill** — added five more specs covering the
  remaining e2e gaps from the 2026-05-22 review §4: `drag-drop.spec.ts`
  (#1: small file drop + viewer-only pivot at 10MB), `repair-dialog
  .spec.ts` (#3: Apply / Cancel + DiffEditor unmount-race assertion
  via `page.on('pageerror')`), `schema-tab.spec.ts` (#4: first-click
  infer + stale dot on edit), `tree-keyboard-nav.spec.ts` (#6:
  arrow nav + Escape clears search), `pwa-ssg.spec.ts` (#8: each
  SEO route renders pre-hydration with JS disabled, sw.js +
  manifest served). The `url-strip-ordering` spec also gained a
  happy-path case for #2. Pending bits flagged in gate doc:
  search-keystroke flow, stub-expand cancel mid-flight, full PWA
  offline behavior (Playwright's SW timing is brittle).
- **Worker boundary tests** — `parser.worker.test.ts` exercises
  `searchStubs` via the exported `api` const (Comlink mocked at
  module load): match-and-batch, empty short-circuits, case-
  insensitive matching, abort-mid-flight short-circuits the
  terminal tick. 5 cases. Closes the 2026-05-22 review's §4 weakness 4 (worker
  boundary under-tested).

### Measured

- 200MB JSON cold-load benchmarks captured in `benchmarks/methodology.md`.
- 500MB local-file JSON.
- 200MB NDJSON.
- Lighthouse pass on `/large-json-viewer`.
- Search INP at 200MB: ~2000ms → ~168ms (~12×) via inline ASCII
  case-folding + byte-level worker scan.
- Parser `MAX_SPINE_DEPTH` 3 → 2 perf win documented.

### Broken / found

- **Path-IDs collision** (RF #5 in assessment, 2026-05-22) — keys
  containing `.`, `[`, `]`, or duplicate keys collapsed onto the same
  id under the prior `${path}.${key}` scheme. **Closed** this week
  via the identity refactor.
- **`?url=` streaming gap** — `fetchUrl.ts` uses `response.text()`;
  500MB URL load is *claimed* but architecturally unsupported. Still
  open as audit-response slice 3.
- **Cap bump 100→500MB** without architecture support — half-fix,
  flagged by assessment and re-verified.
- **dompurify moderate vulnerabilities** (transitive via Monaco) —
  8 advisories, `--audit-level=high` lets them through in CI; full
  fix requires Monaco breaking upgrade with browser smoke. Audit-
  response slice 4.
- **Schema worker structured-clone** — `root: TreeNode` clones ~225MB
  at 200MB JSON on every Schema refresh; documented honestly in
  `schema.worker.ts` + `methodology.md`. M2 fix routes inference
  through the parser worker (which already holds the tree).
- **Hydration mismatch + INP regression** — caught during W4-Mon
  HUD work, both fixed (`feu` defer, search-to-worker move).

- **Security headers tighten** — `public/_headers` `connect-src`
  narrowed from `'self' https:` to `'self' https://plausible.io`
  (locks XSS exfil to the one analytics endpoint);
  `Cross-Origin-Resource-Policy: same-origin` added; HSTS bumped
  1yr → 2yr for HSTS-preload eligibility; CSP `report-uri
  /csp-report` placeholder added (endpoint activates at
  brand-domain cutover).
- **Trusted Types wired (pending browser smoke before trust)** —
  `MonacoEnvironment.createTrustedTypesPolicy` hook in
  `src/lib/monaco/init.ts` routes Monaco's policy requests through
  `window.trustedTypes`; CSP `trusted-types` directive allowlists
  the 10 policy names Monaco creates internally (enumerated from
  the bundled source) + `dompurify` + `'allow-duplicates'`;
  `require-trusted-types-for 'script'` enforced. **Vitest can't
  catch Trusted Types violations** — only browser execution does.
  Validate via the launch-gate smoke checklist before considering
  prod-safe. Typical failure: `innerHTML` throws → blank component
  or React error overlay; fix is to extend the policy allowlist
  or revert the enforcement directive.

### Deferred

- Remove dompurify + qs overrides once upstream pins land (see
  `docs/dependency-overrides.md` for revert conditions; tracked in
  `launch-readiness-gate.md` polish section).
- Branch protection flip on `main` (your GitHub-side action).
- README rewrite — currently default Vite boilerplate (~1-2h).
- Playwright e2e smoke + component-level UI tests (~4-6h + half-day).
- CSP tighten + HSTS + COOP + XFO + Trusted Types (~1-2h).
- SEO route copy + sitemap + robots flip — brand-coupled (~4-6h).
- Customer calls + cold-email persona-overlap data — your lane.
- `viewStore` split, TreeView orchestration extraction, NDJSON
  worker offload, large-file splits — M2 polish.
- JSONPath / jq query bar — design locked, ~6h.
