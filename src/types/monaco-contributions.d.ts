// Monaco 0.55 ships `export {}` as the .d.ts for these language-contribution
// modules, even though they have real runtime exports. Augment locally so
// `import { jsonDefaults }` type-checks without an `as any` cast.

declare module 'monaco-editor/esm/vs/language/json/monaco.contribution' {
  export const jsonDefaults: {
    setDiagnosticsOptions(options: {
      validate?: boolean;
      allowComments?: boolean;
      schemas?: readonly unknown[];
      enableSchemaRequest?: boolean;
      trailingCommas?: 'error' | 'warning' | 'ignore';
      comments?: 'error' | 'warning' | 'ignore';
    }): void;
  };
}
