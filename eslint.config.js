import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `spikes/` is the throw-away exploratory directory — kept out of
  // production paths via tsconfig but worth excluding from lint too
  // so unused-vars / experimental code doesn't block the gate.
  // `benchmarks/` is dev-only scripts + a `SMOKE=1`-gated test; not
  // in the production tsconfig project, so the type-aware lint
  // rules would error on parse. Excluded for the same reason as spikes.
  globalIgnores(['dist', 'spikes/**', 'benchmarks/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      // Type-aware lint requires telling the parser where the project
      // sits. `projectService: true` is the modern shape (TS-ESLint 8+);
      // it auto-discovers the right tsconfig per file without forcing
      // us to list them. Enables the three rules below + future
      // type-aware checks. Slows lint ~3-5×; still fast enough for CI.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // eslint-plugin-react-hooks v6 added a strict rule against
      // setState calls inside useEffect that aren't async-callback
      // results. Our derived-state-from-props pattern (documented in
      // useStubPreview, useDebugFlag, RightPane, TablePane, etc.)
      // legitimately resets state on prop changes by calling
      // setState during effect setup. Downgrading to `warn` keeps
      // the signal visible without blocking CI; revisit per-call
      // when a proper React 19 useReducer / use(promise) migration
      // lands.
      'react-hooks/set-state-in-effect': 'warn',
      // Type-aware bug-class rules (slice 4 close-out, 2026-05-25):
      // catch the "forgot to await", "Promise<void> passed as
      // sync handler", and "awaiting non-thenable" classes that
      // unit tests don't surface and Playwright would catch only
      // by accident. These are the highest-signal rules in the
      // type-aware bucket; the noisier no-unsafe-* family stays
      // off until the codebase has a reason to need it.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // shadcn/ui vendor pattern: component file co-locates the
    // component + its `cva` variant constants. The react-refresh
    // "only export components" rule fires on every such file
    // because the variants aren't components. This is the standard
    // shadcn project override.
    files: ['src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
