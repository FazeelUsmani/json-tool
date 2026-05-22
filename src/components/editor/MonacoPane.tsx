import { lazy, Suspense, useState } from 'react';
import { useDocumentStore } from '@/state/documentStore';
import { useDarkClass } from '@/lib/theme/useDarkClass';
import { EditorToolbar } from './EditorToolbar';
import { EmptyStateHero } from './EmptyStateHero';

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

// Hard upper bound for either path. Above this we refuse the file outright.
const MAX_FILE_BYTES = 500 * 1024 * 1024;
// Above this size we skip Monaco entirely and render a viewer-only
// placeholder — Monaco's main-thread tokenize/render on a multi-MB string
// freezes (and at 100MB+ crashes) the tab. The streaming parser still
// reads the File via .stream() and populates the tree pane normally.
const VIEWER_ONLY_THRESHOLD = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.json', '.ndjson', '.jsonl'] as const;

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

  // Skip Monaco entirely when the source is too large to render. Returns
  // a {name, size} record for the placeholder when applicable, null
  // otherwise. We DON'T mount Monaco then unmount it for big files —
  // that would still allocate the editor + worker pair (~2MB) for a
  // pane the user can't interact with anyway.
  const viewerOnly =
    (source?.kind === 'file' || source?.kind === 'url' || source?.kind === 'sample') &&
    source.size > VIEWER_ONLY_THRESHOLD
      ? {
          name: source.kind === 'url' ? source.url : source.name,
          size: source.size,
        }
      : null;

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

    // Viewer-only path: skip file.text() entirely so we don't materialize
    // the bytes as a JS string just to feed Monaco. The streaming worker
    // reads from file.stream() and the tree pane populates normally; the
    // editor pane renders a placeholder explaining the mode.
    if (file.size > VIEWER_ONLY_THRESHOLD) {
      setText(
        '',
        { kind: 'file', name: file.name, size: file.size },
        file,
      );
      setError(null);
      return;
    }

    try {
      const content = await file.text();
      // Pass the original File handle alongside the text. The streaming
      // parser reads bytes via file.stream() instead of re-encoding the
      // text string — saves a 50MB allocation on the parser pipeline and
      // gives the worker the same bytes the user actually dropped.
      setText(
        content,
        { kind: 'file', name: file.name, size: file.size },
        file,
      );
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
        {viewerOnly ? (
          <ViewerOnlyPlaceholder
            name={viewerOnly.name}
            size={viewerOnly.size}
          />
        ) : text === '' && source === null ? (
          // Empty-state hero — no document loaded yet. Defers Monaco
          // instantiation until the user actually needs the editor
          // (drop / paste / sample click), shaving the editor module
          // off the cold-load critical path. Drop handler is inherited
          // from the parent div's onDrop above.
          <EmptyStateHero />
        ) : (
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
        )}
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

function ViewerOnlyPlaceholder({ name, size }: { name: string; size: number }) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
      <div className="text-foreground max-w-md text-center font-mono text-base">
        📄 {name}
      </div>
      <div className="text-muted-foreground">{formatBytes(size)}</div>
      <div className="text-muted-foreground max-w-md text-center">
        Editor disabled for files over{' '}
        {formatBytes(VIEWER_ONLY_THRESHOLD)} to keep the tab responsive.
        Browse, search, and inspect the data in the tree pane →
      </div>
    </div>
  );
}
