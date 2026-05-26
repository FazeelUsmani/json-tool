// Semantic-diff UI — paste a JSON to compare against the currently-
// loaded document, render an inline color-coded result list, click
// any row to jump to that node in the Tree.
//
// Architecture (per PLAN_M2.md slice A design):
//
//   - "Before" = currently-loaded document (viewStore.root).
//   - "After" = user-pasted JSON in the textarea below.
//   - Diff runs synchronously on click via diffTrees from
//     @/lib/diff/semantic (see that file for the worker-routing
//     deferral reasoning).
//   - Result list filters out 'same' ops by default (noise — the
//     user wants what changed). Toggle reveals them.
//   - Click handler: pointer exists in current flat → setFocusedIndex
//     + flashRow + onJumpToTree (reuses the JSONPath click-jump
//     plumbing from QueryPane). Pointer missing (e.g., 'added' op
//     where the path is only in the compared payload) → toast.
//
// Out of scope for A2:
//   - "Save current as baseline" + localStorage persistence (slice A3)
//   - Filtering by op kind (defer until result lists get long enough
//     to warrant the UI surface)
//   - Hover preview of full value (defer; truncated cell is enough
//     for v1)

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { useViewStore } from '@/state/viewStore';
import { useDocumentStore } from '@/state/documentStore';

type Props = {
  root: TreeNode | null;
  onJumpToTree: () => void;
};

