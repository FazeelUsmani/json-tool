import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// Hoisted from main.tsx + App.tsx so global providers wrap every route
// (the App tool route AND the landing pages). Child routes render in
// <Outlet/>.
export function RootLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}

export default RootLayout;
