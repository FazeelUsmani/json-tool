// Pins commit ddbfeef — the synchronous `<head>` script that strips
// `?url=` from window.location BEFORE Plausible's deferred script
// evaluates. The earlier slice-3.5 useEffect-based strip ran AFTER
// Plausible's auto-pageview captured the URL; this suite asserts the
// strip is timing-correct at two levels:
//
//   1. The address bar no longer shows `?url=` after page-load resolves
//      (basic correctness).
//   2. The exact URL that any third-party script in <head> sees during
//      its initial evaluation does NOT contain `?url=` — the real
//      privacy guarantee we're claiming.
//
// (2) is implemented by intercepting Plausible's script URL and
// returning a tiny stand-in that captures window.location.href at the
// moment of script-eval (= the moment the real Plausible would have
// read it for its pageview event). That stand-in writes to a global
// the test can read. Plausible's real tracker ignores localhost so we
// can't observe its real network behavior here — this route-mock is
// the load-bearing measurement.

import { test, expect } from '@playwright/test';

test('?url= is stripped from address bar before page-load resolves', async ({
  page,
}) => {
  await page.goto('/?url=https://example.com/test.json');
  // page.goto resolves on the `load` event — by that point both the
  // inline <head> strip and React mount have happened. The address
  // bar should no longer carry the param.
  expect(page.url()).not.toContain('?url=');
  expect(page.url()).not.toContain('test.json');
});

test('?url= is gone from window.location BEFORE any third-party <head> script reads it', async ({
  page,
}) => {
  // Intercept the real Plausible script URL with a tiny stand-in that
  // captures window.location.href at the moment of evaluation. This
  // simulates exactly what the real Plausible tracker would have seen
  // when it fired its auto-pageview.
  await page.route('**/plausible.io/js/script.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.__urlAtThirdPartyEval = window.location.href;`,
    });
  });

  await page.goto('/?url=https://example.com/test.json');
  await page.waitForLoadState('networkidle');

  // The stand-in writes to __urlAtThirdPartyEval at the moment its
  // <script defer> tag would have executed — which is AFTER the
  // inline <head> strip but BEFORE the React mount. That's the
  // window where the bug used to leak.
  const url = await page.evaluate(
    () =>
      (window as unknown as { __urlAtThirdPartyEval?: string })
        .__urlAtThirdPartyEval,
  );
  expect(url).toBeDefined();
  expect(url).not.toContain('?url=');
  expect(url).not.toContain('test.json');
});

test('URL input is pre-filled with the original ?url= value after strip', async ({
  page,
}) => {
  // The other side of the slice-3.5 contract: stripping the param from
  // window.location must NOT lose the value — it gets stashed on
  // document.documentElement.dataset.pendingUrl for EditorToolbar to
  // pre-fill the URL input. Without this, the user would see an empty
  // input and wonder why their share-link didn't load anything.
  await page.goto('/?url=https://example.com/some-data.json');

  const input = page.getByPlaceholder('Load from URL…');
  await expect(input).toHaveValue('https://example.com/some-data.json');
});

test('?url= happy path: pre-fill → press Enter → fetch + tree populates', async ({
  page,
}) => {
  // Full URL-load flow end-to-end against a Playwright-mocked endpoint.
  // The oversize / no-Content-Length cases are covered by fetchUrl
  // unit tests; this spec covers the integrated load path.
  //
  // FIXTURE must be ABSOLUTE — fetchUrl runs `new URL(url)` which
  // throws on relative paths and returns { kind: 'invalid-url' }
  // before the route mock ever fires.
  const FIXTURE = 'http://localhost:4173/__e2e_fixtures__/url-load.json';
  await page.route(FIXTURE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hello: 'from-url', items: [1, 2, 3] }),
    });
  });
  await page.goto(`/?url=${encodeURIComponent(FIXTURE)}`);
  await page.getByPlaceholder('Load from URL…').focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('"hello"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });
});
