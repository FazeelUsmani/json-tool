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

import { useEffect, useMemo, useState } from 'react';
import { TreeView } from './TreeView';
import { SchemaPane } from '@/components/schema/SchemaPane';
import { TablePane } from '@/components/table/TablePane';
import { QueryPane } from '@/components/query/QueryPane';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useViewStore } from '@/state/viewStore';
import { inferSchemaForRoot } from '@/state/schemaHost';
import { findPrimaryArray } from '@/lib/table/primaryArray';
import type { SchemaTripleResult } from '@/lib/parser/schema.worker';
import type { TreeNode } from '@/lib/tree/parse';

export function RightPane() {
  const root = useViewStore((s) => s.root);
  const sourceBlob = useViewStore((s) => s.sourceBlob);

  const [activeTab, setActiveTab] = useState<
    'tree' | 'schema' | 'table' | 'query'
  >('tree');
  const [result, setResult] = useState<SchemaTripleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootAtInfer, setRootAtInfer] = useState<TreeNode | null>(null);

  // Identity check, not deep structural: any reparse or splice from
  // stub expansion creates a new root, which we treat as "tree
  // changed since last infer". The dot is a hint, not a blocker —
  // user can click Refresh or ignore.
  const stale = result !== null && rootAtInfer !== root;
  const schemaDisabled = root === null;
  // Table tab activates when there's a "primary array" — either the
  // root itself is an array, OR the root is an object whose largest
  // direct-child value is an array (the canonical wrapped-array
  // shape like `{"events": [...]}`). Otherwise disabled.
  const primaryArray = useMemo(() => findPrimaryArray(root), [root]);
  const tableDisabled = primaryArray === null;

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
      onValueChange={(v) =>
        setActiveTab(v as 'tree' | 'schema' | 'table' | 'query')
      }
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
          <TabsTrigger
            value="table"
            className="text-xs"
            disabled={tableDisabled}
            title={
              tableDisabled
                ? 'Table view requires a top-level array'
                : undefined
            }
          >
            Table
          </TabsTrigger>
          <TabsTrigger
            value="query"
            className="text-xs"
            disabled={root === null}
            title={
              root === null ? 'Load JSON to query' : 'JSONPath query bar'
            }
          >
            Query
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
          onRefresh={() => {
            void runInfer();
          }}
        />
      </TabsContent>
      <TabsContent
        value="query"
        // forceMount preserves the input value + result list across
        // tab switches: user types a query, clicks a result, lands
        // on Tree, comes back to Query — expects to see what they
        // just searched. Without forceMount the component remounts
        // fresh and the user loses context. jsonpath-plus only runs
        // on debounced input changes, so leaving the component
        // mounted-but-hidden doesn't re-run anything.
        forceMount
        className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <QueryPane
          root={root}
          onJumpToTree={() => setActiveTab('tree')}
        />
      </TabsContent>
      <TabsContent
        value="table"
        // Table doesn't get forceMount — it's a heavier component
        // (column-derivation effect + per-row blob.slice on stub
        // arrays), and the user explicitly opts in by clicking the
        // tab. Mount on demand, unmount on exit.
        className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        {primaryArray && (
          <TablePane
            rows={
              primaryArray.node.kind === 'array'
                ? primaryArray.node.children
                : []
            }
            path={primaryArray.path}
            // True when the primary array is a stub-array — children
            // aren't materialized yet, so TablePane shows a specific
            // "expand first" empty state instead of misleading "no rows".
            stubBacked={primaryArray.node.kind === 'stub-array'}
            sourceBlob={sourceBlob}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
