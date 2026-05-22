// Drop-zone hero shown in the left pane when no document is loaded.
// Replaces the bare-Monaco-on-cold-load state with an inviting drop
// target + sample quick-loads + one-line value prop.
//
// Drop handling is inherited from the parent container (MonacoPane's
// `onDrop` already wraps this area), so dropping a file anywhere on
// the hero fires the existing pipeline — no separate handler needed.
//
// Click-to-paste flow: clicking the hero focuses the parent container
// + when isEmpty becomes false (user starts typing in Monaco after
// the swap), the hero unmounts naturally. We don't add an explicit
// "Cmd+V to paste" hint — the headline already says "or paste text
// to begin" and the click-to-focus path is discoverable. Extra
// instruction clutters the hero with redundancy.
//
// Sample buttons load inline JS-string content via setText with
// `{ kind: 'sample', name, size }` — DocumentSource shape matches
// the existing file / url / paste pipeline so the source chip in
// the toolbar and parse routing both work without special-casing.

import { FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SAMPLES, type Sample } from '@/lib/samples/samples';
import { useDocumentStore } from '@/state/documentStore';

export function EmptyStateHero() {
  const setText = useDocumentStore((s) => s.setText);

  const loadSample = (sample: Sample) => {
    setText(sample.content, {
      kind: sample.kind,
      name: sample.name,
      size: sample.content.length,
    });
  };

  return (
    <div className="border-border/40 m-3 flex h-[calc(100%-1.5rem)] flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-6 text-center">
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
        100% client-side.
      </p>
      <div className="flex flex-wrap items-stretch justify-center gap-2 pt-2">
        {SAMPLES.map((sample) => (
          <Button
            key={sample.id}
            variant="outline"
            size="sm"
            onClick={() => loadSample(sample)}
            className="h-auto flex-col gap-0.5 px-4 py-2 text-left"
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
