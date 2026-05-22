import { ClientOnly, Head } from 'vite-react-ssg';
import { AppShell } from '@/components/layout/AppShell';
import { ResizablePanes } from '@/components/layout/ResizablePanes';
import { MonacoPane } from '@/components/editor/MonacoPane';
import { RightPane } from '@/components/tree/RightPane';

// TooltipProvider + Toaster live in RootLayout so they wrap all routes.
// MonacoPane is wrapped in <ClientOnly>: Monaco's CSS imports break SSG
// (Node can't load `.css` files); rendering it only on hydration is fine
// because the editor is interactive-only anyway.
function App() {
  return (
    <>
      <Head>
        <title>json-tool — fast JSON viewer, formatter, tree explorer</title>
        <meta
          name="description"
          content="Free JSON tool: paste, format, minify, sort keys, tree view with click-to-copy JSONPath. Up to 500MB. 100% client-side."
        />
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
