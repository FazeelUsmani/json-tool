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
  globalIgnores(['dist', 'spikes/**']),
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
