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

// Matches fetchUrl.ts MAX_BYTES. TODO(W3): bump together when streaming
// parser lands; today's JSON.parse path can't survive much above this.
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.json', '.ndjson', '.jsonl'] as const;

function useDarkClass(): boolean {
  // Guard for SSG: vite-react-ssg prerenders this component in Node, where
  // `document` doesn't exist. Default to light during prerender; the real
  // value is applied on hydration via the MutationObserver effect.
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
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

  // Lifted from EditorToolbar so both transform/URL errors AND file-drop
  // errors flow through the same pill. Ephemeral UI state — stays out of
  // documentStore.
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    // preventDefault BOTH here and in onDragOver — otherwise the browser
    // navigates away from the page when a file lands.
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setError(`Unsupported file type: ${file.name}`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `Too large: ${formatBytes(file.size)} > ${formatBytes(MAX_FILE_BYTES)}`,
      );
      return;
    }

    try {
      const content = await file.text();
      setText(content, { kind: 'file', name: file.name });
      setError(null);
    } catch {
      setError(`Failed to read file: ${file.name}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <EditorToolbar error={error} setError={setError} />
      <div
        className="relative min-h-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          // Children fire dragLeave on the parent as the pointer crosses
          // their boundaries — relatedTarget tells us if we're actually
          // leaving the wrapper or just moving inside it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
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
              setText(value, source ?? { kind: 'paste' });
            }}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              renderLineHighlight: 'gutter',
              largeFileOptimizations: true,
              automaticLayout: true,
              // Suppress per-level indent guides — on a deep-nested doc
              // (e.g. 150-level pathological fixture) they stack into a
              // wall of vertical lines that drowns out the content.
              guides: { indentation: false },
              stickyScroll: { enabled: false },
            }}
          />
        </Suspense>
        {isDragging && (
          <div className="border-primary/50 bg-background/80 text-foreground pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md border-2 border-dashed text-sm font-medium">
            Drop JSON file here
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
