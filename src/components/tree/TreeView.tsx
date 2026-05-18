import { useEffect, useState } from 'react';
import { useDocumentStore } from '@/state/documentStore';
import { parseToTree, type ParseTreeResult } from '@/lib/tree/parse';
import { TreeNode } from './TreeNode';

// W1-Wed: naive renderer. Renders every node. Replaced by react-window
// virtualization in W2 once the visible-row count gets large.
const PARSE_DEBOUNCE_MS = 150;

export function TreeView() {
  const text = useDocumentStore((s) => s.text);
  // We deliberately don't reset `parsed` on text change — keeping the last
  // successful tree visible during the debounce window avoids a "flicker to
  // blank" on every keystroke.
  const [parsed, setParsed] = useState<ParseTreeResult | null>(null);

  useEffect(() => {
    if (text.trim() === '') {
      setParsed(null);
      return;
    }
    const handle = setTimeout(() => {
      setParsed(parseToTree(text));
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text]);

  if (text.trim() === '') {
    return (
      <Hint>Type or paste JSON in the editor to see the tree here.</Hint>
    );
  }
  if (parsed === null) {
    // Brief window between text appearing and first debounced parse landing.
    return null;
  }
  if (!parsed.ok) {
    return <ParseError error={parsed.error} />;
  }
  return (
    <div className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed">
      <TreeNode node={parsed.root} depth={0} />
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      {children}
    </div>
  );
}

function ParseError({
  error,
}: {
  error: { message: string; line?: number; col?: number };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm">
      <div className="text-destructive font-medium">Invalid JSON</div>
      <div className="text-muted-foreground text-center text-xs">
        {error.line !== undefined && error.col !== undefined
          ? `Line ${error.line}, column ${error.col}`
          : error.message}
      </div>
    </div>
  );
}
