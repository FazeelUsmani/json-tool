// Schema tab first-click infer + stale-refresh flow.
//
// The Schema pane defers inference until first click (heavy walk for
// large trees; pointless if user never opens the tab). After first
// click the result caches; subsequent edits to the tree raise a
// staleness dot on the Refresh button.

import { test, expect } from '@playwright/test';

test('Schema tab: first click triggers inference + renders output', async ({
  page,
}) => {
  await page.goto('/');
  // Load a sample to populate the tree (so schema inference has
  // something to walk).
  await page.getByTestId('sample-telemetry').click();

  // Wait for tree to settle.
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Click Schema tab.
  await page.getByRole('tab', { name: /schema/i }).click();

  // First-click inference: should produce some output. The Schema
  // emitter output starts with `{` (JSON Schema is the default sub-tab).
  // Use a flexible text matcher because the exact output depends on
  // the sample shape.
  await expect(
    page.getByText(/"\$schema"|type|properties/).first(),
  ).toBeVisible({ timeout: 10_000 });
});

test('Schema tab: edit text → staleness dot appears on Refresh', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('sample-telemetry').click();
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Trigger first inference so there's a cached result to go stale.
  await page.getByRole('tab', { name: /schema/i }).click();
  await expect(
    page.getByText(/"\$schema"|type|properties/).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Switch back to Tree tab to make the editor visible, type a char
  // to invalidate. (Tree pane is the default; tab change triggers
  // re-render but doesn't unmount Monaco.)
  await page.getByRole('tab', { name: /tree/i }).click();
  // Click Monaco's editor surface to focus its textarea via the
  // editor's own mousedown handler — programmatic .focus() on the
  // off-screen textarea doesn't fire onFocus listeners on the editor
  // instance reliably. Wait for .view-lines first so the editor is
  // fully mounted before we click.
  await page.locator('.monaco-editor .view-lines').first().waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  await page.locator('.monaco-editor').first().click();
  // insertText goes through CDP's Input.insertText — bypasses Monaco's
  // auto-bracket-pair (irrelevant for a space, but consistent with the
  // repair-dialog typing pattern).
  await page.keyboard.insertText(' ');

  // Schema tab's Refresh button should now show stale-dot.
  // The button's title attribute changes to "Tree has changed since
  // last inference — click to update" when stale.
  await page.getByRole('tab', { name: /schema/i }).click();
  await expect(
    page.getByRole('button', { name: /refresh/i }),
  ).toHaveAttribute('title', /click to update/i, { timeout: 5_000 });
});
