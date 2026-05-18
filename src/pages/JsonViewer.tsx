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
          content="Free JSON viewer. Paste, drag-drop, or load from a URL. Format, minify, sort keys. Tree view with click-to-copy JSONPath. 100% client-side."
        />
      </Head>
      <Hero
        h1="JSON Viewer"
        lede="Paste, drag-drop, or load JSON from a URL. See it formatted as a tree with syntax highlighting and click-to-copy paths. Nothing leaves your browser."
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

export default Component;
