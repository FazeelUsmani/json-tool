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

export default Component;