export function DiffPane({ root, onJumpToTree }: Props) {
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);
  const flashRow = useViewStore((s) => s.flashRow);
  const docText = useDocumentStore((s) => s.text);

  const [pasteText, setPasteText] = useState('');
  const [showSame, setShowSame] = useState(false);
  // Baseline state — lazy-init avoided in favor of post-mount load
  // because loadBaseline() touches localStorage, which vite-react-ssg's
  // SSR shim defines as an object without callable methods. A useState
  // lazy initializer would fire during the SSR pass and throw.
  // useEffect only runs client-side; safe.
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  useEffect(() => {
    setBaseline(loadBaseline());
  }, []);
  // Diff state tracks which "after" source the result came from
  // (paste vs baseline) so the UI can label the comparison correctly.
  const [diffState, setDiffState] = useState<
    | { kind: 'idle' }
    | { kind: 'parse-error'; message: string }
    | {
        kind: 'success';
        ops: DiffOp[];
        // Direction labels for the status indicator above results.
        // When comparing baseline, the lib was called as
        // diffTrees(baseline, current) so baseline IS the "before".
        source: 'paste' | 'baseline';
      }
  >({ kind: 'idle' });

  const filteredOps = useMemo(() => {
    if (diffState.kind !== 'success') return [];
    if (showSame) return diffState.ops;
    return diffState.ops.filter((op) => op.kind !== 'same');
  }, [diffState, showSame]);

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

  const handleRunDiff = () => {
    if (root === null) {
      toast.error('Load JSON in the editor first.');
      return;
    }
    const trimmed = pasteText.trim();
    if (trimmed === '') {
      toast('Paste a JSON document to compare against.');
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
    // Paste flow: current = BEFORE, pasted = AFTER (asymmetric with
    // the baseline flow — see header comment for why).
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
    toast.success('Baseline saved.');
  };

  const handleClearBaseline = () => {
    clearBaseline();
    setBaseline(null);
    toast('Baseline cleared.');
  };

  const handleCompareToBaseline = () => {
    if (baseline === null || root === null) return;
    const parsed = parseToTree(baseline.text);
    if (!parsed.ok) {
      // Stored baseline is unparseable — schema migration, manual
      // localStorage edit, etc. Surface + clear; user can re-save.
      toast.error('Saved baseline is corrupted — cleared.');
      clearBaseline();
      setBaseline(null);
      return;
    }
    // Baseline flow: baseline = BEFORE (the known-good reference),
    // current = AFTER ("what I'm checking"). "Removed in current"
    // means the current document lost a field the baseline had.
    const result = diffTrees(parsed.root, root);
    setDiffState({ kind: 'success', ops: result.ops, source: 'baseline' });
  };

  const handleOpClick = (op: DiffOp) => {
    // 'added' op pointers only exist in the compared payload, not in
    // the current tree → no row to jump to. Toast educates.
    if (op.kind === 'added') {
      toast(
        'This path is only in the compared JSON — not present in the loaded document.',
      );
      return;
    }
    if (op.kind === 'stub-skipped') {
      toast(
        'Diff skipped this position because one side is an unmaterialized stub. Expand the parent in the Tree, then re-run.',
      );
      return;
    }
    const idx = flat.findIndex((r) => r.id === op.pointer);
    if (idx === -1) {
      toast(
        'Match is inside an unmaterialized stub — expand the parent in the Tree, then re-run.',
      );
      return;
    }
    if (anyAncestorClosed(op.pointer, closed)) {
      toast(
        'Match is inside a collapsed subtree — expand parent rows in the Tree to view.',
      );
      return;
    }
    setFocusedIndex(idx);
    flashRow(op.pointer);
    onJumpToTree();
  };

  const empty = root === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="text-muted-foreground text-xs">
          {empty ? (
            'Load JSON in the editor (left pane) to use as the "before" side.'
          ) : (
            <>
              <strong className="font-medium">Before:</strong> currently
              loaded document
            </>
          )}
        </div>
        {/* Baseline section: persistent storage for a "working sample"
            to compare future loads against. Two states — no baseline
            (single Save button) or baseline saved (status chip + 3
            actions). Note the direction flip for baseline compare:
            baseline is BEFORE, current is AFTER — opposite of the
            paste flow. */}
        <div
          className="rounded-md border border-dashed px-2 py-1.5"
          data-testid="diff-baseline-section"
        >
          {baseline === null ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                No baseline saved.
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                <strong className="font-medium">Baseline saved</strong>{' '}
                {formatRelativeTime(baseline.savedAt)} ({formatBytes(baseline.bytes)})
              </span>
              <div className="flex gap-1.5">
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
            </div>
          )}
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={
            empty
              ? 'Load a document first…'
              : 'Paste JSON to compare against the loaded document…'
          }
          disabled={empty}
          spellCheck={false}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-32 w-full resize-y rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="diff-paste-input"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRunDiff}
            disabled={empty || pasteText.trim() === ''}
          >
            Run diff
          </Button>
          {summary !== null && (
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={showSame}
                onChange={(e) => setShowSame(e.target.checked)}
                className="size-3"
              />
              Show unchanged ({summary.same})
            </label>
          )}
        </div>
        {diffState.kind === 'parse-error' && (
          <div className="text-destructive text-xs">{diffState.message}</div>
        )}
        {diffState.kind === 'success' && (
          <div className="text-muted-foreground text-[10px] leading-tight">
            {diffState.source === 'baseline'
              ? `Comparing baseline (saved ${formatRelativeTime(baseline?.savedAt ?? 0)}) → current document`
              : 'Comparing current document → pasted JSON'}
          </div>
        )}
        {summary !== null && diffState.kind === 'success' && (
          <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
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
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {diffState.kind === 'success' && filteredOps.length > 0 && (
          <ul className="font-mono text-xs">
            {filteredOps.map((op, i) => (
              <li
                key={`${op.pointer}-${i}`}
                className="border-border/40 border-b last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => handleOpClick(op)}
                  className="hover:bg-muted/60 flex w-full items-baseline gap-2 px-3 py-1.5 text-left"
                  title={op.pointer || '/'}
                  data-testid="diff-result-row"
                >
                  <OpKindIndicator kind={op.kind} />
                  <span className="text-muted-foreground truncate">
                    {op.pointer || '/'}
                  </span>
                  <span className="text-foreground/80 truncate">
                    {describeOp(op)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {diffState.kind === 'success' && filteredOps.length === 0 && (
          <div className="text-muted-foreground p-4 text-sm">
            {summary && summary.same > 0
              ? 'No differences. Toggle "Show unchanged" to see same-value rows.'
              : 'No differences detected.'}
          </div>
        )}
        {diffState.kind === 'idle' && !empty && (
          <div className="text-muted-foreground p-4 text-sm">
            Paste a JSON document above and click <strong>Run diff</strong>{' '}
            to compare against the loaded document.
          </div>
        )}
      </div>
      <div className="text-muted-foreground border-t px-3 py-2 text-[10px] leading-tight">
        Diff sees materialized spine + leaves. Composites past depth 2
        (stubs) are opaque — expand them in the Tree to include their
        contents in the diff.
      </div>
    </div>
  );
}

function OpKindIndicator({ kind }: { kind: DiffOp['kind'] }) {
  const map = {
    same: { ch: '=', cls: 'text-muted-foreground' },
    'value-changed': { ch: '~', cls: 'text-amber-700 dark:text-amber-400' },
    'type-changed': { ch: '!', cls: 'text-orange-700 dark:text-orange-400' },
    added: { ch: '+', cls: 'text-green-700 dark:text-green-400' },
    removed: { ch: '−', cls: 'text-red-700 dark:text-red-400' },
    'stub-skipped': { ch: '·', cls: 'text-muted-foreground' },
  } as const;
  const { ch, cls } = map[kind];
  return (
    <span className={`inline-block w-3 text-center font-bold ${cls}`}>
      {ch}
    </span>
  );
}

function describeOp(op: DiffOp): string {
  switch (op.kind) {
    case 'same':
      return previewValue(op.value);
    case 'value-changed':
      return `${previewValue(op.before)} → ${previewValue(op.after)}`;
    case 'type-changed':
      return `${op.beforeType} → ${op.afterType}`;
    case 'added':
      return `(added) ${previewValue(op.value)}`;
    case 'removed':
      return `(removed) ${previewValue(op.value)}`;
    case 'stub-skipped':
      return `(stub on ${op.side === 'both' ? 'both sides' : op.side + ' side'})`;
  }
}

function previewValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  switch (typeof value) {
    case 'string': {
      const truncated = value.length > 40 ? value.slice(0, 40) + '…' : value;
      return JSON.stringify(truncated);
    }
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'object':
      if (Array.isArray(value)) return `[…${value.length}]`;
      return `{…${Object.keys(value as object).length}}`;
    default:
      return '';
  }
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// Same ancestor-walk pattern as QueryPane. RFC 6901 pointer segments
// are separated by `/`; ancestors are prefixes of `pointer`.
function anyAncestorClosed(pointer: string, closed: Set<string>): boolean {
  if (pointer === '') return false;
  const segments = pointer.split('/');
  if (closed.has('')) return true;
  for (let i = 1; i < segments.length - 1; i++) {
    const ancestor = segments.slice(0, i + 1).join('/');
    if (closed.has(ancestor)) return true;
  }
  return false;
}
