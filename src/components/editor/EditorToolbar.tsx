import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDocumentStore } from '@/state/documentStore';
import {
  formatJson,
  minifyJson,
  sortKeysJson,
  type FormatError,
  type FormatResult,
} from '@/lib/json/format';

type Transform = (text: string) => FormatResult;

export function EditorToolbar() {
  const text = useDocumentStore((s) => s.text);
  const source = useDocumentStore((s) => s.source);
  const setText = useDocumentStore((s) => s.setText);
  const [error, setError] = useState<FormatError | null>(null);

  const run = (transform: Transform) => {
    // Empty editor → no-op. Clicking Format on nothing should do nothing,
    // not accuse the user of forgetting to paste.
    if (text.trim() === '') return;
    const result = transform(text);
    if (result.ok) {
      setText(result.text, source ?? { kind: 'paste' });
      setError(null);
      return;
    }
    setError(result.error);
  };

  return (
    <div className="bg-background flex items-center gap-2 border-b px-3 py-2">
      <Button variant="outline" size="sm" onClick={() => run(formatJson)}>
        Format
      </Button>
      <Button variant="outline" size="sm" onClick={() => run(minifyJson)}>
        Minify
      </Button>
      <Button variant="outline" size="sm" onClick={() => run(sortKeysJson)}>
        Sort keys
      </Button>
      {error && (
        <span className="bg-destructive/10 text-destructive ml-2 rounded-md px-2 py-1 text-xs">
          {describeError(error)}
        </span>
      )}
    </div>
  );
}

function describeError(error: FormatError): string {
  if (error.line !== undefined && error.col !== undefined) {
    return `Invalid JSON at line ${error.line} col ${error.col}`;
  }
  return 'Invalid JSON';
}
