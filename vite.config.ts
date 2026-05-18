import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
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
