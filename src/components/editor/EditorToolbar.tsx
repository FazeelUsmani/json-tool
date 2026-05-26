import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDocumentStore } from '@/state/documentStore';
import {
  formatJson,
  minifyJson,
  sortKeysJson,
  type FormatError,
  type FormatResult,
} from '@/lib/json/format';
import { repair } from '@/lib/json/repair';
import { fetchUrl, type FetchUrlError } from '@/lib/net/fetchUrl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MAX_FILE_BYTES, VIEWER_ONLY_THRESHOLD } from './constants';
import { RepairDialog } from './RepairDialog';
import { ShareDialog } from './ShareDialog';

// Cheap raw-byte gate before opening the Share dialog. Real ceiling
// is on the *encoded* string (DEFAULT_ENCODED_LIMIT = 7500 chars to
// keep URLs under 8 KB), but encoding on every keystroke just to keep
// the button's disabled state honest would be wasteful. Heuristic:
// typical JSON compresses ~5×, conservative pessimist is ~2×, so
// raw > 2 × encoded-limit ≈ 15 KB is unlikely to fit. Below this
// threshold, click → encode in the dialog → dialog handles the rare
// "borderline + uncompressible" case with the oversize state.
const SHARE_RAW_BYTE_LIMIT = 15_000;

type Transform = (text: string) => FormatResult;

type Props = {
  // Lifted to MonacoPane so format/URL errors AND file-drop errors share
  // the same pill. Ephemeral UI state — stays out of documentStore.
  error: string | null;
  setError: (error: string | null) => void;
};

