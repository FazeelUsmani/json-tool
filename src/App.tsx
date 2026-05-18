import { AppShell } from '@/components/layout/AppShell';
import { ResizablePanes } from '@/components/layout/ResizablePanes';
import { MonacoPane } from '@/components/editor/MonacoPane';
import { TreeView } from '@/components/tree/TreeView';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <>
      <AppShell>
        <ResizablePanes left={<MonacoPane />} right={<TreeView />} />
      </AppShell>
      <Toaster />
    </>
  );
}

export default App;
