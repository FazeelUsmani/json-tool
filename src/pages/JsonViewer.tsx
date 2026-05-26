import { Head } from 'vite-react-ssg';
import { Button } from '@/components/ui/button';

// W1-Thu stub. Real copy + structured data + screenshots land W4-Fri.

export function Component() {
  return (
    <>
      <Head>
        <title>JSON Viewer — Paste, format, inspect | json-tool</title>
        <meta
          name="description"
          content="Free JSON viewer. Paste, drag-drop, or load from a URL. Format, minify, sort keys. Tree view with click-to-copy JSONPath. We never see your data."
        />
        {/* OG/Twitter: see App.tsx for the og:image/og:url brand-gating rationale. */}
        <meta property="og:title" content="JSON Viewer — Paste, format, inspect" />
        <meta property="og:description" content="Free JSON viewer. Paste, drag-drop, or load from a URL. Format, minify, sort keys. Tree view with click-to-copy JSONPath. We never see your data." />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="json-tool" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="JSON Viewer — Paste, format, inspect" />
        <meta name="twitter:description" content="Free JSON viewer. Paste, drag-drop, or load from a URL. Format, minify, sort keys. Tree view with click-to-copy JSONPath. We never see your data." />
      </Head>
      <Hero
        h1="JSON Viewer"
        lede="Paste, drag-drop, or load JSON from a URL. See it formatted as a tree with syntax highlighting and click-to-copy paths. We never see your data."
        bullets={[
          'Format, minify, sort keys',
          'Drag-drop .json / .ndjson / .jsonl files',
          'Load from URL via ?url= query param',
          'Tree view with type badges',
          'Click-to-copy JSONPath',
        ]}
      />
    </>
  );
}

// Shared hero — stub. Will be lifted to a shared component when the four
// landings start diverging in W4.
function Hero({
  h1,
  lede,
  bullets,
}: {
  h1: string;
  lede: string;
  bullets: string[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <StubBanner />
      <h1 className="text-4xl font-bold tracking-tight">{h1}</h1>
      <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
        {lede}
      </p>
      <div className="mt-8">
        <Button asChild>
          <a href="/">Open the viewer</a>
        </Button>
      </div>
      <ul className="text-foreground/80 mt-12 space-y-2 text-sm">
        {bullets.map((b) => (
          <li key={b}>• {b}</li>
        ))}
      </ul>
    </main>
  );
}

// Brand-pending honesty marker. Rendered above every per-route SEO
// page hero until real content lands (gated on the brand decision per
// launch-readiness-gate.md). The 2026-05-22 review §7 SI #3 called
// out the gap between "we shipped 4 routes" and "the routes claim to
// be a JSON viewer landing page when they're hero+bullets stubs" —
// this banner closes the honesty gap without removing the routes
// (which would break the SSG infrastructure that's already wired).
function StubBanner() {
  return (
    <div className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 mb-6 rounded-md border px-4 py-3 text-sm">
      <strong className="font-medium">Placeholder page.</strong>{' '}
      <span className="text-muted-foreground">
        Real content lands with the brand decision. The app itself
        works at the{' '}
        <a href="/" className="underline">
          main viewer
        </a>
        .
      </span>
    </div>
  );
}

export default Component;
