import { lazy, Suspense, useEffect, useState } from 'react';
import { useDocumentStore } from '@/state/documentStore';
import { EditorToolbar } from './EditorToolbar';

// Monaco is loaded lazily so it doesn't block first paint (it's ~2MB of
// editor code + workers). The init module is imported first inside the lazy
// resolver — initMonaco() must finish before Editor mounts so the loader
// uses our bundled Monaco instead of the CDN default, and so workers route
// correctly via self.MonacoEnvironment.
const MonacoEditor = lazy(async () => {
  const { initMonaco } = await import('@/lib/monaco/init');
  initMonaco();
  const mod = await import('@monaco-editor/react');
  return { default: mod.default };
});

function useDarkClass(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function MonacoPane() {
  const text = useDocumentStore((s) => s.text);
  const setText = useDocumentStore((s) => s.setText);
  const source = useDocumentStore((s) => s.source);
  const isDark = useDarkClass();

  return (
    <div className="flex h-full w-full flex-col">
      <EditorToolbar />
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Loading editor…
            </div>
          }
        >
          <MonacoEditor
            height="100%"
            defaultLanguage="json"
            theme={isDark ? 'vs-dark' : 'vs'}
            value={text}
            onChange={(value) => {
              if (value === undefined) return;
              // Preserve the existing source on edit. The first time content
              // arrives via paste/drop/url, the relevant handler sets source
              // explicitly. Subsequent typing keeps that provenance — a user
              // editing pasted JSON shouldn't suddenly look like a "drop".
              setText(value, source ?? { kind: 'paste' });
            }}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              renderLineHighlight: 'gutter',
              // Performance: Monaco eagerly does some work proportional to
              // document size on every render. These two cut visible cost
              // on large pastes without losing meaningful UX.
              largeFileOptimizations: true,
              automaticLayout: true,
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
