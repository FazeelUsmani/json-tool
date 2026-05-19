import { memo } from 'react';
import { Copy, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
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

// Renders ONE row given a FlatRow + its absolute flat index. The flatIdx is
// what viewStore.focusedIndex stores; passing it down avoids per-row store
// scans to derive the focused state.
//
// memo'd so unchanged rows skip re-render when their FlatRow ref is stable
// across scrolls — the parent VirtualRow + react-window recycle row slots,
// so a stable FlatRow means nothing visible needs to change.
export const TreeNode = memo(function TreeNode({
  row,
  flatIdx,
}: {
  row: FlatRow;
  flatIdx: number;
}) {
  if (row.kind === 'open') return <OpenRow row={row} flatIdx={flatIdx} />;
  if (row.kind === 'close') return <CloseRow row={row} flatIdx={flatIdx} />;
  return <LeafRow row={row} flatIdx={flatIdx} />;
});

function OpenRow({
  row,
  flatIdx,
}: {
  row: Extract<FlatRow, { kind: 'open' }>;
  flatIdx: number;
}) {
  // One shallow-compared selector instead of six independent subscriptions:
  // 40 visible rows × 6 selectors = 240 selector evaluations per store
  // update — useShallow collapses that to 40. isFocused stays separate so
  // a focus change only re-renders the two rows whose boolean flips, not
  // all of them.
  const { closedInSet, query, toggle, openDrawer, setFocusedIndex } =
    useViewStore(
      useShallow((s) => ({
        closedInSet: s.closed.has(row.id),
        query: s.query,
        toggle: s.toggle,
        openDrawer: s.openDrawer,
        setFocusedIndex: s.setFocusedIndex,
      })),
    );
  const isFocused = useViewStore((s) => s.focusedIndex === flatIdx);
  // Closed state is sacred — a collapsed subtree stays collapsed during
  // search. Matches inside it are reported in the count but won't render
  // until the user opens the parent.
  const isClosed = closedInSet;
  const isObj = row.node.kind === 'object';
  const openCh = isObj ? '{' : '[';
  const closeCh = isObj ? '}' : ']';
  return (
    <Row
      pad={pad(row.depth)}
      path={row.id}
      isFocused={isFocused}
      onFocus={() => setFocusedIndex(flatIdx)}
      onToggle={() => toggle(row.id)}
      onShowDetail={() => openDrawer(row)}
    >
      <Caret open={!isClosed} />
      <KeyLabel name={row.node.key} parentKind={row.parentKind} query={query} />
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

function CloseRow({
  row,
  flatIdx,
}: {
  row: Extract<FlatRow, { kind: 'close' }>;
  flatIdx: number;
}) {
  const setFocusedIndex = useViewStore((s) => s.setFocusedIndex);
  const isFocused = useViewStore((s) => s.focusedIndex === flatIdx);
  return (
    <div
      className={`flex items-center border-l-2 ${
        isFocused ? 'border-primary bg-accent/30' : 'border-transparent'
      }`}
      style={pad(row.depth)}
      onMouseDown={() => setFocusedIndex(flatIdx)}
    >
      <CaretSpacer />
      {row.closeBracket}
    </div>
  );
}

function LeafRow({
  row,
  flatIdx,
}: {
  row: Extract<FlatRow, { kind: 'leaf' }>;
  flatIdx: number;
}) {
  const { query, openDrawer, setFocusedIndex } = useViewStore(
    useShallow((s) => ({
      query: s.query,
      openDrawer: s.openDrawer,
      setFocusedIndex: s.setFocusedIndex,
    })),
  );
  const isFocused = useViewStore((s) => s.focusedIndex === flatIdx);
  const node = row.node;
  if (
    node.kind === 'object' ||
    node.kind === 'array' ||
    node.kind === 'stub-object' ||
    node.kind === 'stub-array'
  ) {
    // Stubs render as empty composites for now — step 6 of the W3-Mon
    // build adds proper stub UI (childCount pill + expand click). Until
    // the worker is wired (step 5), stubs never reach this code at
    // runtime, so the placeholder render is invisible.
    const isObj = node.kind === 'object' || node.kind === 'stub-object';
    const openCh = isObj ? '{' : '[';
    const closeCh = isObj ? '}' : ']';
    return (
      <Row
        pad={pad(row.depth)}
        path={row.id}
        isFocused={isFocused}
        onFocus={() => setFocusedIndex(flatIdx)}
        onShowDetail={() => openDrawer(row)}
      >
        <CaretSpacer />
        <KeyLabel name={node.key} parentKind={row.parentKind} query={query} />
        <span>
          {openCh}
          {closeCh}
        </span>
      </Row>
    );
  }
  return (
    <Row
      pad={pad(row.depth)}
      path={row.id}
      isFocused={isFocused}
      onFocus={() => setFocusedIndex(flatIdx)}
      onShowDetail={() => openDrawer(row)}
    >
      <CaretSpacer />
      <KeyLabel name={node.key} parentKind={row.parentKind} query={query} />
      <TypePill kind={node.kind} />
      <Value node={node} query={query} />
    </Row>
  );
}

function pad(depth: number): React.CSSProperties {
  return { paddingLeft: depth * 16 };
}

function Row({
  pad,
  path,
  isFocused,
  onFocus,
  onToggle,
  onShowDetail,
  children,
}: {
  pad: React.CSSProperties;
  path: string;
  isFocused: boolean;
  onFocus: () => void;
  onToggle?: () => void;
  onShowDetail?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group flex items-center border-l-2 ${
        isFocused
          ? 'border-primary bg-accent/30'
          : 'hover:bg-muted/40 border-transparent'
      }`}
      style={pad}
      onMouseDown={onFocus}
    >
      <span
        className={`flex-1 ${onToggle ? 'cursor-pointer select-none' : ''}`}
        onClick={onToggle}
      >
        {children}
      </span>
      {onShowDetail && <InfoButton onClick={onShowDetail} />}
      <CopyButton path={path} />
    </div>
  );
}

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Show details"
      className="hover:bg-muted text-muted-foreground rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Info className="size-3" />
    </button>
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
      className="hover:bg-muted ml-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
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

function CaretSpacer() {
  return <span aria-hidden className="inline-block w-4" />;
}

function KeyLabel({
  name,
  parentKind,
  query,
}: {
  name: string | null;
  parentKind: ParentKind;
  query: string;
}) {
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

function Value({ node, query }: { node: PrimitiveNode; query: string }) {
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
      return <span className="text-muted-foreground">null</span>;
  }
}
