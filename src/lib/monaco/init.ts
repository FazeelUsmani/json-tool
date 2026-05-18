// Monaco loader + worker configuration. Idempotent. Imported and called by
// MonacoPane (which is itself lazy-loaded), so the eager `monaco-editor`
// import only lands when the editor is actually about to render.
//
// What this does:
//
//   1. Pins Monaco to the bundled package (not the CDN default). Required
//      for offline use + the "100% client-side, your JSON never leaves
//      your browser" claim — a CDN-hosted Monaco would route load through
//      a third party.
//
//   2. Routes worker requests to local module workers. Only spawns the
//      default editor worker + the JSON language worker — never the
//      TypeScript / HTML / CSS workers. Saves runtime memory and avoids
//      "starting language service…" overhead the user can feel.
//
//   3. Disables TS / JS diagnostics (we don't author those languages here).
//
//   4. Configures JSON: tokenizer-level syntax errors stay on (we WANT
//      "show me where my JSON is broken" — that's a launch-feature). No
//      schemas are registered and remote schema fetching is off (would
//      break the privacy claim).

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { jsonDefaults } from 'monaco-editor/esm/vs/language/json/monaco.contribution';
import { loader } from '@monaco-editor/react';

let initialized = false;

export function initMonaco(): void {
  if (initialized) return;
  initialized = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new JsonWorker();
      return new EditorWorker();
    },
  };

  loader.config({ monaco });

  // TS/JS diagnostics are not configured here because we never assign those
  // languages to a Monaco model. Without a model in language='typescript'
  // (etc.) the TS worker never spawns, so the defaults don't matter at
  // runtime. The bundle still ships the chunks — see the tree-shake TODO.

  jsonDefaults.setDiagnosticsOptions({
    validate: true,           // keep syntax-level red squigglies on bad JSON
    allowComments: false,
    schemas: [],              // no JSON Schema validation
    enableSchemaRequest: false, // no remote fetch — preserves privacy claim
  });
}

// TODO(M1 W3+): tree-shake Monaco imports to drop ts.worker / css.worker /
// html.worker chunks from dist/. Currently they ship (~8MB combined) but
// never load at runtime because MonacoEnvironment.getWorker only routes to
// editor + json workers. Runtime memory cost: zero. Bundle cost: ~8MB of
// dead JS in dist/assets/. Fix: switch the main import to
// `monaco-editor/esm/vs/editor/editor.api` and import only the JSON
// language contribution explicitly.
