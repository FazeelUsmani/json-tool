import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { TreeNode as TreeNodeData } from '@/lib/tree/parse';
import type { FlatRow, ParentKind } from '@/lib/tree/flatten';
import { copyText } from '@/lib/clipboard';
import { highlight } from '@/lib/tree/highlight';
import { useViewStore } from '@/state/viewStore';

type PrimitiveNode = Extract<
  TreeNodeData,
  { kind: 'string' | 'number' | 'boolean' | 'null' }
>;
type CompositeNode = Extract<TreeNodeData, { kind: 'object' | 'array' }>;

// W2-Mon: renders ONE row given a FlatRow. No recursion — TreeView maps
// visible rows to <TreeNode> instances. Visual output is identical to the
// previous recursive renderer.
export function TreeNode({ row }: { row: FlatRow }) {
  if (row.kind === 'open') return <OpenRow row={row} />;
  if (row.kind === 'close') return <CloseRow row={row} />;
  return <LeafRow row={row} />;
}

function OpenRow({ row }: { row: Extract<FlatRow, { kind: 'open' }> }) {
  const closed = useViewStore((s) => s.closed);
  const query = useViewStore((s) => s.query);
  const toggle = useViewStore((s) => s.toggle);
  // Search overrides collapse: while a query is active, every composite
  // renders open so search matches inside collapsed subtrees are visible.
  // The `closed` Set itself is preserved — clearing the query restores it.
  const isClosed = query === '' && closed.has(row.id);
  const isObj = row.node.kind === 'object';
  const openCh = isObj ? '{' : '[';
  const closeCh = isObj ? '}' : ']';
  return (
    <Row pad={pad(row.depth)} path={row.id} onToggle={() => toggle(row.id)}>
      <Caret open={!isClosed} />
      <KeyLabel name={row.node.key} parentKind={row.parentKind} />
      <span>{openCh}</span>
      {isClosed && (
        <>
          <span className="text-muted-foreground">
            {' '}
            … {closeCh}
          </span>
          <CountPill count={row.node.children.length} kind={row.node.kind} />
        </>
      )}
    </Row>
  );
}

function CloseRow({ row }: { row: Extract<FlatRow, { kind: 'close' }> }) {
  return (
    <div style={pad(row.depth)}>
      <CaretSpacer />
      {row.closeBracket}
    </div>
  );
}

function LeafRow({ row }: { row: Extract<FlatRow, { kind: 'leaf' }> }) {
  const node = row.node;
  if (node.kind === 'object' || node.kind === 'array') {
    // Empty composite renders inline as one row, no toggle.
    const openCh = node.kind === 'object' ? '{' : '[';
    const closeCh = node.kind === 'object' ? '}' : ']';
    return (
      <Row pad={pad(row.depth)} path={row.id}>
        <CaretSpacer />
        <KeyLabel name={node.key} parentKind={row.parentKind} />
        <span>
          {openCh}
          {closeCh}
        </span>
      </Row>
    );
  }
  return (
    <Row pad={pad(row.depth)} path={row.id}>
      <CaretSpacer />
      <KeyLabel name={node.key} parentKind={row.parentKind} />
      <TypePill kind={node.kind} />
      <Value node={node} />
    </Row>
  );
}

function pad(depth: number): React.CSSProperties {
  return { paddingLeft: depth * 16 };
}

function Row({
  pad,
  path,
  onToggle,
  children,
}: {
  pad: React.CSSProperties;
  path: string;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group hover:bg-muted/40 flex items-center" style={pad}>
      <span
        className={`flex-1 ${onToggle ? 'cursor-pointer select-none' : ''}`}
        onClick={onToggle}
      >
        {children}
      </span>
      <CopyButton path={path} />
    </div>
  );
}

function CopyButton({ path }: { path: string }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copyText(path).then((ok) => {
      if (ok) {
        toast.success('Path copied', { description: path });
      } else {
        toast.error('Could not copy', {
          description: 'Clipboard unavailable',
        });
      }
    });
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Copy ${path}`}
      className="hover:bg-muted ml-2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Copy className="text-muted-foreground size-3" />
    </button>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <span className="text-muted-foreground inline-block w-4 text-center">
      {open ? '▾' : '▸'}
    </span>
  );
}

// Width-only spacer for rows without a caret (close brackets, leaves).
// Same w-4 as Caret so primitive and composite rows align vertically.
// Separated from Caret so neither component has to know about the other's
// concern.
function CaretSpacer() {
  return <span aria-hidden className="inline-block w-4" />;
}

function KeyLabel({
  name,
  parentKind,
}: {
  name: string | null;
  parentKind: ParentKind;
}) {
  const query = useViewStore((s) => s.query);
  if (name === null) return null;
  if (parentKind === 'array') {
    return (
      <span className="text-muted-foreground">
        [{highlight(name, query)}]:{' '}
      </span>
    );
  }
  return (
    <span className="text-foreground/80">
      &quot;{highlight(name, query)}&quot;:{' '}
    </span>
  );
}

const TYPE_LABELS: Record<PrimitiveNode['kind'], string> = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  null: 'null',
};

function TypePill({ kind }: { kind: PrimitiveNode['kind'] }) {
  return (
    <span className="text-muted-foreground bg-muted/40 mr-1 inline-block rounded px-1 py-px font-mono text-[10px]">
      {TYPE_LABELS[kind]}
    </span>
  );
}

function CountPill({
  count,
  kind,
}: {
  count: number;
  kind: CompositeNode['kind'];
}) {
  return (
    <span className="text-muted-foreground bg-muted/40 ml-1 inline-block rounded px-1 py-px font-mono text-[10px]">
      {kind === 'array' ? `[${count}]` : `{${count}}`}
    </span>
  );
}

function Value({ node }: { node: PrimitiveNode }) {
  const query = useViewStore((s) => s.query);
  switch (node.kind) {
    case 'string':
      return (
        <span className="text-green-700 dark:text-green-400">
          &quot;{highlight(node.value, query)}&quot;
        </span>
      );
    case 'number':
      return (
        <span className="text-blue-700 dark:text-blue-400">
          {highlight(String(node.value), query)}
        </span>
      );
    case 'boolean':
      return (
        <span className="text-purple-700 dark:text-purple-400">
          {highlight(String(node.value), query)}
        </span>
      );
    case 'null':
      // null isn't a search target by design.
      return <span className="text-muted-foreground">null</span>;
  }
}

