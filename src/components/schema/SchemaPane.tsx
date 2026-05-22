// Schema tab content. Controlled component: parent (`RightPane.tsx`)
// owns the schema-inference state (result, loading, error, stale) and
// passes the Refresh action down. Local state is limited to the
// transient "Copied" confirmation on the clipboard button.
//
// Sub-tabs (JSON Schema / TypeScript / Zod) display the format
// switcher up front; only JSON Schema is enabled at slice 4. The
// other two are visible-but-disabled to telegraph the roadmap
// without committing to the API surface — they enable when slice 5
// lands the additional emitters.
//
// The honest-loading-state requirement (~500ms gap is "is anything
// happening?" territory): Loader2 spinner with "Inferring schema…"
// text shows immediately on first activation, well before the worker
// round-trip completes. Error state shows the message inline; if the
// worker throws an unexpected exception during inference, the parent
// catches it and routes the message here.
//
// Footer chip surfaces the strict-thresholding rule so users seeing
// `foo: string (required)` know one anomalous record would have
// flipped it to optional — prevents surprised bug reports.

import { AlertCircle, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { JsonSchemaEmitResult } from '@/lib/schema/emit-json-schema';

type Props = {
  result: JsonSchemaEmitResult | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  onRefresh: () => void;
};

export function SchemaPane({
  result,
  loading,
  error,
  stale,
  onRefresh,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context). User can still
      // select + copy manually from the displayed source. Silent
      // failure — no need to nag with an error.
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1">
        <Tabs value="json-schema" className="flex-1">
          <TabsList variant="line" className="h-7">
            <TabsTrigger value="json-schema" className="text-xs">
              JSON Schema
            </TabsTrigger>
            <TabsTrigger value="typescript" className="text-xs" disabled>
              TypeScript
            </TabsTrigger>
            <TabsTrigger value="zod" className="text-xs" disabled>
              Zod
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!result || loading}
            className="h-7 gap-1 px-2 text-xs"
            title="Copy schema source to clipboard"
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
            {result.source}
          </pre>
        )}
      </div>
      <div className="text-muted-foreground bg-muted/30 border-t px-3 py-1.5 text-xs">
        Required = present in 100% of samples
      </div>
    </div>
  );
}
