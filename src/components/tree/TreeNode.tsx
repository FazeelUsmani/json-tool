import { useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { TreeNode as TreeNodeData } from '@/lib/tree/parse';
import { copyText } from '@/lib/clipboard';

type PrimitiveNode = Extract<
  TreeNodeData,
  { kind: 'string' | 'number' | 'boolean' | 'null' }
>;

// Whether the immediate parent is an object or array — drives the rendered
// key format. JSONPath uses `.name` for object members and `[0]` for array
// elements; mirroring that here means the click-to-copy path matches what
// the user sees in the row.
type ParentKind = 'object' | 'array' | 'root';

export function TreeNode({
  node,
  depth,
  parentKind = 'root',
}: {
  node: TreeNodeData;
  depth: number;
  parentKind?: ParentKind;
}) {
  if (node.kind === 'object' || node.kind === 'array') {
    return <Composite node={node} depth={depth} parentKind={parentKind} />;
  }
  return <Primitive node={node} depth={depth} parentKind={parentKind} />;
}

function Composite({
  node,
  depth,
  parentKind,
}: {
  node: Extract<TreeNodeData, { kind: 'object' | 'array' }>;
  depth: number;
  parentKind: ParentKind;
}) {
  const [open, setOpen] = useState(true);
  const empty = node.children.length === 0;
  const isObj = node.kind === 'object';
  const openCh = isObj ? '{' : '[';
  const closeCh = isObj ? '}' : ']';
  const pad = { paddingLeft: depth * 16 };
  const childParent: ParentKind = isObj ? 'object' : 'array';

  if (empty) {
    return (
      <Row pad={pad} path={node.path}>
        <Caret hidden />
        <KeyLabel name={node.key} parentKind={parentKind} />
        <span>
          {openCh}
          {closeCh}
        </span>
      </Row>
    );
  }

  return (
    <>
      <Row pad={pad} path={node.path} onToggle={() => setOpen(!open)}>
        <Caret open={open} />
        <KeyLabel name={node.key} parentKind={parentKind} />
        <span>{openCh}</span>
        {!open && (
          <>
            <span className="text-muted-foreground">
              {' '}
              … {closeCh}
            </span>
            <CountPill count={node.children.length} kind={node.kind} />
          </>
        )}
      </Row>
      {open && (
        <>
          {node.children.map((child, i) => (
            <TreeNode
              key={i}
              node={child}
              depth={depth + 1}
              parentKind={childParent}
            />
          ))}
          <div style={pad}>
            <Caret hidden />
            {closeCh}
          </div>
        </>
      )}
    </>
  );
}

function Primitive({
  node,
  depth,
  parentKind,
}: {
  node: PrimitiveNode;
  depth: number;
  parentKind: ParentKind;
}) {
  return (
    <Row pad={{ paddingLeft: depth * 16 }} path={node.path}>
      <Caret hidden />
      <KeyLabel name={node.key} parentKind={parentKind} />
      <TypePill kind={node.kind} />
      <Value node={node} />
    </Row>
  );
}

// Single row layout: content on the left grows; copy button sits at the
// right edge, hidden until the row is hovered. Toggle (for composites) is
// only on the left content span, so clicking the copy button never fires
// the toggle.
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

function Caret({ open, hidden }: { open?: boolean; hidden?: boolean }) {
  return (
    <span className="text-muted-foreground inline-block w-4 text-center">
      {hidden ? '' : open ? '▾' : '▸'}
    </span>
  );
}

function KeyLabel({
  name,
  parentKind,
}: {
  name: string | null;
  parentKind: ParentKind;
}) {
  if (name === null) return null;
  if (parentKind === 'array') {
    return (
      <span className="text-muted-foreground">
        [{name}]:{' '}
      </span>
    );
  }
  return (
    <span className="text-foreground/80">
      &quot;{name}&quot;:{' '}
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
  kind: 'object' | 'array';
}) {
  return (
    <span className="text-muted-foreground bg-muted/40 ml-1 inline-block rounded px-1 py-px font-mono text-[10px]">
      {kind === 'array' ? `[${count}]` : `{${count}}`}
    </span>
  );
}

function Value({ node }: { node: PrimitiveNode }) {
  switch (node.kind) {
    case 'string':
      return (
        <span className="text-green-700 dark:text-green-400">
          &quot;{node.value}&quot;
        </span>
      );
    case 'number':
      return (
        <span className="text-blue-700 dark:text-blue-400">{node.value}</span>
      );
    case 'boolean':
      return (
        <span className="text-purple-700 dark:text-purple-400">
          {String(node.value)}
        </span>
      );
    case 'null':
      return <span className="text-muted-foreground">null</span>;
  }
}
