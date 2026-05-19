import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { reconstructJson } from '@/lib/tree/subtree';
import type { FlatRow } from '@/lib/tree/flatten';
import type { TreeNode } from '@/lib/tree/parse';
import { useViewStore } from '@/state/viewStore';
import { useStubExpansion } from '@/state/useStubExpansion';

// Right-side drawer showing details for one tree row. Triggered by:
//   - clicking the Info icon on a row
//   - pressing Enter on a focused primitive (composites toggle instead)
//
// Content is read-only for now. Edit-in-drawer is M2+; that's a different
// data path (writes back to the document store, reparses).

export function DetailDrawer() {
  const drawerFor = useViewStore((s) => s.drawerFor);
  const closeDrawer = useViewStore((s) => s.closeDrawer);

  return (
    <Sheet
      open={drawerFor !== null}
      onOpenChange={(open) => {
        if (!open) closeDrawer();
      }}
    >
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Node details</SheetTitle>
          <SheetDescription className="sr-only">
            Path, type, and value for the selected tree row.
          </SheetDescription>
        </SheetHeader>
        {drawerFor && <Body row={drawerFor} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ row }: { row: FlatRow }) {
  // Close rows don't have node/path content worth showing — guard for
  // robustness even though no UI affordance triggers a drawer on close.
  if (row.kind === 'close') return null;

  const node = row.node;
  const path = row.id;
  const typeLabel = nodeTypeLabel(node);

  return (
    <div className="space-y-4 px-4 pb-4 text-sm">
      <Section label="Path">
        <div className="flex items-start gap-2">
          <code className="bg-muted/60 flex-1 rounded p-2 font-mono text-xs break-all">
            {path}
          </code>
          <CopyAction text={path} label="path" />
        </div>
      </Section>

      <Section label="Type">
        <span className="text-muted-foreground font-mono text-xs">
          {typeLabel}
        </span>
      </Section>

      {isPrimitive(node) && (
        <Section label="Value">
          <PrimitiveBody node={node} />
        </Section>
      )}

      {(node.kind === 'object' || node.kind === 'array') && (
        <CompositeBody node={node} />
      )}

      {row.kind === 'stub' && <StubBody row={row} />}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function PrimitiveBody({ node }: { node: TreeNode }) {
  if (node.kind === 'null') {
    return <span className="text-muted-foreground font-mono text-xs">null</span>;
  }
  const text =
    node.kind === 'string'
      ? (node.value as string)
      : String((node as { value: unknown }).value);
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <pre className="bg-muted/60 max-h-48 flex-1 overflow-auto rounded p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {text}
        </pre>
        <CopyAction text={text} label="value" />
      </div>
      {node.kind === 'string' && (
        <div className="text-muted-foreground text-xs">
          Length: {(node.value as string).length} chars
        </div>
      )}
    </div>
  );
}

function StubBody({ row }: { row: Extract<FlatRow, { kind: 'stub' }> }) {
  const isExpanding = useViewStore((s) => s.expandingPaths.has(row.id));
  const expand = useStubExpansion();
  const node = row.node;
  const childLabel =
    node.kind === 'stub-array'
      ? `${node.childCount} items`
      : `${node.childCount} keys`;
  return (
    <>
      <Section label="Children">
        <span className="text-muted-foreground text-xs">{childLabel}</span>
      </Section>
      <Section label="Subtree">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isExpanding}
          onClick={() => void expand(row)}
          className="w-full"
        >
          {isExpanding ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Expanding…
            </>
          ) : (
            'Expand subtree'
          )}
        </Button>
      </Section>
    </>
  );
}

function CompositeBody({ node }: { node: TreeNode }) {
  if (node.kind !== 'object' && node.kind !== 'array') return null;
  const childCount = node.children.length;
  const childLabel =
    node.kind === 'array' ? `${childCount} items` : `${childCount} keys`;
  const subtreeJson = JSON.stringify(reconstructJson(node), null, 2);
  return (
    <>
      <Section label="Children">
        <span className="text-muted-foreground text-xs">{childLabel}</span>
      </Section>
      <Section label="Subtree">
        <div className="flex items-start gap-2">
          <pre className="bg-muted/60 max-h-72 flex-1 overflow-auto rounded p-2 font-mono text-xs">
            {subtreeJson}
          </pre>
          <CopyAction text={subtreeJson} label="subtree" />
        </div>
      </Section>
    </>
  );
}

function CopyAction({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (ok) toast.success(`Copied ${label}`);
          else toast.error('Could not copy');
        });
      }}
      className="hover:bg-muted text-muted-foreground rounded p-1.5"
    >
      <Copy className="size-3.5" />
    </button>
  );
}

function isPrimitive(node: TreeNode): boolean {
  return (
    node.kind === 'string' ||
    node.kind === 'number' ||
    node.kind === 'boolean' ||
    node.kind === 'null'
  );
}

function nodeTypeLabel(node: TreeNode): string {
  if (node.kind === 'object' || node.kind === 'stub-object') return 'object';
  if (node.kind === 'array' || node.kind === 'stub-array') return 'array';
  return node.kind;
}
