import { Head } from 'vite-react-ssg';
import { Button } from '@/components/ui/button';

// W1-Thu stub. Real copy + NDJSON-specific screenshots land W4-Fri.
// NDJSON mode itself is W3-Thu per PLAN.MD.

export function Component() {
  return (
    <>
      <Head>
        <title>NDJSON Viewer — line-delimited JSON in the browser | json-tool</title>
        <meta
          name="description"
          content="Open NDJSON / JSON Lines files (logs, LLM training data, exports). Line-paginated browser, expand individual lines, search across the file."
        />
      </Head>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">NDJSON Viewer</h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
          Open NDJSON / JSON Lines files in your browser — logs, LLM training
          data, MongoDB exports. Line-paginated, lazy-expanded per record,
          searchable across the file.
        </p>
        <div className="mt-8">
          <Button asChild>
            <a href="/">Open the viewer</a>
          </Button>
        </div>
        <ul className="text-foreground/80 mt-12 space-y-2 text-sm">
          <li>• Auto-detect NDJSON vs. JSON on load</li>
          <li>• Line-paginated for files into the hundreds of MB</li>
          <li>• Expand individual records into a tree view</li>
          <li>• Search keys / values across all lines</li>
          <li>• Same client-side guarantee — no server upload</li>
        </ul>
      </main>
    </>
  );
}

export default Component;
