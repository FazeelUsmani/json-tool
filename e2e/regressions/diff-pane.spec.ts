// Diff tab round-trip: load a sample, switch to Diff, paste a
// modified version, run diff, click a result row, assert Tree tab
// activates. Pins the M2 differentiator #2 surface — semantic diff
// in the UI (not just the lib).

import { test, expect } from '@playwright/test';

// LLM-JSON sample's shape (root = object with summary, intent, etc.).
// Modified version flips `intent` value + adds a new key `new_field`
// + removes `confidence`. Should produce: 1 value-changed
// (`/intent`) + 1 added (`/new_field`) + 1 removed (`/confidence`).
const MODIFIED_LLM_JSON = JSON.stringify({
  summary:
    'User asked about pricing for the Pro plan and how to upgrade from Basic.',
  intent: 'billing.cancel', // value-changed from "billing.upgrade"
  categories: ['pricing', 'upgrade', 'pro-plan'],
  // confidence: 0.92 — REMOVED
  sentiment: 'neutral',
  sources: [
    { url: '/pricing', snippet: 'Pro plan is $20/month, billed annually...' },
    {
      url: '/faq/upgrades',
      snippet: 'Upgrading is instant — prorated for the current period.',
    },
  ],
  suggested_action: 'show_pricing_page',
  follow_up_questions: [
    'Would you like to start a 14-day trial?',
    'Do you want help comparing plans?',
  ],
  new_field: 'this is added in the compared version', // added
});

test('Diff: paste modified JSON → result list → click jumps to Tree', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('sample-llm-json').click();
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Switch to Diff tab.
  await page.getByRole('tab', { name: /^diff$/i }).click();

  // Paste modified JSON into the textarea + click Run diff.
  await page.getByTestId('diff-paste-input').fill(MODIFIED_LLM_JSON);
  await page.getByRole('button', { name: /run diff/i }).click();

  // At least one diff result row should appear (value-changed,
  // added, or removed). The summary chips render right after Run
  // diff so the regex captures "1 value-changed" etc.
  await expect(
    page.locator('text=/\\d+\\s*(added|removed|value-changed|type-changed)/').first(),
  ).toBeVisible({ timeout: 2_000 });

  // Click the first diff result row → tab flips to Tree.
  await page.getByTestId('diff-result-row').first().click();
  await expect(
    page.getByRole('tab', { name: /tree/i }),
  ).toHaveAttribute('data-state', 'active', { timeout: 2_000 });
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

  // Status indicator shows the baseline-direction labelling.
  await expect(
    page.getByText(/comparing baseline.*→ current document/i),
  ).toBeVisible({ timeout: 2_000 });

  // Clear baseline → status chip disappears, Save button reappears.
  await page.getByTestId('diff-clear-baseline').click();
  await expect(saveButton).toBeVisible({ timeout: 2_000 });
});

test('Diff: parse-error on invalid pasted JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('sample-llm-json').click();
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  await page.getByRole('tab', { name: /^diff$/i }).click();
  await page.getByTestId('diff-paste-input').fill('{not valid json');
  await page.getByRole('button', { name: /run diff/i }).click();

  // Inline parse-error message should appear (not just a silent fail).
  await expect(
    page.getByText(/could not parse pasted json/i),
  ).toBeVisible({ timeout: 2_000 });
});
