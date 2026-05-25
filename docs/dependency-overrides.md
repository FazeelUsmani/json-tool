# Dependency overrides

Tracks every entry in `package.json`'s `overrides` field with intent +
revert condition. The overrides field itself is a single source of
truth for npm; this file is the operational record so future
maintainers know *why* each pin exists and *when* it should be removed.

## `dompurify: ^3.4.5`

**Why:** `monaco-editor` (currently `^0.55.1`, the latest stable) and its
`next` channel (`0.56.0-dev-*`) both transit `dompurify@3.2.7`. That
version sits inside multiple moderate-severity advisory ranges (XSS via
`ADD_ATTR`, prototype pollution via `USE_PROFILES`, `SAFE_FOR_TEMPLATES`
bypass, etc. — all closed in `>=3.4.0`).

The override forces Monaco's transitive `dompurify` to resolve at
`^3.4.5` (the latest patched line as of 2026-05-25), which clears all
known advisories without changing Monaco itself.

**Why not the alternatives:**
- `npm audit fix --force` proposes downgrading Monaco to `0.53.0`,
  which removes `dompurify` entirely. That's a major Monaco version
  jump with API breakage (`self.MonacoEnvironment` typing changed
  between 0.53/0.55, verified locally). The override is strictly
  lighter-touch.
- Waiting for Monaco upstream to update its `dompurify` pin would
  block launch indefinitely — the `next` channel still references
  3.2.7 as of 2026-05-25.

**Smoke validation (2026-05-25):** Monaco's primary `dompurify`
consumer is the markdown hover renderer. Smoked manually after
applying the override:
- Editor mounts + JSON syntax highlights
- Hover over a JSON key → markdown hover renders sanitized
- HTML-looking values like `{"description": "<script>alert(1)</script>"}`
  display escaped, not executed
- JSON validation underlines fire on invalid input
- RepairDialog's `DiffEditor` mounts + diff renders cleanly
- 10MB+ file drop engages viewer-only fallback (Monaco skipped, tree
  pane renders normally)

**Revert condition:** When `monaco-editor`'s stable release bundles
`dompurify >= 3.4.0` upstream, drop this override. Track via:
- `npm view monaco-editor dependencies` (CI cron, manual check, or
  periodic dep-bump PR review)
- Monaco's [changelog](https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md)
  for the dompurify bump

Tracked as a polish-section item in `launch-readiness-gate.md`.

**Risk if compatibility breaks:** dompurify 3.4.x preserves
`DOMPurify.sanitize(html, opts)` API across the 3.x line, and
Monaco's usage is the standard `sanitize()` call. If something
breaks in practice, the fallback is the Monaco 0.53 downgrade path
(slice 4 Option B in the original design sketch).

**References:**
- Mahira's 2026-05-22 engineering assessment, §5 Red Flag + Suggested
  Improvement #7
- npm advisory database: [GHSA-v2wj-7wpq-c8vv](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv) and related
- `CHANGELOG.md` 2026-05-25 entry

## `qs: ^6.15.2`

**Why:** `qs@6.11.1` through `6.15.1` have a moderate-severity DoS:
`qs.stringify` crashes with `TypeError` on null/undefined entries in
comma-format arrays when `encodeValuesOnly` is set
([GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)).
Fixed in `6.15.2`.

The vulnerable `qs` reaches us through a dev-tool chain:
`shadcn → @modelcontextprotocol/sdk → express → qs`. shadcn is the UI
primitive CLI we ran to generate `src/components/ui/*`; the chain is
not in our runtime bundle. But raising the CI audit gate to
`--audit-level=moderate` (slice 4 close-out) means even dev-tree
advisories fail builds, so we close it at the source.

**Revert condition:** Drop this override when `shadcn` (or
`@modelcontextprotocol/sdk` / `express`) updates its `qs` pin to
`>=6.15.2` upstream. Tracked alongside the dompurify entry in
`launch-readiness-gate.md`.

**Risk:** `qs` is a small, stable utility — 6.15.x is a patch release
over 6.14.x with backwards-compatible semantics. Override is low-risk.

**Hygiene note (separate slice):** `shadcn` is currently in
`dependencies`, but it's a CLI tool used at codegen time only. Moving
it to `devDependencies` would be more accurate and shrink the runtime
audit surface. Not done here because it's orthogonal to the dompurify
fix.
