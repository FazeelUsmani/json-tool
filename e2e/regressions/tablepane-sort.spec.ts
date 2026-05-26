// Pins commit ddbfeef — the TablePane sort comparator used the stale
// `node.path` to peek the row cache after the Phase 3 identity
// migration (c05d030) had switched the cache key to `node.id`. Every
// stub-backed row missed the cache, fell through to the
// null-at-end policy, and silently stacked at one end.
//
// The fixture is a 20-line NDJSON file with stub-backed rows (each row
// contains `nested.a.b` which is past MAX_SPINE_DEPTH=2 → stubs). We
// serve it via page.route() instead of putting it under public/ so the
// fixture doesn't ship in the production bundle.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Absolute URL — fetchUrl runs new URL(url) which throws on relative.
const FIXTURE_URL = 'http://localhost:4173/__e2e_fixtures__/stub-backed-table.ndjson';
const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/stub-backed-table.ndjson', import.meta.url),
);

test('TablePane sort on stub-backed NDJSON produces real order, not null-bucket', async ({
  page,
}) => {
  // Serve the fixture via a route mock on the preview origin's
  // virtual path. content-type must match fetchUrl.ts's allowlist
  // (it accepts application/x-ndjson + application/jsonlines +
  // text/plain).
  await page.route(FIXTURE_URL, async (route) => {
    const body = await readFile(FIXTURE_PATH, 'utf8');
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body,
    });
  });

  // Use the ?url= pre-fill flow — populates the URL input, user clicks
  // Load to fire the fetch. Avoids needing a real <input type=file>
  // (the empty-state hero doesn't have one) or DataTransfer
  // synthesis (brittle DOM-coupling).
  await page.goto(`/?url=${encodeURIComponent(FIXTURE_URL)}`);

  // The URL input is pre-filled; press Enter to trigger the load.
  await page.getByPlaceholder('Load from URL…').focus();
  await page.keyboard.press('Enter');

  // Wait for the tree to populate. The NDJSON parses to a synthetic
  // root array; tree pane shows row indices.
  await expect(page.getByText('[0]', { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });

  // Switch to Table tab.
  await page.getByRole('tab', { name: /table/i }).click();

  // Table headers should include the fixture's columns: id, name,
  // score, nested. (nested column may render as `{…}` placeholder.)
  // TablePane renders headers as `<button>` elements (no <th> markup
  // → no implicit columnheader role). Each column has a unique header
  // name so the button selector is unambiguous. Full table-ARIA
  // (role=table/row/cell/columnheader wrapping) is a separate a11y
  // concern, filed as a follow-up.
  await expect(page.getByRole('button', { name: /score/i })).toBeVisible();

  // Click the `score` header to sort ascending.
  await page.getByRole('button', { name: /score/i }).click();

  // After sort, the first three visible rows' `score` cells should be
  // in ascending order. With the bug, all rows would clump at the
  // null-at-end bucket (every cell appears in input order, not sorted).
  //
  // The fixture's scores are (i * 137) % 100 for i in [0,20):
  //   [0, 37, 74, 11, 48, 85, 22, 59, 96, 33, 70, 7, 44, 81, 18, 55, 92, 29, 66, 3]
  // Sorted ascending: [0, 3, 7, 11, 18, 22, ...].
  // First two visible row values (in cell display order) should be
  // strictly the smallest two: 0 then 3.
  const firstScoreCell = page
    .getByRole('cell')
    .filter({ hasText: /^\d+$/ })
    .first();
  // Read several score cells to make the assertion resilient to row
  // layout. Take first three numeric cells from the score column.
  const scoreCells = page
    .locator('[role="cell"]')
    .filter({ hasText: /^\d+$/ });
  await expect(firstScoreCell).toBeVisible();

  // Extract first 3 score values (the first column's first 3 rows).
  // Note: cell layout depends on column order; we use a robust
  // approach — find cells whose text is the literal expected values
  // 0 and 3 (the two smallest) and assert they appear ahead of larger
  // values like 96 or 92 in DOM order.
  const allScoreTexts = await scoreCells.evaluateAll((nodes) =>
    nodes.slice(0, 30).map((n) => n.textContent?.trim() ?? ''),
  );
  const numericScores = allScoreTexts
    .map((t) => Number(t))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 99);

  // The bug: numericScores would be in the original ndjson line order
  // [0, 37, 74, 11, 48, 85, ...], with `0` happening to be first by
  // coincidence. To detect the bug reliably, check that the SECOND
  // score is one of the two smallest (3 or 7), not the original
  // index-1 value of 37.
  expect(numericScores.length).toBeGreaterThanOrEqual(3);
  expect(numericScores[0]).toBe(0); // smallest, sorts to top under either path
  expect([3, 7]).toContain(numericScores[1]); // the bug case would put 37 here
});
