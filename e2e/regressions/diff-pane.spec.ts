// Diff tab integration: load a sample, switch to Diff, assert
// Monaco DiffEditor mounts. The minimal v3 UI doesn't have a Run
// diff button, baseline UI, or chip strip — Monaco renders the
// textual diff automatically as the modified pane content changes.

import { test, expect } from '@playwright/test';

test('Diff: Monaco DiffEditor mounts when tab is opened with loaded JSON', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('sample-llm-json').click();
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Switch to Diff tab.
  await page.getByRole('tab', { name: /^diff$/i }).click();

  // Monaco DiffEditor mounts (lazy-loaded; allow ~10s for the chunk).
  await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({
    timeout: 10_000,
  });

  // Both editor panes are present (original + modified, side-by-side).
  await expect(
    page.locator('.monaco-diff-editor .editor.original').first(),
  ).toBeVisible();
  await expect(
    page.locator('.monaco-diff-editor .editor.modified').first(),
  ).toBeVisible();

  // Pane headers label which side accepts input. Multiple matches
  // for "paste your json here" exist (header label + overlay),
  // so use .first() to disambiguate.
  await expect(page.getByText(/original/i).first()).toBeVisible();
  await expect(page.getByText(/paste your json here/i).first()).toBeVisible();
});

test('Diff: tab disabled until JSON is loaded', async ({ page }) => {
  await page.goto('/');
  const diffTab = page.getByRole('tab', { name: /^diff$/i });
  await expect(diffTab).toBeDisabled();
});
