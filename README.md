<!-- brand-pending: name, tagline, positioning copy + screenshots all land
     with the brand decision (tracked in launch-readiness-gate.md). The
     "What this is" section below is the technical truth; the marketing
     framing will go above it. Grep `brand-pending:` after the brand
     cutover to find every placeholder. -->

# json-tool

> Browser-side JSON viewer + repair + schema inference for files up to
> 500 MB. 100% client-side after first paint — no upload, no server,
> no telemetry on the JSON itself. **(placeholder copy)**

## What this is

A static-deployed React app for working with large JSON / NDJSON
files. The headline capability is a streaming-spine parser with
lazy-expanded byte-range stubs that keeps the browser responsive
on 200 MB – 500 MB documents that standard tools (jsonhero,
jsoneditoronline, etc.) crash or hang on.

Beyond viewing:

- **Schema inference** — emits JSON Schema (draft-07), TypeScript
  types, and Zod runtime validators from a sampled walk of the tree.
- **JSON repair** — wraps `jsonrepair` with a Monaco diff dialog so
  the user reviews the proposed fix before it replaces the source.
- **Table view** — sortable, read-only table on top-level arrays;
  works on stub-backed rows up to a threshold.
- **`?url=` loader** — fetches remote JSON via streaming
  `response.body.pipeThrough()` with a byte cap enforced during the
  read; security-hardened (http/https only, no userinfo URLs, no
  credentials sent).

See `PLAN.MD` for the month-1 scope and `launch-readiness-gate.md`
for what blocks the public-domain launch.

## Stack

- **Build:** Vite 7 + `vite-react-ssg` (per-route SSG)
- **UI:** React 19 + Tailwind 4 + shadcn/ui primitives (vendor layer
  in `src/components/ui/` — see its README)
- **Editor:** Monaco (lazy-loaded; bypassed in viewer-only mode for
  files >10 MB)
- **Parser:** `@streamparser/json` Tokenizer in a Comlink worker
- **State:** Zustand 4 + Immer
- **Tests:** vitest (unit + integration); Playwright dependency
  installed but suite not yet authored (soft blocker)

## Setup

Node version: **20.19.x** (pinned in `.nvmrc`, enforced via
`engines.node` in `package.json`).

```bash
nvm use            # or fnm use — reads .nvmrc
npm ci             # installs from package-lock.json (the source of truth)
```

Do not switch package manager without also updating `.nvmrc`,
`engines.node`, `packageManager`, and CI in lockstep. See
`CONTRIBUTING.md`.

## Running locally

```bash
npm run dev                       # editor app on http://localhost:5173
npm run dev -- --open /spikes/    # day-1 parser spike (see spikes/README.md)
```

For production-shape behavior, use the preview server — dev mode
adds React strict-mode double-invokes that mask state-machine bugs:

```bash
npm run build && npm run preview  # production bundle on http://localhost:4173
```

## Verify (the CI pipeline locally)

```bash
npm run typecheck          # tsc -b
npm run lint               # eslint . — includes type-aware bug-class rules
npm test -- --run          # vitest --run (373/374 passing as of 2026-05-25)
npm run build              # tsc -b && vite-react-ssg build
npm audit --audit-level=moderate
```

All five must be green. CI runs the same pipeline on every push +
PR via `.github/workflows/ci.yml`.

Smoke tests (manual, browser-required) live in
`launch-readiness-gate.md` under "Smoke protocols."

## Benchmarks

```bash
npm run bench:gen          # generates the default corpus
npm run bench:gen:all-dev  # all shape variants — ~2-3 GB on disk
SMOKE=1 npm test           # runs the gated 200MB smoke
```

Methodology — hardware, browser, fixtures, repro steps, measured
numbers — lives in `benchmarks/methodology.md`. That doc is the
canonical source for the public benchmark claims; reproduce there
before quoting numbers anywhere else.

Fixtures live in `benchmarks/corpus/` (gitignored beyond a couple of
small samples).

## Architecture (one-screen overview)

```
EditorToolbar  ──  Monaco / EmptyStateHero  ──  viewer-only placeholder
        │
documentStore.text / .file / .source
        │
parserHost  ── Comlink ──  parser.worker.ts  (streaming spine + stubs)
        │
viewStore.flat / .root / .sourceBlob / .closed / .expandingIds
        │
TreeView ─┬─ TreeNode rows (virtualized via react-window)
          ├─ SchemaPane  (Schema tab — separate worker)
          └─ TablePane   (top-level array view)
```

Two parallel string fields on every TreeNode:
- `id` = JSON Pointer (RFC 6901) — used as the key for every
  `Set` / `Map` / `WeakMap` that tracks node identity.
- `path` = JSONPath — used purely for display surfaces (drawer
  title, copy-path, breadcrumb).

See `src/lib/parser/identity.ts` for the rationale + escape rules,
and `src/lib/parser/pathological-keys.test.ts` for the 12 regression
cases that pin the collision-safety guarantee.

## Deploy

Target: Cloudflare Pages. Build command `npm run build`, publish
directory `dist`. Headers configured via `public/_headers`
(strict-ish CSP baseline; further tightening tracked in the launch
gate).

PWA / service worker are configured via `vite-plugin-pwa`. The SW
cache has burned several development sessions — when iterating on
production builds locally, **always** open DevTools → Application →
Service Workers → "Update on reload" before testing, or use an
incognito window.

Pre-deploy checklist lives in `launch-readiness-gate.md`'s
"Sign-off checklist" section.

## Troubleshooting

- **`tsc` errors mentioning `MonacoEnvironment` on `self`:**
  package-lock.json was likely modified by `npm audit fix --force`
  (downgrades Monaco to 0.53.0, a breaking change). Restore with
  `git checkout -- package.json package-lock.json && npm install`.
  The dompurify advisories are cleared via `overrides` in
  `package.json` — see `docs/dependency-overrides.md`.

- **Preview serves stale assets after a rebuild:** SW intercepted.
  DevTools → Application → Service Workers → Unregister; then
  Storage → "Clear site data"; then hard-reload. Incognito skips
  the dance.

- **`?url=` smoke fails locally with CORS:** the static-file server
  for fixtures needs `--cors`:
  ```bash
  cd benchmarks/corpus && npx serve -p 8001 --cors
  ```
  Then load
  `http://localhost:4173/?url=http://localhost:8001/<fixture>.json`.

- **Lint complains about `parserOptions.projectService`:** ensure
  Node and your editor's TS server agree on the `tsconfig` location.
  Lint excludes `spikes/` and `benchmarks/` from type-aware rules
  because they're not in the production tsconfig project.

## Contributing

See `CONTRIBUTING.md` for cadence rules (verify-then-continue,
commit-splitting convention) and commit-message style. tl;dr:
typecheck + tests + build must be green before each commit; one
conceptual change per commit unless splitting would create a
broken intermediate state.

## License

<!-- brand-pending: license decision lands with brand decision -->

(TBD — see `launch-readiness-gate.md` for the brand-cutover slice.)
