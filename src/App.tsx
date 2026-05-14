import { AppShell } from './components/layout/AppShell';
import { ResizablePanes } from './components/layout/ResizablePanes';

function EditorPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500 dark:text-neutral-400">
      Editor pane — Monaco lands in W1 Tue
    </div>
  );
}

function TreePlaceholder() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500 dark:text-neutral-400">
      Tree view — naive renderer in W1 Wed, virtualized in W2
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <ResizablePanes left={<EditorPlaceholder />} right={<TreePlaceholder />} />
    </AppShell>
  );
}

export default App;
