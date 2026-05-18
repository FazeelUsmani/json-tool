import { AppShell } from '@/components/layout/AppShell';
import { ResizablePanes } from '@/components/layout/ResizablePanes';
import { MonacoPane } from '@/components/editor/MonacoPane';

function TreePlaceholder() {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
      Tree view — naive renderer in W1 Wed, virtualized in W2
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <ResizablePanes left={<MonacoPane />} right={<TreePlaceholder />} />
    </AppShell>
  );
}

export default App;
