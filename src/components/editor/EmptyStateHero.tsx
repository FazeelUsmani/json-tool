// Drop-zone hero shown in the left pane when no document is loaded.
// Replaces the bare-Monaco-on-cold-load state with an inviting drop
// target + sample quick-loads + one-line value prop.
//
// Drop handling is inherited from the parent container (MonacoPane's
// `onDrop` already wraps this area), so dropping a file anywhere on
// the hero fires the existing pipeline — no separate handler needed.
//
// Paste-from-empty flow (2026-05-25): a window-level paste listener
// lives in this component while the hero is mounted. Cmd+V / Ctrl+V
// anywhere on the page pipes the clipboard text into documentStore
// (kind:'paste'), which mounts Monaco with the content and unmounts
// this hero in the same render. Without this, the headline's
// "or paste text to begin" promise was broken — Monaco doesn't exist
// yet to receive a paste event when truly empty.
//
// Listener guards against hijacking paste from focused inputs (future
// search bars, etc.) by short-circuiting when `document.activeElement`
// is anything other than body/html. Once Monaco mounts, this hero
// unmounts, the listener is removed, and Monaco's own paste handler
// takes over.
//
// Click-to-mount (Option A, 2026-05-25): clicking the hero background
// fires `onActivate`, which signals MonacoPane to skip the hero and
// mount Monaco with empty content. The user can then type. Without
// this, "click into the editor to type" — the universal mental model
// across CodeSandbox / StackBlitz / GitHub web — was broken: clicking
// did nothing because the click target wasn't backed by an input.
// Sample-button clicks bubble through to `onActivate` as well, which
// is harmless because their own onClick fires setText first and
// drives the same outcome (Monaco mount) via documentStore.
//
// Sample buttons load inline JS-string content via setText with
// `{ kind: 'sample', name, size }` — DocumentSource shape matches
// the existing file / url / paste pipeline so the source chip in
// the toolbar and parse routing both work without special-casing.

import { useEffect } from 'react';
import { FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SAMPLES, type Sample } from '@/lib/samples/samples';
import { useDocumentStore } from '@/state/documentStore';

type Props = {
  onActivate: () => void;
};

export function EmptyStateHero({ onActivate }: Props) {
  const setText = useDocumentStore((s) => s.setText);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Don't hijack paste targeted at any focused input (future
      // search bars, URL field, etc.). When nothing is focused the
      // activeElement is body — that's when the paste is "free".
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement
      ) {
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      setText(text, { kind: 'paste' });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [setText]);

  const loadSample = (sample: Sample) => {
    setText(sample.content, {
      kind: sample.kind,
      name: sample.name,
      size: sample.content.length,
    });
  };

  return (
    <div
      className="border-border/40 m-3 flex h-[calc(100%-1.5rem)] cursor-text flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-6 text-center"
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Keyboard equivalent: Enter / Space activates the editor.
        // Lets keyboard-only users escape the hero without a sample
        // button or paste shortcut.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <FileJson
        className="text-muted-foreground/50 size-12"
        aria-hidden
      />
      <div className="space-y-1">
        <p className="text-foreground text-base font-medium">
          Drop a JSON file here
        </p>
        <p className="text-muted-foreground text-sm">
          or paste text to begin
        </p>
      </div>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Open large JSON files (up to 500&nbsp;MB) in your browser.
        We never see your data.
      </p>
      <div className="flex flex-wrap items-stretch justify-center gap-2 pt-2">
        {SAMPLES.map((sample) => (
          <Button
            key={sample.id}
            variant="outline"
            size="sm"
            onClick={() => loadSample(sample)}
            className="h-auto flex-col gap-0.5 px-4 py-2 text-left"
            // Stable e2e selector. `getByRole('button', { name: ... })`
            // is ambiguous here because the wrapping hero <div> also
            // has role="button" (for click-to-mount), so its computed
            // accessible name includes every sample button's text.
            // data-testid bypasses the accessibility-tree merge.
            data-testid={`sample-${sample.id}`}
          >
            <span className="text-xs font-medium">{sample.name}</span>
            <span className="text-muted-foreground text-[10px] font-normal">
              {sample.sizeLabel}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