export function EditorToolbar({ error, setError }: Props) {
  const text = useDocumentStore((s) => s.text);
  const source = useDocumentStore((s) => s.source);
  const setText = useDocumentStore((s) => s.setText);

  const [urlInput, setUrlInput] = useState('');
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  // Tracked separately from source.url (which holds the resolved finalUrl
  // from fetchUrl). When they differ, a redirect happened — surface it.
  const [requestedUrl, setRequestedUrl] = useState<string | null>(null);
  // Repair dialog state: null = closed; { before, after } = open with
  // those two strings populating the Monaco diff editor.
  const [repairCandidate, setRepairCandidate] = useState<{
    before: string;
    after: string;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Use source.size when available (file/url load — already-known byte
  // count); fall back to text.length for paste/sample (string length
  // ≈ UTF-8 bytes for the ASCII-heavy JSON case, slight under-count
  // for multi-byte content but conservative-enough for the gate).
  const rawByteEstimate =
    source?.kind === 'file' || source?.kind === 'url' || source?.kind === 'sample'
      ? source.size
      : text.length;
  const shareDisabled =
    text.trim() === '' || rawByteEstimate > SHARE_RAW_BYTE_LIMIT;
  const shareDisabledReason =
    text.trim() === ''
      ? 'Nothing to share — paste some JSON first.'
      : `Document is ${(rawByteEstimate / 1024).toFixed(1)} KB — too large to fit in a share URL. Save as a file instead.`;

  const handleRepair = () => {
    if (text.trim() === '') {
      toast('Nothing to repair — paste some JSON first.');
      return;
    }
    const result = repair(text);
    switch (result.kind) {
      case 'already-valid':
        toast.success('Already valid JSON — no repair needed.');
        return;
      case 'repaired':
        setRepairCandidate({ before: text, after: result.repaired });
        return;
      case 'unrepairable':
        toast.error(`Could not repair: ${result.error}`);
        return;
    }
  };

  const applyRepair = () => {
    if (repairCandidate === null) return;
    setText(repairCandidate.after, source ?? { kind: 'paste' });
    setError(null);
    setRepairCandidate(null);
    toast.success('Repair applied.');
  };

  const run = (transform: Transform) => {
    if (text.trim() === '') return;
    const result = transform(text);
    if (result.ok) {
      setText(result.text, source ?? { kind: 'paste' });
      setError(null);
      return;
    }
    setError(describeFormatError(result.error));
  };

  const loadFromUrl = async (url: string) => {
    setLoadingUrl(url);
    setRequestedUrl(url);
    setError(null);
    try {
      const result = await fetchUrl(url, { maxBytes: MAX_FILE_BYTES });
      if (!result.ok) {
        setError(describeFetchError(result.error));
        return;
      }
      const source = {
        kind: 'url' as const,
        url: result.finalUrl,
        size: result.bytes,
      };
      // Mirror MonacoPane's file-drop dispatch: skip Monaco above the
      // viewer-only threshold and route the Blob straight to the streaming
      // parser via documentStore.file. Below the threshold, decode for
      // Monaco display but still carry the Blob so the parser worker
      // reads bytes via blob.stream() instead of re-encoding the text.
      if (result.bytes > VIEWER_ONLY_THRESHOLD) {
        setText('', source, result.blob);
        return;
      }
      const text = await result.blob.text();
      setText(text, source, result.blob);
    } finally {
      setLoadingUrl(null);
    }
  };

  const handleUrlSubmit = () => {
    const url = urlInput.trim();
    if (url === '' || loadingUrl !== null) return;
    // Fire-and-forget — errors surface via setError inside loadFromUrl.
    // `void` operator silences no-floating-promises while keeping the
    // call intentional (we deliberately do not block the keystroke
    // handler on the fetch).
    void loadFromUrl(url);
  };

  useEffect(() => {
    // `?url=` is a pre-fill convenience, not auto-load — the user
    // clicks Load to fire the fetch so destination servers receive
    // a request only on explicit intent. Synchronous strip lives in
    // index.html's inline <head> script (runs before Plausible's
    // pageview); the param value gets stashed on
    // document.documentElement.dataset.pendingUrl for us to consume.
    // Delete after read so HMR/remount doesn't re-prefill stale content.
    const pendingUrl = document.documentElement.dataset.pendingUrl;
    if (pendingUrl) {
      setUrlInput(pendingUrl);
      delete document.documentElement.dataset.pendingUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showChip =
    loadingUrl !== null ||
    source?.kind === 'url' ||
    source?.kind === 'file';
  const redirected =
    source?.kind === 'url' && requestedUrl !== null && requestedUrl !== source.url;

  return (
    <div className="border-b">
      <div className="bg-background flex items-center gap-2 px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => run(formatJson)}>
          Format
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(minifyJson)}>
          Minify
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(sortKeysJson)}>
          Sort keys
        </Button>
        <Button variant="outline" size="sm" onClick={handleRepair}>
          Repair
        </Button>
        {/* Tooltip wraps a span (not the button) because disabled
            buttons don't fire pointerenter — without the span the
            tooltip-on-disabled wouldn't show. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                disabled={shareDisabled}
              >
                Share
              </Button>
            </span>
          </TooltipTrigger>
          {shareDisabled && (
            <TooltipContent className="max-w-xs">
              {shareDisabledReason}
            </TooltipContent>
          )}
        </Tooltip>
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUrlSubmit();
          }}
          placeholder="Load from URL…"
          disabled={loadingUrl !== null}
          className="ml-2 h-7 max-w-xs text-xs"
        />
        {error && (
          <span className="bg-destructive/10 text-destructive ml-2 rounded-md px-2 py-1 text-xs">
            {error}
          </span>
        )}
      </div>
      {showChip && (
        <div className="text-muted-foreground bg-muted/40 border-t px-3 py-1 text-xs">
          {loadingUrl !== null ? (
            <>
              Loading from <span className="font-mono">{loadingUrl}</span>…
            </>
          ) : source?.kind === 'url' ? (
            <>
              Loaded from{' '}
              <span className="font-mono">{requestedUrl ?? source.url}</span>
              {redirected && (
                <>
                  {' · '}redirected to{' '}
                  <span className="font-mono">{source.url}</span>
                </>
              )}
            </>
          ) : source?.kind === 'file' ? (
            <>
              Loaded from <span className="font-mono">{source.name}</span>
            </>
          ) : null}
        </div>
      )}
      <RepairDialog
        open={repairCandidate !== null}
        before={repairCandidate?.before ?? ''}
        after={repairCandidate?.after ?? ''}
        onApply={applyRepair}
        onCancel={() => setRepairCandidate(null)}
      />
      <ShareDialog
        open={shareOpen}
        text={text}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function describeFormatError(error: FormatError): string {
  if (error.line !== undefined && error.col !== undefined) {
    return `Invalid JSON at line ${error.line} col ${error.col}`;
  }
  return 'Invalid JSON';
}

function describeFetchError(error: FetchUrlError): string {
  switch (error.kind) {
    case 'invalid-url':
      return 'Invalid URL';
    case 'invalid-protocol':
      return `Unsupported protocol: ${error.got} (only http: / https: allowed)`;
    case 'userinfo-not-allowed':
      return 'URL must not include credentials (user:pass@…)';
    case 'too-large':
      return `Too large: ${formatBytes(error.contentLength)} > ${formatBytes(error.max)}`;
    case 'unsupported-content-type':
      return `Unsupported content type: ${error.got || 'unknown'}`;
    case 'timeout':
      return `Timed out after ${Math.round(error.afterMs / 1000)}s`;
    case 'http':
      return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ''}`;
    case 'network':
      return 'Network error';
  }
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
