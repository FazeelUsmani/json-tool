import type { ReactNode } from 'react';
import { TopBar } from '@/components/layout/TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-neutral-50 dark:bg-neutral-900">
      <TopBar />
      <main className="flex min-h-0 flex-1">{children}</main>
    </div>
  );
}
