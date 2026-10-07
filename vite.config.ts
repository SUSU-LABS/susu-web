import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Never ship source maps containing secrets to a public deployment.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vendors that dwarf the app code get their own chunks: a change to one
        // no longer invalidates the cache of the other, and the public routes
        // never pay for the Stellar SDK they never touch — see #24.
        manualChunks(id) {
          if (id.includes('@stellar/stellar-sdk')) return 'vendor-stellar';
          if (id.includes('framer-motion')) return 'vendor-motion';
          // Everything else from node_modules — React, the router, the query
          // client, Supabase, zod — ships as one cacheable vendor chunk, so
          // the entry stays app code only.
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    // `scripts/` holds the build-time security checks, which are plain ESM rather
    // than TypeScript so they can run without a build step. Their logic is worth
    // testing for the same reason any guard is: a check that cannot fail on the
    // thing it exists for is not protecting anything.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs'],
    reporters: ['default'],
  },
});
