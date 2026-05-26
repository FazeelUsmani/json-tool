// Cold-load happy-path canary. Catches the "did we break the
// editor-mounts-and-parses?" class of regression.

import { test, expect } from '@playwright/test';

test('cold load → click Telemetry sample → tree pane populates', async ({
  page,
}) => {
  await page.goto('/');

  // Empty-state hero should be visible.
  await expect(page.getByText('Drop a JSON file here')).toBeVisible();

  // Sample buttons render with a stable data-testid because
  // getByRole('button', { name: /telemetry/ }) matches BOTH the
  // wrapping hero (role="button" for click-to-mount) and the
  // sample button itself — the hero's accessible-name computation
  // sucks in every descendant button's text.
  await page.getByTestId('sample-telemetry').click();

  // After the sample loads, documentStore.text is non-empty AND the
  // tree pane renders the parsed structure. The sample is an array of
  // event objects, each with a `timestamp` key — assert that as the
  // populated-tree canary.
  await expect(
    page.getByText('"timestamp"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });
});
