// Dialog wrapping Monaco's DiffEditor for before/after JSON repair
// review. Controlled component — parent (EditorToolbar) owns
// open/before/after/onApply/onCancel. The dialog only renders the
// diff editor when actually open, so the Monaco DiffEditor module is
// lazy-loaded on first repair (cheap after that — Monaco is already
// in the bundle from MonacoPane).
//
// Why Monaco DiffEditor over a custom or `diff`-library renderer:
// Monaco's already shipped (and warm by the time the user clicks
// Repair — they had to type / paste broken JSON in the editor pane
// first). Side-by-side mode is the idiomatic diff-review shape for
// developers. Zero new bundle dependency.

import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Same lazy-load pattern as MonacoPane's main editor. initMonaco()
// is idempotent so calling it again here is safe even if the main
// editor pane already initialized it.
const RepairDiffEditor = lazy(async () => {
  const { initMonaco } = await import('@/lib/monaco/init');
  initMonaco();
  const mod = await import('@monaco-editor/react');
  return { default: mod.DiffEditor };
});

type Props = {
  open: boolean;
  before: string;
  after: string;
  onApply: () => void;
  onCancel: () => void;
};

export function RepairDialog({
  open,
  before,
  after,
  onApply,
  onCancel,
}: Props) {
  const isDark = useDarkClass();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Repair JSON</DialogTitle>
          <DialogDescription>
            <code className="font-mono">jsonrepair</code> produced a valid
            result. Review the diff and apply if it looks right — your
            original text isn't replaced until you click Apply.
          </DialogDescription>
        </DialogHeader>
        <div className="border-border/60 min-h-0 flex-1 overflow-hidden rounded-md border">
          <Suspense
            fallback={
              <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading diff…
              </div>
            }
          >
            {open && (
              <RepairDiffEditor
                height="60vh"
                language="json"
                original={before}
                modified={after}
                theme={isDark ? 'vs-dark' : 'vs'}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                }}
              />
            )}
          </Suspense>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onApply}>Apply repair</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Mirrors MonacoPane's useDarkClass — couldn't share without an
// export-only refactor that doesn't pay off until a third consumer
// shows up. ~10 lines of duplication is the right call for now.
function useDarkClass(): boolean {
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
