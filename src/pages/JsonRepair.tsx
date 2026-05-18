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
          content="Paste broken JSON — trailing commas, unquoted keys, single quotes, comments. We try to repair it client-side and show a before/after diff."
        />
      </Head>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">JSON Repair</h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
          Paste broken JSON — trailing commas, single quotes, unquoted keys,
          comments, truncated arrays. We try to repair it client-side and show
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
          <li>• 100% client-side — your tokens stay yours</li>
        </ul>
      </main>
    </>
  );
}

export default Component;
