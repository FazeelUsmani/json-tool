// Hardcoded Tree + Schema tab switcher for the right pane.
//
// Intentionally NOT a generic abstraction. If a third tab lands
// (W4-Tue diff view? W5 query bar?), we extract a real wrapper
// then. Premature abstraction is the bigger risk than the future
// refactor cost.
//
// Schema inference is kicked off the first time the user switches
// to the Schema tab. The result lives in this component's state so
// switching back to Tree and returning doesn't re-infer — Refresh
// is the only re-trigger path. Stale-dot lights up when the
// underlying root TreeNode identity changes (any reparse or stub
// expand) since the last inference; identity-based not structural,
// per the M1 contract.
//
// Both TabsContent panels use forceMount + data-[state=inactive]:hidden
// so TreeView's react-window scroll position + any in-flight search
// + the tree's local UI state survive tab switches. Inactive content
// stays in DOM but is hidden from screen readers (display: none) and
// not visually shown. Cheaper than the unmount/remount churn at
// 2.25M-row scale.

import { useEffect, useState } from 'react';
import { TreeView } from './TreeView';
import { SchemaPane } from '@/components/schema/SchemaPane';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useViewStore } from '@/state/viewStore';
import { inferSchemaForRoot } from '@/state/schemaHost';
import type { JsonSchemaEmitResult } from '@/lib/schema/emit-json-schema';
import type { TreeNode } from '@/lib/tree/parse';

export function RightPane() {
  const root = useViewStore((s) => s.root);
  const sourceBlob = useViewStore((s) => s.sourceBlob);

  const [activeTab, setActiveTab] = useState<'tree' | 'schema'>('tree');
  const [result, setResult] = useState<JsonSchemaEmitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootAtInfer, setRootAtInfer] = useState<TreeNode | null>(null);

  // Identity check, not deep structural: any reparse or splice from
  // stub expansion creates a new root, which we treat as "tree
  // changed since last infer". The dot is a hint, not a blocker —
  // user can click Refresh or ignore.
  const stale = result !== null && rootAtInfer !== root;
  const schemaDisabled = root === null;

  async function runInfer() {
    if (root === null || sourceBlob === null) {
      setError('No document loaded — drop a file or paste JSON first.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await inferSchemaForRoot(root, sourceBlob);
      setResult(next);
      setRootAtInfer(root);
    } catch (err) {
      // schemaHost tags supersede-by-later-call rejections with
      // name='AbortError'. Anything else is a genuine inference
      // failure (parse error inside a sampled stub, worker crash,
      // etc.) — surface the message so users see what happened.
      if (err instanceof Error && err.name === 'AbortError') return;
      const message =
        err instanceof Error ? err.message : 'Schema inference failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // First-time activation of the Schema tab triggers inference.
  // Subsequent activations don't re-fire — result is cached and
  // Refresh is the explicit re-trigger.
  useEffect(() => {
    if (activeTab !== 'schema') return;
    if (result !== null || loading || error !== null) return;
    void runInfer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as 'tree' | 'schema')}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="border-b px-3 pt-1.5">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="tree" className="text-xs">
            Tree
          </TabsTrigger>
          <TabsTrigger
            value="schema"
            className="text-xs"
            disabled={schemaDisabled}
          >
            Schema
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        value="tree"
        forceMount
        className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <TreeView />
      </TabsContent>
      <TabsContent
        value="schema"
        forceMount
        className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <SchemaPane
          result={result}
          loading={loading}
          error={error}
          stale={stale}
          onRefresh={runInfer}
        />
      </TabsContent>
    </Tabs>
  );
}
