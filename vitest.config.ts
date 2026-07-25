import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest covers the pure domain logic that carries the product's risk:
 * NRI scoring rules, import column inference / validation / dedupe, and money math.
 * These modules are deliberately free of Cloudflare and React imports so they run
 * in plain Node with no Workers pool required.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@workers': path.resolve(__dirname, './workers'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'workers/**/*.test.ts'],
    globals: false,
  },
});
