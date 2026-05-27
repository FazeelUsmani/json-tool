// Semantic-diff UI — paste a JSON to compare against the currently-
// loaded document. Renders side-by-side Monaco DiffEditor with the
// usual green/red textual diff, PLUS a semantic summary chip strip
// above (the M2 differentiator framing — see PLAN_M2.md slice A).
//
// Architecture:
//   - Monaco DiffEditor (re-used from RepairDialog's lazy import path)
//     is the primary visualization. Left = "before", right = "after".
//   - Mode toggles between two source pairings:
//       paste mode (default): left = currently-loaded doc, right = pasteText (editable)
//       baseline mode: left = baseline.text, right = currently-loaded doc (read-only)
//   - Semantic-diff result (diffTrees) feeds a small chip strip above
//     the editor: "+ N added", "- N removed", "~ N value-changed", etc.
//     This is the load-bearing M2 framing — Monaco does the visual
//     side, semantic-diff lib does the structural intelligence.
//   - Click-to-tree from the previous list view is dropped in this
//     pass (chip strip is enough; can re-add as a collapsible details
//     section if customer-discovery surfaces demand).

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { editor } from 'monaco-editor';
import { Button } from '@/components/ui/button';
import { parseToTree, type TreeNode } from '@/lib/tree/parse';
import { diffTrees, type DiffOp } from '@/lib/diff/semantic';
import {
  clearBaseline,
  formatRelativeTime,
  loadBaseline,
  saveBaseline,
  type Baseline,
} from '@/lib/diff/baseline';
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
  // Reserved for re-introducing click-to-tree from a details list.
  // Not surfaced in v2 — chip strip alone is enough for the diff-checker UX.
  onJumpToTree: () => void;
};

type Mode = 'paste' | 'baseline';

type DiffState =
  | { kind: 'idle' }
  | { kind: 'parse-error'; message: string }
  | { kind: 'success'; ops: DiffOp[]; source: Mode };

