// Minimal diff UI — Monaco DiffEditor side-by-side. Left pane shows
// the currently loaded JSON (read-only); right pane is editable so
// users can paste a modified version and see the visual green/red
// diff inline.
//
// What's intentionally NOT here:
//   - Baseline save/compare/clear UI (M2 Slice A3 surface; the
//     baseline.ts lib stays in code for a future reactivation)
//   - Semantic-diff chip strip (semantic.ts lib stays in code)
//   - Run-diff button (Monaco renders the textual diff automatically
//     as the modified pane content changes)
// User direction was explicitly "remove all this and just keep" the
// diff view — defer semantic-diff and baseline surfaces to a later
// polish slice driven by customer-discovery feedback.

import { lazy, Suspense, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { editor } from 'monaco-editor';
import type { TreeNode } from '@/lib/tree/parse';
import { useDocumentStore } from '@/state/documentStore';
import { useDarkClass } from '@/lib/theme/useDarkClass';

// Same lazy-load pattern as RepairDialog. initMonaco() is idempotent
// so calling it again is safe even if the main editor pane already
// initialized Monaco.
const DiffEditor = lazy(async () => {
  const { initMonaco } = await import('@/lib/monaco/init');
  initMonaco();
  const mod = await import('@monaco-editor/react');
  return { default: mod.DiffEditor };
});

type Props = {
  root: TreeNode | null;
  // Reserved for future click-to-tree integration (semantic-diff
  // result list); not surfaced in the minimal v3 UI.
  onJumpToTree: () => void;
};

export function DiffPane({ root }: Props) {
  const docText = useDocumentStore((s) => s.text);
  const isDark = useDarkClass();
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  // Detach Monaco models before unmount (same pattern as RepairDialog) —
  // prevents the "TextModel got disposed before DiffEditorWidget model
  // got reset" stack trace from firing during route changes.
  useEffect(() => {
    return () => {
      editorRef.current?.setModel(null);
      editorRef.current = null;
    };
  }, []);

  const empty = root === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="text-muted-foreground border-b px-3 py-2 text-xs">
        Paste a modified version on the right to see the diff inline.
      </div>
      <div className="min-h-0 flex-1">
        {empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-sm">
            Load a JSON document to compare.
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading diff editor…
              </div>
            }
          >
            <DiffEditor
              height="100%"
              language="json"
              original={docText}
              modified=""
              theme={isDark ? 'vs-dark' : 'vs'}
              onMount={(diffEditor) => {
                editorRef.current = diffEditor;
              }}
              options={{
                // Left (original) is read-only; right (modified) is editable
                // for paste. Monaco renders green/red textual diff as the
                // user types/pastes on the right.
                readOnly: false,
                originalEditable: false,
                renderSideBySide: true,
                minimap: { enabled: false },
                wordWrap: 'on',
                lineNumbers: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
