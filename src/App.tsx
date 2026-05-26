import { ClientOnly, Head } from 'vite-react-ssg';
import { AppShell } from '@/components/layout/AppShell';
import { ResizablePanes } from '@/components/layout/ResizablePanes';
import { MonacoPane } from '@/components/editor/MonacoPane';
import { RightPane } from '@/components/tree/RightPane';
import { useShareHashLoad } from '@/lib/share/useShareHashLoad';

// TooltipProvider + Toaster live in RootLayout so they wrap all routes.
// MonacoPane is wrapped in <ClientOnly>: Monaco's CSS imports break SSG
// (Node can't load `.css` files); rendering it only on hydration is fine
// because the editor is interactive-only anyway.
function App() {
  // Consume the `#json=` share payload (if any) that index.html's
  // inline strip stashed on dataset.pendingShareText. Mounted at the
  // App level so it runs once per page-load, before any user input
  // races against it. SSR-safe — the hook short-circuits when
  // `document` is undefined during the SSG render pass.
  useShareHashLoad();

  return (
    <>
      <Head>
        <title>json-tool — fast JSON viewer, formatter, tree explorer</title>
        <meta
          name="description"
          content="Free JSON tool: paste, format, minify, sort keys, tree view with click-to-copy JSONPath. Up to 500MB. We never see your data."
        />
        {/* Open Graph + Twitter Card. og:title/og:description reuse the
            on-page values; og:image + og:url stay brand-gated (need
            canonical domain + a screenshot the brand decision unblocks). */}
        <meta property="og:title" content="json-tool — fast JSON viewer, formatter, tree explorer" />
        <meta property="og:description" content="Free JSON tool: paste, format, minify, sort keys, tree view with click-to-copy JSONPath. Up to 500MB. We never see your data." />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="json-tool" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="json-tool — fast JSON viewer, formatter, tree explorer" />
        <meta name="twitter:description" content="Free JSON tool: paste, format, minify, sort keys, tree view with click-to-copy JSONPath. Up to 500MB. We never see your data." />
      </Head>
      <AppShell>
        <ResizablePanes
          left={
            <ClientOnly>
              {() => <MonacoPane />}
            </ClientOnly>
          }
          right={<RightPane />}
        />
      </AppShell>
    </>
  );
}

export default App;