export function DiffPane({ root }: Props) {
  const docText = useDocumentStore((s) => s.text);
  const isDark = useDarkClass();

  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const [pasteText, setPasteText] = useState('');
  const [mode, setMode] = useState<Mode>('paste');
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [diffState, setDiffState] = useState<DiffState>({ kind: 'idle' });
  // Controlled `<details>` open state — React re-renders can otherwise
  // lose the DOM open attribute when the inner branch (no-baseline vs
  // saved-baseline) switches identity. Default closed (collapsed UX);
  // open automatically when the user takes a baseline action.
  const [baselineOpen, setBaselineOpen] = useState(false);

  // Lazy-init avoided here for the same SSR-shim reason DiffPane v1
  // documented: vite-react-ssg's localStorage shim is an object
  // without callable methods, so a useState lazy initializer would
  // fire during the SSR pass and throw. useEffect runs client-only.
  useEffect(() => {
    setBaseline(loadBaseline());
  }, []);

  // Monaco model content per mode. Pasting mode: left = current doc,
  // right = user paste. Baseline mode: left = baseline text, right =
  // current doc (both read-only — it's a saved-vs-current comparison).
  const monacoOriginal = mode === 'baseline' ? (baseline?.text ?? '') : docText;
  const monacoModified = mode === 'baseline' ? docText : pasteText;
  const modifiedReadOnly = mode === 'baseline';

  const summary = useMemo(() => {
    if (diffState.kind !== 'success') return null;
    const s = {
      added: 0,
      removed: 0,
      valueChanged: 0,
      typeChanged: 0,
      stubSkipped: 0,
      same: 0,
    };
    for (const op of diffState.ops) {
      if (op.kind === 'added') s.added++;
      else if (op.kind === 'removed') s.removed++;
      else if (op.kind === 'value-changed') s.valueChanged++;
      else if (op.kind === 'type-changed') s.typeChanged++;
      else if (op.kind === 'stub-skipped') s.stubSkipped++;
      else s.same++;
    }
    return s;
  }, [diffState]);

  // Read modifiedText fresh from Monaco on Run diff click. We avoid
  // per-keystroke state sync to keep Monaco's edit path uncluttered.
  // pasteText state is updated only when Monaco's model snapshot is
  // captured at Run-diff time.
  const readModifiedFromMonaco = (): string => {
    const model = editorRef.current?.getModel();
    if (!model) return pasteText;
    return model.modified.getValue();
  };

  const handleRunDiff = () => {
    if (root === null) {
      toast.error('Load JSON in the editor first.');
      return;
    }
    // Switch to paste mode if we were in baseline mode (user explicitly
    // wants to diff against paste contents now).
    if (mode === 'baseline') setMode('paste');

    const text = readModifiedFromMonaco();
    setPasteText(text);
    const trimmed = text.trim();
    if (trimmed === '') {
      toast('Paste JSON in the right pane to compare against.');
      return;
    }
    const parseResult = parseToTree(trimmed);
    if (!parseResult.ok) {
      const where =
        parseResult.error.line !== undefined &&
        parseResult.error.col !== undefined
          ? `line ${parseResult.error.line}, col ${parseResult.error.col}`
          : parseResult.error.message;
      setDiffState({
        kind: 'parse-error',
        message: `Could not parse pasted JSON at ${where}.`,
      });
      return;
    }
    // Paste flow: current = BEFORE, pasted = AFTER.
    const result = diffTrees(root, parseResult.root);
    setDiffState({ kind: 'success', ops: result.ops, source: 'paste' });
  };

  const handleSaveBaseline = () => {
    if (docText.trim() === '') {
      toast.error('No JSON loaded to save as baseline.');
      return;
    }
    const result = saveBaseline(docText);
    if (!result.ok) {
      if (result.reason === 'too-large') {
        toast.error(
          `Document too large to save as baseline — ${formatBytes(result.size)} > ${formatBytes(result.limit)} cap.`,
        );
      } else {
        toast.error(`Could not save baseline: ${result.message}`);
      }
      return;
    }
    setBaseline(loadBaseline());
    setBaselineOpen(true);
    toast.success('Baseline saved.');
  };

  const handleClearBaseline = () => {
    clearBaseline();
    setBaseline(null);
    // Leave the details open so a user who just cleared can immediately
    // see the "Save current as baseline" affordance without having to
    // re-expand.
    // If we're displaying a baseline-mode diff, fall back to paste mode.
    if (mode === 'baseline') {
      setMode('paste');
      setDiffState({ kind: 'idle' });
    }
    toast('Baseline cleared.');
  };

  const handleCompareToBaseline = () => {
    if (baseline === null || root === null) return;
    const parsed = parseToTree(baseline.text);
    if (!parsed.ok) {
      toast.error('Saved baseline is corrupted — cleared.');
      clearBaseline();
      setBaseline(null);
      setBaselineOpen(false);
      return;
    }
    // Baseline flow: baseline = BEFORE (known-good reference),
    // current = AFTER ("what I'm checking"). Pointer paths in the
    // result point into the current tree.
    setMode('baseline');
    setBaselineOpen(true);
    const result = diffTrees(parsed.root, root);
    setDiffState({ kind: 'success', ops: result.ops, source: 'baseline' });
  };

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
      {/* Toolbar + baseline section */}
      <div className="space-y-2 border-b p-3">
        <div className="text-muted-foreground text-xs">
          {empty ? (
            'Load JSON in the editor (left pane) to use as the "before" side.'
          ) : (
            <>
              <strong className="font-medium">Before:</strong>{' '}
              {mode === 'baseline'
                ? `baseline (saved ${formatRelativeTime(baseline?.savedAt ?? 0)})`
                : 'currently loaded document'}
            </>
          )}
        </div>

        {/* Baseline persistence section — collapsed by default so the
            default DiffPane UX is just "paste + diff". Power users
            expand to save / compare against a working sample (the M2
            differentiator from PLAN_M2.md Slice A3). */}
        <details
          className="rounded-md border border-dashed"
          data-testid="diff-baseline-section"
          open={baselineOpen}
          onToggle={(e) => setBaselineOpen(e.currentTarget.open)}
        >
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none px-2 py-1.5 text-xs select-none [&::-webkit-details-marker]:hidden">
            <span className="mr-1">{baselineOpen ? '▾' : '▸'}</span>
            {baseline === null
              ? 'Advanced: save current as a baseline'
              : `Baseline saved ${formatRelativeTime(baseline.savedAt)} (${formatBytes(baseline.bytes)})`}
          </summary>
          <div className="border-border/40 border-t px-2 py-1.5">
            {baseline === null ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  Save the current document as a reference. Future loads can
                  be auto-diffed against it.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveBaseline}
                  disabled={empty}
                  data-testid="diff-save-baseline"
                >
                  Save current as baseline
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                  size="sm"
                  onClick={handleCompareToBaseline}
                  disabled={empty}
                  data-testid="diff-compare-baseline"
                >
                  Compare to baseline
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveBaseline}
                  disabled={empty}
                >
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearBaseline}
                  data-testid="diff-clear-baseline"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </details>

        {/* Run diff + summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleRunDiff}
            disabled={empty}
            data-testid="diff-run"
          >
            Run diff
          </Button>
          {summary !== null && diffState.kind === 'success' && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              {summary.added > 0 && (
                <span className="text-green-700 dark:text-green-400">
                  + {summary.added} added
                </span>
              )}
              {summary.removed > 0 && (
                <span className="text-red-700 dark:text-red-400">
                  − {summary.removed} removed
                </span>
              )}
              {summary.valueChanged > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  ~ {summary.valueChanged} value-changed
                </span>
              )}
              {summary.typeChanged > 0 && (
                <span className="text-orange-700 dark:text-orange-400">
                  ! {summary.typeChanged} type-changed
                </span>
              )}
              {summary.stubSkipped > 0 && (
                <span className="text-muted-foreground">
                  · {summary.stubSkipped} stub-skipped
                </span>
              )}
              {summary.added === 0 &&
                summary.removed === 0 &&
                summary.valueChanged === 0 &&
                summary.typeChanged === 0 && (
                  <span className="text-muted-foreground">
                    no structural differences
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Direction / status indicator */}
        {diffState.kind === 'success' && (
          <div className="text-muted-foreground text-[10px] leading-tight">
            {diffState.source === 'baseline'
              ? `Comparing baseline → current document`
              : 'Comparing current document → pasted JSON'}
          </div>
        )}
        {diffState.kind === 'parse-error' && (
          <div className="text-destructive text-xs">{diffState.message}</div>
        )}
      </div>

      {/* Monaco DiffEditor — primary visualization */}
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
              original={monacoOriginal}
              modified={monacoModified}
              theme={isDark ? 'vs-dark' : 'vs'}
              onMount={(diffEditor) => {
                editorRef.current = diffEditor;
              }}
              options={{
                // readOnly controls the modified (right) side; original is
                // independently locked read-only via originalEditable: false.
                // In paste mode: modified is editable so users can type/paste.
                // In baseline mode: both sides are read-only (comparing two
                // saved states; no edits make sense).
                readOnly: modifiedReadOnly,
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

      <div className="text-muted-foreground border-t px-3 py-2 text-[10px] leading-tight">
        Diff sees materialized spine + leaves. Composites past depth 2
        (stubs) are opaque — expand them in the Tree to include their
        contents in the diff. Green/red highlighting is textual; chip
        counts above use the semantic-diff lib for structural awareness.
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
