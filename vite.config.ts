import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite builds the React SPA into dist/client.
 * The Worker (workers/index.ts) serves that directory via the [assets] binding
 * and handles /api/* itself — so there is exactly one deployable artifact.
 *
 * `bun run dev` runs `wrangler dev`, which serves the built assets + the real
 * Worker (real D1/R2/KV/Queues emulation). Use `bun run dev:vite` only when you
 * want fast HMR on pure-UI work; API calls then proxy to a local wrangler dev.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@workers': path.resolve(__dirname, './workers'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Only used in `dev:vite` mode; wrangler dev serves /api itself on 8787.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
