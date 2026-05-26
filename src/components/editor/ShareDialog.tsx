// Share-via-URL dialog. Opens from the toolbar's Share button when
// the active document is small enough that encoding might fit under
// the URL ceiling (the toolbar applies a cheap raw-byte gate first).
//
// Two output states inside the dialog:
//   - Encoded fits → show the full URL in a read-only input + Copy
//     button + size readout ("x KB → y KB encoded"). User copies and
//     pastes wherever (Slack, email, etc.).
//   - Encoded exceeds the limit → rare, only happens for nearly
//     incompressible content that snuck past the raw-byte gate. Show
//     a clear "too random to compress" message + the size numbers so
//     the user understands why their borderline-size doc didn't fit.
//
// Privacy framing in the description is load-bearing: the link's
// fragment never reaches a server, matching the project's existing
// "we never see your data" claim. Without that line, a
// security-conscious user might assume the link uploads somewhere.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyText } from '@/lib/clipboard';
import { encodeForShare } from '@/lib/share/share';

type Props = {
  open: boolean;
  text: string;
  onClose: () => void;
};

export function ShareDialog({ open, text, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  // Track the active "revert Copied state" timer so we can clear it
  // on unmount (avoids React-18 setState-after-unmount warnings if
  // the user closes the dialog within 2s of copying) and on rapid
  // re-clicks (avoids the previous timer racing the new one).
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Encode lazily — only when the dialog is open. Memoized on `text`
  // so reopening the dialog without changing text reuses the result.
  // (lz-string is sync, ~ms even for tens of KB, but encoding on
  // every render would still be wasteful.)
  const result = useMemo(() => {
    if (!open) return null;
    return encodeForShare(text);
  }, [open, text]);

  // Build the full shareable URL on the fly so it always reflects the
  // current origin (works in dev / preview / prod without baking the
  // host into the encoded payload).
  const fullUrl = useMemo(() => {
    if (result === null || !result.ok) return '';
    // window.location.origin + pathname stays stable across the user's
    // session; the hash is what carries the payload.
    if (typeof window === 'undefined') return result.hash;
    return `${window.location.origin}${window.location.pathname}${result.hash}`;
  }, [result]);

  // Reset the "Copied" affirmation when the dialog closes so the next
  // open starts clean.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  // Cancel the revert timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!result?.ok) return;
    const ok = await copyText(fullUrl);
    if (ok) {
      setCopied(true);
      // Cancel any in-flight revert from a previous copy click so
      // rapid double-clicks don't race their timers.
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
      // Auto-revert after 2s so the user gets a clear "it happened"
      // pulse without sticky state if they click again.
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share via URL</DialogTitle>
          <DialogDescription>
            The document is compressed into the link's fragment (the part
            after <code className="font-mono">#</code>). Fragments never
            reach a server — the recipient's browser decodes it locally.
          </DialogDescription>
        </DialogHeader>

        {result === null ? null : result.ok ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                value={fullUrl}
                readOnly
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
                // Stable e2e selector for share-link.spec.ts —
                // dialog inputs are otherwise indistinguishable.
                data-testid="share-link-input"
              />
              <Button
                onClick={() => {
                  void handleCopy();
                }}
                size="sm"
                variant={copied ? 'secondary' : 'default'}
                aria-label="Copy share link"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 size-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-4" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="text-muted-foreground text-xs">
              {formatBytes(result.rawBytes)} JSON →{' '}
              {result.encodedChars.toLocaleString()} chars in URL
            </div>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-destructive font-medium">
              JSON is too random to compress into a shareable URL.
            </p>
            <p className="text-muted-foreground text-xs">
              {formatBytes(result.rawBytes)} JSON compressed to{' '}
              {result.encodedChars.toLocaleString()} chars, but the limit
              is {result.limit.toLocaleString()} (keeps the URL under 8 KB
              for most edge proxies). Save the JSON as a file and share
              that instead.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
