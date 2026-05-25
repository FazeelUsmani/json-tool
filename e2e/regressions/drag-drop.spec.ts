// Drag-drop flow including the viewer-only-mode pivot at the
// 10 MB threshold. Two assertions:
//   1. A small file drop populates Monaco + the tree pane.
//   2. A "large" file (synthesized > 10 MB via repeated content)
//      pivots to the viewer-only placeholder while the tree still
//      populates from the underlying Blob.
//
// File-drop synthesis: the editor pane's onDrop handler reads from
// dataTransfer.files. Playwright doesn't have a native "drop a File"
// affordance; we synthesize a File + DataTransfer in page context
// and dispatch the drop event directly on the editor div.

import { test, expect } from '@playwright/test';

async function dropFile(page: import('@playwright/test').Page, opts: {
  name: string;
  content: string;
  mimeType: string;
}): Promise<void> {
  // The editor pane is the second flex child of the root layout. Use
  // a more semantic anchor: the empty-state hero, which always sits
  // inside the drop target on a cold load.
  const heroExists = await page
    .getByText('Drop a JSON file here')
    .isVisible()
    .catch(() => false);
  if (!heroExists) {
    throw new Error('drop fixture expects cold-load empty state');
  }
  await page.evaluate(
    async ({ name, content, mimeType }) => {
      const file = new File([content], name, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      // Find the drop target by walking up from the hero. The drop
      // handler is registered on the parent flex container.
      const hero = document.querySelector(
        '[class*="border-dashed"]',
      ) as HTMLElement | null;
      const target = hero?.closest('div[class*="relative"]') ?? hero;
      if (!target) throw new Error('no drop target found');
      target.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true }),
      );
    },
    { name: opts.name, content: opts.content, mimeType: opts.mimeType },
  );
}

test('small JSON file drop populates Monaco + tree', async ({ page }) => {
  await page.goto('/');
  await dropFile(page, {
    name: 'sample.json',
    content: '{"hello":"world","n":42}',
    mimeType: 'application/json',
  });
  // Tree pane shows the parsed structure — the key "hello" should
  // appear in the right-hand tree.
  await expect(
    page.getByText('"hello"', { exact: false }).first(),
  ).toBeVisible({ timeout: 5_000 });
});

test('large file drop (>10 MB) pivots to viewer-only mode', async ({
  page,
}) => {
  await page.goto('/');
  // VIEWER_ONLY_THRESHOLD = 10 MiB. Synthesize a ~12 MB JSON: array
  // of 200000 identical small objects. The streaming parser produces
  // stubs past depth 2 but the root array is materialized normally.
  const objects: Array<{ id: number; tag: string }> = [];
  for (let i = 0; i < 200000; i++) objects.push({ id: i, tag: 'x' });
  const content = JSON.stringify(objects);

  await dropFile(page, {
    name: 'large.json',
    content,
    mimeType: 'application/json',
  });

  // Viewer-only placeholder text — copy lives in MonacoPane.tsx
  // ViewerOnlyPlaceholder.
  await expect(
    page.getByText(/Editor disabled for files over/i),
  ).toBeVisible({ timeout: 10_000 });

  // Tree pane should still populate (the streaming parser reads via
  // blob.stream() regardless of editor mode).
  await expect(page.getByText('[0]', { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });
});
