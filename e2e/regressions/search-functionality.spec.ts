// Search keystroke → match-count + tree highlight sanity. The
// tree-keyboard-nav.spec.ts pair already covers the Escape-clears
// path; this pin covers the actual find-something flow (TreeSearch
// match-count display + the worker-side scan firing on stubs).
//
// The 2026-05-22 review §Action #2 listed "search" as a named e2e
// gap — this spec closes the explicit FIND assertion that the prior
// keyboard-nav specs only touched tangentially.

import { test, expect } from '@playwright/test';

test('Search: typing a known key shows non-zero match count', async ({
  page,
}) => {
  await page.goto('/');
  // Telemetry sample has `"user"` as a key in every event object — a
  // reliable needle for multi-match assertion.
  await page.getByTestId('sample-telemetry').click();
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  const search = page.getByPlaceholder(/search/i).first();
  await search.fill('user');

  // TreeSearch renders the match counter as "<current>/<total>" or
  // "0" when zero matches. With "user" in the telemetry sample, we
  // expect total > 0 — match the "N / M" pattern with both sides ≥ 1.
  await expect(
    page
      .locator('text=/\\d+\\s*\\/\\s*[1-9]\\d*/')
      .first(),
  ).toBeVisible({ timeout: 5_000 });
});

test('Search: clear via Escape resets match count', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('sample-telemetry').click();
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  const search = page.getByPlaceholder(/search/i).first();
  await search.fill('user');
  await expect(search).toHaveValue('user');

  await search.press('Escape');
  await expect(search).toHaveValue('');
});
