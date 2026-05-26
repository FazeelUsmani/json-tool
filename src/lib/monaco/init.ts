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

// Import from `editor.api` (not the bulk `monaco-editor` entry) so the
// JS/TS/CSS/HTML language modules + their workers don't get pulled
// into the bundle. We only configure JSON — the JSON contribution is
// imported explicitly below. Prior to this tree-shake the production
// bundle shipped ~9MB of dead chunks (ts.worker 7MB, css.worker 1MB,
// html.worker 693KB, plus ~30 obscure language modules) that never
// executed at runtime because MonacoEnvironment.getWorker only routes
// to editor + json workers.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
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
    // Trusted Types policy hook (2026-05-25). When the page's CSP
    // includes `require-trusted-types-for 'script'`, the browser
    // refuses to set `innerHTML` (and similar sinks) with a plain
    // string — the value must be a TrustedHTML produced by a
    // registered policy. Monaco uses `innerHTML` internally for its
    // editor, diff editor, hover widgets, and suggestion list; this
    // hook routes Monaco's policy requests through the browser's
    // TrustedTypes API so the editor doesn't throw on every render.
    //
    // The policies are pass-through (no sanitization) because Monaco
    // owns the HTML it generates — none of it derives from
    // user-supplied JSON values (those render as plain text in the
    // editor + as text content in the tree pane). The security
    // guarantee comes from the CSP itself: `require-trusted-types-for`
    // catches accidental `innerHTML` writes ANYWHERE ELSE in our app
    // or in transitively-loaded code that doesn't register a policy.
    //
    // CSP allowlist lives in public/_headers (`trusted-types`
    // directive). Add new policy names there whenever Monaco bumps
    // its internal policy list.
    createTrustedTypesPolicy(name, options) {
      // window.trustedTypes is a newer Web API not yet in the
      // default lib.dom typings shipping with our TS version.
      // Cast through unknown to access it without polluting the
      // global Window type. Returns undefined in browsers that
      // don't support Trusted Types — Monaco then falls back to
      // its non-trusted code path.
      const tt = (window as unknown as {
        trustedTypes?: {
          createPolicy(name: string, policy: unknown): unknown;
        };
      }).trustedTypes;
      if (!tt) return undefined;
      try {
        // Cast both ways: Monaco's ITrustedTypePolicy structurally
        // matches the browser's TrustedTypePolicy.
        return tt.createPolicy(name, options) as ReturnType<
          NonNullable<NonNullable<typeof self.MonacoEnvironment>['createTrustedTypesPolicy']>
        >;
      } catch {
        // Policy may already be registered (HMR / re-init / duplicate
        // creation under the same name). Browser throws TypeError in
        // that case; returning undefined makes Monaco fall back to
        // its non-trusted path — which is fine because the existing
        // policy is still active for this name.
        return undefined;
      }
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

// Tree-shake done 2026-05-26 — see editor.api import above. The dead
// ts.worker / css.worker / html.worker chunks no longer ship; the
// JSON-only contribution import keeps the working set minimal.
