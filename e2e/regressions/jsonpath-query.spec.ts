// JSONPath query pane round-trip: open Query tab, type a query that
// matches the loaded sample, click a result, assert tree tab activates.
// Closes the "explicit cut, then uncut" feature loop from §7 SI #2 —
// JSONPath landed in M1 per user direction 2026-05-26.

import { test, expect } from '@playwright/test';

test('Query: type JSONPath → match count + click result jumps to tree', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('sample-telemetry').click();
  // Wait for tree to populate — Telemetry sample's top-level array
  // of event objects, each carrying `timestamp`.
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Open Query tab.
  await page.getByRole('tab', { name: /query/i }).click();

  // Type a JSONPath. `$..timestamp` descends to every `timestamp`
  // leaf; the sample has 4 event objects → 4 matches.
  const input = page.getByPlaceholder(/events/i);
  await input.fill('$..timestamp');

  // Debounce is 200ms — give the result count up to 2s to settle.
  // Match count is rendered as e.g. "4 matches" or "1 match" so the
  // regex stays robust against minor copy tweaks.
  await expect(
    page.locator('text=/[1-9]\\d*\\s*match/').first(),
  ).toBeVisible({ timeout: 2_000 });

  // At least one result row should be clickable.
  const firstResult = page.getByTestId('query-result-row').first();
  await expect(firstResult).toBeVisible();
  await firstResult.click();

  // Click handler switches the active tab to Tree so the focused
  // row is visible after the existing auto-scroll effect fires.
  // Radix Tabs marks the active trigger with data-state="active".
  await expect(
    page.getByRole('tab', { name: /tree/i }),
  ).toHaveAttribute('data-state', 'active', { timeout: 2_000 });
});

test('Query: tab is disabled until JSON is loaded', async ({ page }) => {
  await page.goto('/');
  // Empty state hero is showing — no document loaded → Query
  // disabled (root === null guard in RightPane).
  const queryTab = page.getByRole('tab', { name: /query/i });
  await expect(queryTab).toBeDisabled();
});
