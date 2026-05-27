// Diff tab integration: load a sample, switch to Diff, assert Monaco
// DiffEditor mounts + baseline save/compare/clear flow works. Pins
// the M2 differentiator #2 surface — semantic diff in the UI (not
// just the lib).
//
// What's NOT here: paste-into-Monaco assertions. Monaco DiffEditor's
// modified-side textarea is interaction-flaky in Playwright (decoration
// spans intercept clicks, multiple textareas per editor for IME/a11y).
// Parse-error rendering + chip-count rendering are covered by the
// diff/semantic.test.ts unit tests; visual-diff correctness is
// upstream Monaco surface and validated by manual smoke.

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

  // Run diff button + Save-baseline button visible.
  await expect(page.getByTestId('diff-run')).toBeVisible();
  await expect(page.getByTestId('diff-save-baseline')).toBeVisible();

  // "Before" indicator labels the comparison.
  await expect(page.getByText(/before:.*currently loaded document/i)).toBeVisible();
});

test('Diff: tab disabled until JSON is loaded', async ({ page }) => {
  await page.goto('/');
  const diffTab = page.getByRole('tab', { name: /^diff$/i });
  await expect(diffTab).toBeDisabled();
});

test('Diff: save baseline → compare-to-baseline → clear', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('sample-llm-json').click();
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  await page.getByRole('tab', { name: /^diff$/i }).click();

  // Initially: no baseline saved → "Save current as baseline" button.
  const saveButton = page.getByTestId('diff-save-baseline');
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  // After save: status chip appears + Compare/Replace/Clear actions.
  await expect(
    page.getByTestId('diff-baseline-section').getByText(/baseline saved/i),
  ).toBeVisible({ timeout: 2_000 });
  const compareButton = page.getByTestId('diff-compare-baseline');
  await expect(compareButton).toBeVisible();

  // Compare current to baseline (just saved → should be identical).
  await compareButton.click();

  // Direction indicator labels the baseline-mode comparison.
  await expect(
    page.getByText(/comparing baseline.*current document/i),
  ).toBeVisible({ timeout: 5_000 });

  // "Before" indicator switches from "currently loaded document" to "baseline (saved …)".
  await expect(
    page.getByText(/before:.*baseline.*saved/i),
  ).toBeVisible({ timeout: 2_000 });

  // Clear baseline → status chip disappears, Save button reappears.
  await page.getByTestId('diff-clear-baseline').click();
  await expect(saveButton).toBeVisible({ timeout: 2_000 });
});
