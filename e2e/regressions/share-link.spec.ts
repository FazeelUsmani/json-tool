// Share-link round-trip — pins the slice-B+C flow:
//   1. Load a sample → click Share → dialog shows a #json=… URL.
//   2. Navigate to that URL → editor loads the content + hash is
//      stripped (index.html's inline strip runs before React mount).
//
// Why pin: the strip + decode chain spans three files (index.html,
// useShareHashLoad.ts, share.ts). A refactor that drops the inline
// strip OR mis-wires the hook would silently break privacy (hash
// leaks to Plausible) or load (no content) — neither would show up
// in unit tests.

import { test, expect } from '@playwright/test';

test('Share round-trip: encode → navigate → decode + hash stripped', async ({
  page,
  context,
}) => {
  await page.goto('/');

  // Load the LLM JSON sample (root is an object, so no risk of empty-
  // array edge cases in the tree assertion later).
  await page.getByTestId('sample-llm-json').click();
  // Wait for tree to settle — a key from the sample.
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Click Share → dialog opens.
  await page.getByRole('button', { name: /share/i }).click();
  await expect(page.getByText('Share via URL')).toBeVisible({
    timeout: 5_000,
  });

  // The read-only input holds the full URL with #json=…
  const linkInput = page.getByTestId('share-link-input');
  await expect(linkInput).toBeVisible();
  const url = await linkInput.inputValue();
  expect(url).toMatch(/#json=[A-Za-z0-9+\-$_]+/);

  // Simulate a real recipient: open the share URL in a fresh tab via
  // context.newPage(). Reusing the existing page would only do a
  // hash-only navigation (same path, just adding a fragment), which
  // browsers treat as INTERNAL — no page reload, inline strip script
  // never re-runs, and the editor's pre-existing state masks whether
  // useShareHashLoad actually fired. A fresh tab forces a real
  // navigation + fresh HTML parse + inline script execution.
  const recipientPage = await context.newPage();
  await recipientPage.goto(url);

  // After mount on the fresh tab: useShareHashLoad reads
  // dataset.pendingShareText and populates the editor → tree shows
  // the decoded sample content.
  await expect(
    recipientPage.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Privacy assertion: the `#json=` fragment must be stripped from
  // the recipient's address bar — confirmed by reading
  // window.location.href directly (page.url() can lag behind
  // history.replaceState in some Playwright versions, but
  // location.href reflects the live state).
  const liveHref = await recipientPage.evaluate(() => window.location.href);
  expect(liveHref).not.toContain('#json=');

  await recipientPage.close();
});

test('Share link landing on a sub-route redirects to / + loads content', async ({
  page,
  context,
}) => {
  // Reviewer-caught bug (2026-05-26): useShareHashLoad used to mount
  // only on `/` (in App.tsx). The inline strip in index.html runs on
  // EVERY route, so `/json-viewer#json=…` would strip the hash, stash
  // the payload, and then no consumer would pick it up — payload
  // silently lost. Fix hoisted the hook to RootLayout (every route).
  // This spec pins the cross-route consume + redirect-to-/ behavior.
  await page.goto('/');
  await page.getByTestId('sample-llm-json').click();
  await expect(
    page.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /share/i }).click();
  const url = await page.getByTestId('share-link-input').inputValue();
  const hashStart = url.indexOf('#');
  expect(hashStart).toBeGreaterThan(-1);
  const hash = url.slice(hashStart);

  // Open on /json-viewer (an SEO sub-route, NOT /). Fresh tab so the
  // inline strip runs from scratch.
  const recipient = await context.newPage();
  await recipient.goto(`/json-viewer${hash}`);

  // Content loads in the editor — proves useShareHashLoad fired on
  // the sub-route via RootLayout mount.
  await expect(
    recipient.getByText('"summary"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // After consume, the hook navigates to `/` so the editor renders.
  // Verify via window.location.pathname (page.url() can lag behind
  // SPA navigations).
  const livePath = await recipient.evaluate(() => window.location.pathname);
  expect(livePath).toBe('/');
  // Hash is stripped too.
  const liveHref = await recipient.evaluate(() => window.location.href);
  expect(liveHref).not.toContain('#json=');

  await recipient.close();
});

test('Share button is disabled with empty document', async ({ page }) => {
  await page.goto('/');
  // Empty state hero is showing — no document loaded → Share
  // disabled. Need to click into the hero to mount Monaco first so
  // EditorToolbar (and therefore Share button) renders. Wait — the
  // toolbar is always present (it's a sibling of the hero, not a
  // child). Check disabled state directly.
  const shareButton = page.getByRole('button', { name: /share/i });
  await expect(shareButton).toBeDisabled();
});
