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

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { editor, IDisposable } from 'monaco-editor';
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
  const contentListenerRef = useRef<IDisposable | null>(null);
  // Track whether the modified (right) pane has any content. Drives
  // the "Paste here" overlay visibility — overlay shows when empty,
  // hides as soon as the user types/pastes anything.
  const [modifiedHasContent, setModifiedHasContent] = useState(false);

  // Detach Monaco models + listeners before unmount (same pattern as
  // RepairDialog) — prevents the "TextModel got disposed before
  // DiffEditorWidget model got reset" stack trace.
  useEffect(() => {
    return () => {
      contentListenerRef.current?.dispose();
      contentListenerRef.current = null;
      editorRef.current?.setModel(null);
      editorRef.current = null;
    };
  }, []);

  const empty = root === null;

  const focusModifiedPane = () => {
    editorRef.current?.getModifiedEditor().focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pane headers — make the paste affordance obvious. Layout
          mirrors Monaco's 50/50 split so the labels sit above the
          correct pane visually. */}
      {!empty && (
        <div className="text-muted-foreground flex border-b text-xs">
          <div className="flex-1 border-r px-3 py-2">
            <span className="font-medium">Original</span>
            <span className="ml-1.5 opacity-70">(currently loaded)</span>
          </div>
          <div className="text-foreground flex-1 px-3 py-2">
            <span className="font-medium">Modified</span>
            <span className="ml-1.5 opacity-70">
              — paste your JSON here{' '}
              <kbd className="bg-muted rounded border px-1 font-mono text-[10px]">
                ⌘V
              </kbd>
            </span>
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-sm">
            Load a JSON document to compare.
          </div>
        ) : (
          <>
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
                  // Auto-focus the modified (right) pane so cmd-V lands
                  // immediately.
                  diffEditor.getModifiedEditor().focus();
                  // Track modified content so the "Paste here" overlay
                  // hides on first keystroke / paste.
                  const modModel = diffEditor.getModel()?.modified;
                  if (modModel) {
                    setModifiedHasContent(modModel.getValue().length > 0);
                    contentListenerRef.current = modModel.onDidChangeContent(
                      () => {
                        setModifiedHasContent(modModel.getValue().length > 0);
                      },
                    );
                  }
                }}
                options={{
                  readOnly: false,
                  originalEditable: false,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  // Wider cursor so it's actually visible against an
                  // empty pane. Default style "line" with width 1 was
                  // ~invisible until users typed something.
                  cursorWidth: 3,
                  cursorBlinking: 'solid',
                }}
              />
            </Suspense>
            {/* Empty-state overlay on the modified (right) pane.
                Positioned over the right half of the editor area.
                `pointer-events-none` lets clicks fall through to Monaco
                so focus + paste still work naturally. Hides as soon
                as the user pastes anything. */}
            {!modifiedHasContent && (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 left-1/2 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="border-primary/30 bg-background/70 text-muted-foreground pointer-events-auto rounded-lg border-2 border-dashed px-6 py-4 text-center text-sm shadow-sm backdrop-blur-sm">
                  <div className="text-foreground mb-1 text-base font-medium">
                    Paste your JSON here
                  </div>
                  <div className="text-xs">
                    Press{' '}
                    <kbd className="bg-muted rounded border px-1 font-mono text-[10px]">
                      ⌘V
                    </kbd>{' '}
                    or{' '}
                    <button
                      type="button"
                      onClick={focusModifiedPane}
                      className="text-primary hover:underline"
                    >
                      click here to focus
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
