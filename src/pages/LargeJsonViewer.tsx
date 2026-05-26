import { Head } from 'vite-react-ssg';
import { Button } from '@/components/ui/button';

// W1-Thu stub. Real copy lands W4-Fri. Public-claim ceiling: 500MB (per
// PLAN.MD memory).

export function Component() {
  return (
    <>
      <Head>
        <title>Large JSON Viewer — up to 500MB in the browser | json-tool</title>
        <meta
          name="description"
          content="Open and explore JSON files up to 500MB without crashing your browser. Streaming parser, virtualized tree, lazy expansion. We never see your data."
        />
      </Head>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <StubBanner />
        <h1 className="text-4xl font-bold tracking-tight">
          Large JSON Viewer
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
          Open JSON files up to 500MB right in your browser. Streaming parser,
          virtualized tree, lazy expansion — your tab doesn't crash, your data
          doesn't leave.
        </p>
        <div className="mt-8">
          <Button asChild>
            <a href="/">Open the viewer</a>
          </Button>
        </div>
        <ul className="text-foreground/80 mt-12 space-y-2 text-sm">
          <li>• Streaming parse — no full-file materialization</li>
          <li>• Virtualized tree — 60fps on 200k visible nodes</li>
          <li>• Lazy expansion — open just the subtree you need</li>
          <li>• Search with progress indicator on huge files</li>
          <li>• We never see your data — no upload, no backend</li>
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
