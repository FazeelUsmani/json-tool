import type { RouteRecord } from 'vite-react-ssg';
import { RootLayout } from './RootLayout';
import App from './App';

// W1-Thu: stub routes for SEO. Landings are 80-120-line placeholders;
// real copy lands W4-Fri per PLAN.MD. Lazy imports keep landings out of
// the home-route JS bundle.
export const routes: RouteRecord[] = [
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, Component: App },
      {
        path: 'json-viewer',
        lazy: () => import('./pages/JsonViewer'),
      },
      {
        path: 'large-json-viewer',
        lazy: () => import('./pages/LargeJsonViewer'),
      },
      {
        path: 'ndjson-viewer',
        lazy: () => import('./pages/NdjsonViewer'),
      },
      {
        path: 'json-repair',
        lazy: () => import('./pages/JsonRepair'),
      },
    ],
  },
];
