import { useEffect, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { useDocumentStore } from '@/state/documentStore';
import { useViewStore } from '@/state/viewStore';
import {
  parseToTree,
  type ParseTreeError,
} from '@/lib/tree/parse';
import { deriveVisible, type FlatRow } from '@/lib/tree/flatten';
import { TreeNode } from './TreeNode';

// W2-Mon: tree pane now reads from the flat row array in viewStore. The
// 150ms debounce keeps typing in Monaco from re-parsing on every keystroke;
// previous successful parse stays visible during the debounce window.
// W2-Tue: render via react-window's <List> so only visible rows are
// mounted. Row height locked at 24px (per stack); list fills its parent
// height via style={{height:'100%'}} so no pixel hardcoding here.
const PARSE_DEBOUNCE_MS = 150;
const ROW_HEIGHT = 24;

export function TreeView() {
  const text = useDocumentStore((s) => s.text);
  const setRoot = useViewStore((s) => s.setRoot);
  const flat = useViewStore((s) => s.flat);
  const closed = useViewStore((s) => s.closed);
  // ParseError stays local to TreeView — it's about the last parse attempt,
  // not the document's view state. viewStore stays focused on flat + closed.
  const [parseError, setParseError] = useState<ParseTreeError | null>(null);

  useEffect(() => {
    if (text.trim() === '') {
      setRoot(null);
      setParseError(null);
      return;
    }
    const handle = setTimeout(() => {
      const result = parseToTree(text);
      if (result.ok) {
        setRoot(result.root);
        setParseError(null);
      } else {
        setParseError(result.error);
        // Keep the previous flat array on parse failure — user sees the
        // last good tree while they fix the JSON.
      }
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, setRoot]);

  const visible = useMemo(() => deriveVisible(flat, closed), [flat, closed]);

  if (text.trim() === '') {
    return (
      <Hint>Type or paste JSON in the editor to see the tree here.</Hint>
    );
  }
  if (flat.length === 0 && parseError) {
    return <ParseErrorView error={parseError} />;
  }
  if (flat.length === 0) {
    return null;
  }
  return (
    <div className="h-full font-mono text-xs">
      <List
        rowComponent={VirtualRow}
        rowCount={visible.length}
        rowHeight={ROW_HEIGHT}
        rowProps={{ rows: visible }}
        overscanCount={10}
        style={{ height: '100%' }}
      />
    </div>
  );
}

function VirtualRow({
  index,
  style,
  rows,
}: RowComponentProps<{ rows: FlatRow[] }>) {
  // The List positions each row absolutely via `style`; we wrap TreeNode
  // so we don't need to thread the style prop through every row variant.
  return (
    <div style={style}>
      <TreeNode row={rows[index]} />
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

function ParseErrorView({ error }: { error: ParseTreeError }) {
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
