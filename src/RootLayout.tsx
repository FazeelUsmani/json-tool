import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// Hoisted from main.tsx + App.tsx so global providers wrap every route
// (the App tool route AND the landing pages). Child routes render in
// <Outlet/>.
export function RootLayout() {
  useMonacoCancelSilencer();
  return (
    <TooltipProvider delayDuration={200}>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}

// Monaco's internal CancellationTokenSource rejects pending operations
// with `name: 'Canceled'` when the editor instance disposes mid-init.
// That happens every time viewer-only mode flips MonacoEditor out of
// the render tree (file >10MB) — a benign lifecycle artifact, but
// Monaco doesn't .catch() its own rejections, so they bubble as
// `Uncaught (in promise) Canceled: Canceled` in DevTools console.
// Filter just that specific shape; our own AbortError (used by
// parserHost.parseFile) has `name: 'AbortError'`, so it isn't
// affected.
function useMonacoCancelSilencer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      if (
        r &&
        typeof r === 'object' &&
        'name' in r &&
        (r as { name: unknown }).name === 'Canceled'
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);
}

export default RootLayout;
