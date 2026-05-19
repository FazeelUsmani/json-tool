import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Brand strings here are placeholders until W2-Wed brand decision lands —
// search "BRAND-PLACEHOLDER" to find them. The theme/icon color #863bff
// already matches public/favicon.svg's primary so visual identity is
// consistent across favicon, install-prompt icon, and OS chrome.
const BRAND_NAME = 'JSON Tool' // BRAND-PLACEHOLDER
const BRAND_SHORT = 'JSON Tool' // BRAND-PLACEHOLDER
const BRAND_THEME = '#863bff'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // SSR build of vite-react-ssg runs in Node and has no browser to serve
    // a worker to — skip PWA emission for that pass; the client build still
    // generates sw.js + manifest.webmanifest into dist/.
    VitePWA({
      registerType: 'autoUpdate',
      disable: isSsrBuild,
      includeAssets: ['favicon.svg', 'icons.svg', 'robots.txt'],
      manifest: {
        name: BRAND_NAME,
        short_name: BRAND_SHORT,
        description: 'Free in-browser JSON viewer, formatter, and validator. 100% client-side.',
        theme_color: BRAND_THEME,
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Monaco's ts.worker is ~7MB; without a raised cap workbox refuses
        // to precache it and the build fails. 10MB leaves headroom for
        // other workers (css, html) as Monaco grows.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Static SPA — no server state to drift between SW generations.
        // skipWaiting + clientsClaim activate the new SW on next reload
        // instead of waiting for all tabs to close, so a deploy reaches
        // returning users immediately. Without these, repeat visitors
        // would see stale builds until they happened to fully quit Chrome.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['stream-json'],
  },
  build: {
    rollupOptions: {
      output: {
        // monaco-editor is externalized during SSR (browser-only), so
        // the manual chunk rule only applies to the client bundle.
        manualChunks: isSsrBuild ? undefined : { monaco: ['monaco-editor'] },
      },
    },
  },
}))
