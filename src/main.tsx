import { ViteReactSSG } from 'vite-react-ssg';
import { routes } from '@/routes';
import '@/index.css';

// vite-react-ssg owns root creation now — the framework wraps StrictMode +
// router setup itself. Per-route global providers (TooltipProvider, Toaster)
// live in RootLayout instead of here so they wrap every route equally.
export const createRoot = ViteReactSSG({ routes });
