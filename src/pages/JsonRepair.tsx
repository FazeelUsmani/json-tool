import { Head } from 'vite-react-ssg';
import { Button } from '@/components/ui/button';

// W1-Thu stub. Real copy + before/after examples land W4-Fri.
// Repair UX itself is W3-Wed per PLAN.MD.

export function Component() {
  return (
    <>
      <Head>
        <title>JSON Repair — fix broken JSON in the browser | json-tool</title>
        <meta
          name="description"
          content="Paste broken JSON — trailing commas, unquoted keys, single quotes, comments. We try to repair it in your browser and show a before/after diff."
        />
        {/* OG/Twitter: see App.tsx for the og:image/og:url brand-gating rationale. */}
        <meta property="og:title" content="JSON Repair — fix broken JSON in the browser" />
        <meta property="og:description" content="Paste broken JSON — trailing commas, unquoted keys, single quotes, comments. We try to repair it in your browser and show a before/after diff." />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="json-tool" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="JSON Repair — fix broken JSON in the browser" />
        <meta name="twitter:description" content="Paste broken JSON — trailing commas, unquoted keys, single quotes, comments. We try to repair it in your browser and show a before/after diff." />
      </Head>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <StubBanner />
        <h1 className="text-4xl font-bold tracking-tight">JSON Repair</h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
          Paste broken JSON — trailing commas, single quotes, unquoted keys,
          comments, truncated arrays. We try to repair it in your browser and show
          you exactly what changed.
        </p>
        <div className="mt-8">
          <Button asChild>
            <a href="/">Open the viewer</a>
          </Button>
        </div>
        <ul className="text-foreground/80 mt-12 space-y-2 text-sm">
          <li>• Common JSON5-ish fixes (trailing commas, comments, etc.)</li>
          <li>• Single-quote and unquoted-key normalization</li>
          <li>• Before / after diff so you can verify the repair</li>
          <li>• Useful for LLM output that's "almost valid"</li>
          <li>• We never see your data — your tokens stay yours</li>
        </ul>
      </main>
    </>
  );
}

// Brand-pending honesty marker. See JsonViewer.tsx StubBanner for the
// rationale (2026-05-22 review §7 SI #3).
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
