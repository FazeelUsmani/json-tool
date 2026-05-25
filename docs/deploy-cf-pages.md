# Deploy: Cloudflare Pages

Quickstart runbook for shipping `json-tool` to a Cloudflare Pages site under a brand domain. The 2026-05-22 engineering assessment flagged "no deploy manifest/runbook" as a Production Readiness gap; this fills that gap.

## Prerequisites

- Brand domain registered (gated; see `PLAN.MD` line 102)
- Cloudflare account with Pages access
- GitHub repo connected to Cloudflare Pages (one-time setup)
- Node `20.19+` or `22.x` (matches `.nvmrc`)

## One-time setup

### 1. Create the Pages project

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
2. Repository: `fazeelai/json-tool`
3. Production branch: `main`
4. Build settings:
   - **Framework preset**: None (we drive the build manually)
   - **Build command**: `pnpm install --frozen-lockfile && pnpm build`
     - If using npm: `npm ci && npm run build`
     - Pick one and align with the lockfile in the repo
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Environment variables (none required for the static build)

### 2. Bind the brand domain

After the first successful build:

1. Pages project → Custom domains → Add a custom domain
2. Add `<brand>.dev` (or the chosen TLD)
3. Cloudflare auto-issues the TLS cert via SSL/TLS → Edge Certificates
4. Verify `https://<brand>.dev` resolves and shows the production build

### 3. Flip robots + sitemap at brand cutover

Once the brand domain is live:

1. Edit `public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://<brand>.dev/sitemap.xml
   ```
2. Add `public/sitemap.xml` with the 4 SEO routes:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url><loc>https://<brand>.dev/</loc></url>
     <url><loc>https://<brand>.dev/json-viewer</loc></url>
     <url><loc>https://<brand>.dev/large-json-viewer</loc></url>
     <url><loc>https://<brand>.dev/ndjson-viewer</loc></url>
     <url><loc>https://<brand>.dev/json-repair</loc></url>
   </urlset>
   ```
3. Submit `https://<brand>.dev/sitemap.xml` to Google Search Console.

### 4. Verify security headers landed

After deploy, check that `public/_headers` made it through:

```bash
curl -sI https://<brand>.dev/ | grep -iE "content-security-policy|strict-transport-security|cross-origin-opener|x-frame-options|x-content-type|referrer-policy|permissions-policy"
```

Expect all seven headers. Lighthouse Best Practices score should jump from ~77 (local preview, no headers) to ~95 (deployed with the full set).

## Per-release flow

Every push to `main` triggers a Cloudflare Pages build. To verify:

1. Watch the build in Cloudflare dashboard → Pages → `json-tool` → Deployments
2. Click into the latest deployment → tail the build log
3. Once live, smoke-check the prod URL:
   - `/` loads with the empty-state hero
   - `/json-viewer` (and the other 3 SEO routes) render with their content
   - Drop a small JSON file → tree renders
   - Drop a 200 MB telemetry fixture → viewer-only mode kicks in, tree populates
4. Re-run Lighthouse via DevTools panel against the prod URL — Performance/SEO/Best Practices should match or exceed local-preview scores

## Rollback

Cloudflare Pages keeps every deployment. To roll back:

1. Deployments tab → find a known-good past deployment
2. Three-dot menu → **Promote to production**
3. Live within ~30 seconds

This bypasses Git, so remember to also revert the offending commit on `main` (or roll forward with a fix) before the next deploy automatically supersedes the promoted older one.

## Known gaps / TODOs before flipping public

These need to land before the repo flips public on launch day (cross-reference `launch-readiness-gate.md`):

- [ ] CI workflow gating `main` (currently no CI runs before Pages deploys)
- [ ] `npm audit` clean (or accept-and-document for remaining moderates)
- [ ] DOMPurify/Monaco transitive vulns resolved (requires Monaco breaking upgrade — separate slice with browser smoke)
- [ ] `?url=` streaming refactor (current `response.text()` defeats the streaming architecture)
- [ ] Path-IDs collision fix (JSONPath-as-identity breaks on keys with `.`, `[`, `]`, duplicates)
- [ ] Playwright e2e smoke against the prod URL (different env than local)
- [ ] CSP report endpoint (`Content-Security-Policy-Report-Only` line + a worker route to collect)

## Why Cloudflare Pages

- Built-in TLS + custom domain + edge cache
- Headers honored via `public/_headers`
- Free tier covers expected M1 traffic
- Matches the "100% client-side / no upload" privacy posture — no backend to maintain
- Generous build minutes for the small static bundle

Alternative: Vercel (similar shape; `vercel.json` for headers), or GitHub Pages (limited; no `_headers` support, no edge functions). Cloudflare is the recommended target.
