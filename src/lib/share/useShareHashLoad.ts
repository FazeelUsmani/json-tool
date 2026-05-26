// Consumes the encoded share payload that index.html's inline strip
// stashed on document.documentElement.dataset.pendingShareText.
//
// Why a hook (not a plain effect inside App.tsx): keeps the consume
// logic next to the encode/decode lib for discoverability, and the
// useEffect-once pattern is easier to test with a fake dataset than
// scattered through App.tsx.
//
// Why setText with kind:'paste' (not a new kind:'share'): the share
// flow produces text without a file/url backing — same semantic
// shape as paste. Source-chip UX doesn't need to distinguish "this
// came from a share link" vs. "this was pasted" for v1; adding a
// kind:'share' would be cosmetic and ripples through the existing
// type union for no behavioral payoff yet.

import { useEffect } from 'react';
import { toast } from 'sonner';
import { decodeShareHash } from './share';
import { useDocumentStore } from '@/state/documentStore';

export function useShareHashLoad(): void {
  const setText = useDocumentStore((s) => s.setText);

  useEffect(() => {
    // SSR safety — `document` doesn't exist during the vite-react-ssg
    // render pass. The dataset attribute only ever exists after the
    // browser parses the inline strip in index.html, so this hook is
    // a no-op outside of a real DOM anyway.
    if (typeof document === 'undefined') return;

    const encoded = document.documentElement.dataset.pendingShareText;
    if (!encoded) return;

    // Consume-once semantics: delete BEFORE the decode so a thrown
    // decoder or a re-render can't double-fire.
    delete document.documentElement.dataset.pendingShareText;

    // Re-strip the URL hash after mount. The inline script in
    // index.html strips early (before Plausible reads location.href
    // — privacy guarantee), but vite-react-ssg's router can re-derive
    // and re-apply the original URL during hydration, restoring the
    // `#json=…` fragment. Stripping again here keeps the address bar
    // clean after mount completes.
    if (
      typeof window !== 'undefined' &&
      window.location.hash.indexOf('#json=') === 0
    ) {
      window.history.replaceState(
        {},
        '',
        window.location.pathname + window.location.search,
      );
    }

    // Decoder accepts the raw payload (without `#json=` prefix) or
    // the full hash — pass the raw form since that's what index.html
    // stashed.
    const result = decodeShareHash(`#json=${encoded}`);
    if (!result.ok) {
      toast.error('Share link is corrupted — could not decode.');
      return;
    }
    setText(result.text, { kind: 'paste' });
  }, [setText]);
}
