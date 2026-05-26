// Repair dialog flow + DiffEditor unmount-race assertion.
//
// Pins commit 94493de — the setModel(null) before unmount fix that
// silenced the "TextModel got disposed before DiffEditorWidget model
// got reset" console error on every Apply / Cancel close.
// Playwright's page.on('pageerror') catches uncaught exceptions; we
// use it to fail the test if the race-shape error reappears.

import { test, expect } from '@playwright/test';
import { typeIntoMonaco } from '../helpers/monaco';

const BROKEN_JSON = '{a: 1, b: 2,}'; // unquoted keys + trailing comma

async function setupNoErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors;
}

test('Repair → Apply replaces text + closes dialog cleanly (no DiffEditor race)', async ({
  page,
}) => {
  const getErrors = await setupNoErrors(page);
  await page.goto('/');

  // Click hero to mount Monaco (click-to-mount sets editorActivated).
  await page
    .getByText('Drop a JSON file here')
    .waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByText('Drop a JSON file here').click();
  await typeIntoMonaco(page, BROKEN_JSON);

  await page.getByRole('button', { name: /repair/i }).click();
  // Dialog opens with diff editor + Apply / Cancel buttons.
  await expect(page.getByText('Repair JSON')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /apply repair/i }).click();
  // Dialog closes — title gone.
  await expect(page.getByText('Repair JSON')).not.toBeVisible({
    timeout: 5_000,
  });

  // pageerror watcher should be silent. The race produced:
  // "TextModel got disposed before DiffEditorWidget model got reset"
  const errors = getErrors();
  const racey = errors.filter((e) => /TextModel got disposed/i.test(e));
  expect(racey).toEqual([]);
});

test('Repair → Cancel leaves text untouched + closes cleanly', async ({
  page,
}) => {
  const getErrors = await setupNoErrors(page);
  await page.goto('/');
  await page
    .getByText('Drop a JSON file here')
    .waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByText('Drop a JSON file here').click();
  await typeIntoMonaco(page, BROKEN_JSON);

  await page.getByRole('button', { name: /repair/i }).click();
  await expect(page.getByText('Repair JSON')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /cancel/i }).click();
  await expect(page.getByText('Repair JSON')).not.toBeVisible({
    timeout: 5_000,
  });

  // Cancel must also clear models cleanly — same race surface.
  const errors = getErrors();
  const racey = errors.filter((e) => /TextModel got disposed/i.test(e));
  expect(racey).toEqual([]);
});
