import { memo, useEffect, useState } from 'react';
import { Copy, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { TreeNode as TreeNodeData } from '@/lib/tree/parse';
import type { FlatRow, ParentKind } from '@/lib/tree/flatten';
import { copyText } from '@/lib/clipboard';
import { highlight } from '@/lib/tree/highlight';
import { useViewStore } from '@/state/viewStore';
import { useStubExpansion } from '@/state/useStubExpansion';

type PrimitiveNode = Extract<
  TreeNodeData,
  { kind: 'string' | 'number' | 'boolean' | 'null' }
>;
type CompositeNode = Extract<TreeNodeData, { kind: 'object' | 'array' }>;
type StubNode = Extract<
  TreeNodeData,
  { kind: 'stub-object' | 'stub-array' }
>;

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
  if (row.kind === 'stub') return <StubRow row={row} flatIdx={flatIdx} />;
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

// Renders a depth >= MAX_SPINE_DEPTH composite that hasn't been materialized yet. Visually
// matches OpenRow's collapsed state — caret + key + bracketed-elide + count
// pill — but has no toggle handler. Step 7 wires click-to-expand via
// parserHost.expandStub; until then the row is focusable / copyable /
// drawer-openable but inert otherwise.
// Cap on the inline preview slice length (in bytes). A single string-valued
// element can be megabytes; reading + decoding that per visible row blocks
// scrolling. Anything past this falls back to `{ … }`. CSS overflow handles
// medium-long previews (200-byte JSON usually wraps fine in a 24px row).
const STUB_PREVIEW_MAX_BYTES = 256;

// Module-level cache of decoded stub previews, keyed by sourceBlob ref so
// new file loads get a fresh cache automatically (WeakMap GCs the entry
// once the old Blob is no longer referenced). Without this, virtualized
// rows that scroll out mid-decode lose their in-flight Blob.text() to
// effect cleanup and have to re-decode on the next mount — which is why
// bareness shifted between renders before this landed.
const stubPreviewCache = new WeakMap<Blob, Map<string, string>>();

function getCachedStubPreview(blob: Blob, id: string): string | undefined {
  return stubPreviewCache.get(blob)?.get(id);
}

function setCachedStubPreview(blob: Blob, id: string, text: string): void {
  let inner = stubPreviewCache.get(blob);
  if (!inner) {
    inner = new Map();
    stubPreviewCache.set(blob, inner);
  }
  inner.set(id, text);
}

function StubRow({
  row,
  flatIdx,
}: {
  row: Extract<FlatRow, { kind: 'stub' }>;
  flatIdx: number;
}) {
  const { query, openDrawer, setFocusedIndex, isExpanding } = useViewStore(
    useShallow((s) => ({
      query: s.query,
      openDrawer: s.openDrawer,
      setFocusedIndex: s.setFocusedIndex,
      isExpanding: s.expandingPaths.has(row.id),
    })),
  );
  const isFocused = useViewStore((s) => s.focusedIndex === flatIdx);
  const sourceBlob = useViewStore((s) => s.sourceBlob);
  const expand = useStubExpansion();
  const node = row.node;
  const isObj = node.kind === 'stub-object';
  const openCh = isObj ? '{' : '[';
  const closeCh = isObj ? '}' : ']';

  // Lazy-load the preview text by slicing sourceBlob from the first
  // preview range's start to the last range's end (the commas between
  // ranges come along for free — they're between the captured element
  // bounds in the source). Decoded text caches at module level so a row
  // that unmounts mid-decode (virtualization scrolls fast) doesn't lose
  // its result — the next mount hits the cache immediately.
  const [previewText, setPreviewText] = useState<string | null>(() =>
    sourceBlob ? getCachedStubPreview(sourceBlob, row.id) ?? null : null,
  );
  useEffect(() => {
    if (!sourceBlob || node.preview.length === 0) {
      setPreviewText(null);
      return;
    }
    const cached = getCachedStubPreview(sourceBlob, row.id);
    if (cached !== undefined) {
      setPreviewText(cached);
      return;
    }
    const start = node.preview[0].byteStart;
    const end = node.preview[node.preview.length - 1].byteEnd;
    if (end - start > STUB_PREVIEW_MAX_BYTES) {
      setPreviewText(null);
      return;
    }
    let cancelled = false;
    sourceBlob
      .slice(start, end)
      .text()
      .then((text) => {
        // Cache BEFORE the cancelled check so re-mounts can hit it even
        // if this particular component instance already unmounted.
        setCachedStubPreview(sourceBlob, row.id, text);
        if (!cancelled) setPreviewText(text);
      })
      .catch(() => {
        // Blob read can fail if the source was swapped mid-read; not
        // surfaced as user-visible since the fallback (`{ … }`) renders.
      });
    return () => {
      cancelled = true;
    };
  }, [sourceBlob, node.preview, row.id]);

  return (
    <Row
      pad={pad(row.depth)}
      path={row.id}
      isFocused={isFocused}
      onFocus={() => setFocusedIndex(flatIdx)}
      onToggle={isExpanding ? undefined : () => void expand(row)}
      onShowDetail={() => openDrawer(row)}
    >
      <Caret open={false} />
      <KeyLabel name={node.key} parentKind={row.parentKind} query={query} />
      <StubBody
        openCh={openCh}
        closeCh={closeCh}
        previewText={previewText}
        childCount={node.childCount}
        previewCount={node.preview.length}
      />
      {isExpanding ? (
        <Loader2 className="text-muted-foreground ml-1 size-3 animate-spin" />
      ) : (
        <StubCountPill count={node.childCount} kind={node.kind} />
      )}
    </Row>
  );
}

function StubBody({
  openCh,
  closeCh,
  previewText,
  childCount,
  previewCount,
}: {
  openCh: '{' | '[';
  closeCh: '}' | ']';
  previewText: string | null;
  childCount: number;
  previewCount: number;
}) {
  if (childCount === 0) {
    return <span>{`${openCh}${closeCh}`}</span>;
  }
  if (previewText === null) {
    return (
      <>
        <span>{openCh}</span>
        <span className="text-muted-foreground">{` … ${closeCh}`}</span>
      </>
    );
  }
  return (
    <>
      <span>{openCh} </span>
      <span className="text-muted-foreground truncate">{previewText}</span>
      {childCount > previewCount && (
        <span className="text-muted-foreground">, …</span>
      )}
      <span> {closeCh}</span>
    </>
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
  if (node.kind === 'object' || node.kind === 'array') {
    const isObj = node.kind === 'object';
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
        className={`min-w-0 flex-1 truncate ${onToggle ? 'cursor-pointer select-none' : ''}`}
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

function StubCountPill({
  count,
  kind,
}: {
  count: number;
  kind: StubNode['kind'];
}) {
  return (
    <span className="text-muted-foreground bg-muted/40 ml-1 inline-block rounded px-1 py-px font-mono text-[10px]">
      {kind === 'stub-array' ? `[${count}]` : `{${count}}`}
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
