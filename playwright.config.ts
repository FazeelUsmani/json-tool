// Playwright config for the e2e smoke + regression suite.
//
// Targets `npm run preview` (production build) rather than `npm run dev`
// because the manual smoke protocol in launch-readiness-gate.md is also
// preview-based — dev mode adds React strict-mode double-invokes that
// mask state-machine bugs. Keeping the two surfaces aligned.
//
// Scope is deliberately small: smoke happy-path + the two regressions
// caught manually on 2026-05-25 (TablePane peek-by-id, ?url= synchronous
// strip before Plausible). The fuller surface (drop / repair / schema
// / viewer-only / SEO routes / PWA) is queued as a separate slice; see
// launch-readiness-gate.md "Playwright e2e smoke" entry.
//
// CI integration: workflow_dispatch only (.github/workflows/e2e.yml) so
// the ~150MB browser install + ~3-5min test runtime don't slow the main
// CI gate. Promote to on-PR once the suite is proven stable.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Forbid `.only` in CI — easy to forget locally, masks half the suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report' }], ['github']]
    : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // Boots `vite preview` automatically. Reuses an existing server
  // locally (faster iteration); always starts fresh in CI.
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  // Chromium-only for the smoke. Matches the manual smoke protocol;
  // multi-browser coverage is a follow-up if cross-browser regressions
  // become a real concern.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
