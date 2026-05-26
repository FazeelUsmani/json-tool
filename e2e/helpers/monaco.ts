// Shared Monaco interaction recipe for e2e specs. Lifts a brittle
// 3-step pattern that repair-dialog.spec.ts + schema-tab.spec.ts both
// needed in identical form:
//
//   1. waitFor `.monaco-editor .view-lines` to be visible — signals the
//      editor instance is fully mounted (the textarea is attached
//      earlier but Monaco's onFocus listeners are wired on the editor
//      container, not the raw textarea).
//   2. Click the editor surface — Monaco's mousedown handler focuses
//      the textarea + positions the cursor. Programmatic `.focus()`
//      on the off-screen textarea doesn't reliably trigger Monaco's
//      onFocus listeners.
//   3. `keyboard.insertText` (CDP `Input.insertText`) — bypasses
//      per-key dispatch so Monaco's auto-bracket-pair doesn't fire
//      on leading `{` and mangle the input.
//
// Without this helper, every new spec that types into Monaco
// re-derives this 3-step recipe and the timing-windows trap shows up
// again. Centralizing means the recipe lives in one place and any
// future Monaco-version-specific tweak only edits this file.

import type { Page } from '@playwright/test';

export async function typeIntoMonaco(page: Page, text: string): Promise<void> {
  await page
    .locator('.monaco-editor .view-lines')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.insertText(text);
}
