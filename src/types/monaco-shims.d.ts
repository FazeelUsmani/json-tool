// Ambient module shim for monaco-editor's tree-shake entry. monaco's
// package.json exposes `./*` → `./*` in its exports map, which maps
// runtime fine but doesn't tell TypeScript where to find `.d.ts`
// files for sub-paths. The bulk `import * as monaco from
// 'monaco-editor'` works because its `.` export points at
// `./esm/vs/editor/editor.main.d.ts`; the lighter `editor.api`
// entry has no equivalent mapping.
//
// We re-export from the bulk entry — the runtime is the lighter
// editor.api module, but the types from editor.main are a SUPERSET
// of editor.api's surface, so this is type-safe (just slightly
// wider than reality for the unused language-contribution slots).
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor';
}
