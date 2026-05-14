import type { ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

export function ResizablePanes({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <Group orientation="horizontal" className="h-full w-full">
      <Panel defaultSize="50%" minSize="20%">
        {left}
      </Panel>
      <Separator className="w-1 bg-neutral-200 transition-colors hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700" />
      <Panel defaultSize="50%" minSize="20%">
        {right}
      </Panel>
    </Group>
  );
}
