import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { cspMetaPlugin } from './scripts/vite-plugin-csp.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMetaPlugin()],
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
    // Global test setup (e.g. the React `act` environment flag). The file was
    // already listed in `tsconfig.json`; this is what actually runs it.
    setupFiles: ['./vitest.setup.ts'],
    // `scripts/` holds the build-time security checks, which are plain ESM rather
    // than TypeScript so they can run without a build step. Their logic is worth
    // testing for the same reason any guard is: a check that cannot fail on the
    // thing it exists for is not protecting anything.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Only the code this repository owns is measured. Vitest counts files a
      // test actually loads, so the floor below tracks the modules under test
      // rather than being diluted by screens that have no unit tests yet — the
      // gate exists to stop the covered code regressing, and adding tests for a
      // screen is how that screen joins it.
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs', 'src/main.tsx'],
      // A floor, not a target. It is set just below what the suite reaches so a
      // change that removes coverage fails CI, without making unrelated edits
      // fail on a one-line dip. Raising it is a deliberate act; lowering it is a
      // decision that should be justified in review.
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 73,
        lines: 79,
      },
    },
  },
});
