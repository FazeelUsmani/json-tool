// Schema tab content. Controlled component: parent (`RightPane.tsx`)
// owns the schema-inference state (result, loading, error, stale) and
// passes the Refresh action down. Local state: sub-tab selection
// (JSON Schema / TypeScript / Zod) + transient "Copied" confirmation
// on the clipboard button.
//
// All three emit results arrive in a single SchemaTripleResult from
// the worker, so sub-tab switching is instant — no second worker
// round-trip when the user toggles between formats. The body
// switches on `subTab` to pick `result.jsonSchema.source` /
// `result.typescript.source` / `result.zod.source`.
//
// The honest-loading-state requirement (~500ms gap is "is anything
// happening?" territory): Loader2 spinner with "Inferring schema…"
// text shows immediately on first activation, well before the worker
// round-trip completes. Error state shows the message inline.
//
// Footer chip surfaces both strict-thresholding rules so users
// seeing `foo: string | null (required + nullable)` know one
// anomalous record per rule would have flipped each bit.

import { AlertCircle, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copyText } from '@/lib/clipboard';
import type { SchemaTripleResult } from '@/lib/schema/result';

type Props = {
  result: SchemaTripleResult | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  onRefresh: () => void;
};

type SubTab = 'json-schema' | 'typescript' | 'zod';

export function SchemaPane({
  result,
  loading,
  error,
  stale,
  onRefresh,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('json-schema');
  const [copied, setCopied] = useState(false);

  const sourceBySubTab: Record<SubTab, string> =
    result === null
      ? { 'json-schema': '', typescript: '', zod: '' }
      : {
          'json-schema': result.jsonSchema.source,
          typescript: result.typescript.source,
          zod: result.zod.source,
        };
  const activeSource = sourceBySubTab[subTab];

  const handleCopy = async () => {
    if (!result) return;
    // Silent on clipboard failure (insecure context); user can select
    // + copy manually from the displayed source.
    if (await copyText(activeSource)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1">
        <Tabs
          value={subTab}
          onValueChange={(v) => setSubTab(v as SubTab)}
          className="flex-1"
        >
          <TabsList variant="line" className="h-7">
            <TabsTrigger value="json-schema" className="text-xs">
              JSON Schema
            </TabsTrigger>
            <TabsTrigger value="typescript" className="text-xs">
              TypeScript
            </TabsTrigger>
            <TabsTrigger value="zod" className="text-xs">
              Zod
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!result || loading}
            className="h-7 gap-1 px-2 text-xs"
            title="Copy current format's source to clipboard"
          >
            <Copy className="size-3" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="relative h-7 gap-1 px-2 text-xs"
            title={
              stale
                ? 'Tree has changed since last inference — click to update'
                : 'Re-run inference'
            }
          >
            <RefreshCw
              className={loading ? 'size-3 animate-spin' : 'size-3'}
            />
            Refresh
            {stale && !loading && (
              <span
                aria-hidden
                className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500"
              />
            )}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Inferring schema…
          </div>
        )}
        {!loading && error && (
          <div className="text-destructive flex h-full items-start gap-2 p-4 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!loading && !error && result && (
          <pre className="m-0 overflow-auto p-3 font-mono text-xs leading-relaxed">
            {activeSource}
          </pre>
        )}
      </div>
      <div className="text-muted-foreground bg-muted/30 border-t px-3 py-1.5 text-xs">
        Required = present in all samples · Nullable = null in any sample
      </div>
    </div>
  );
}
