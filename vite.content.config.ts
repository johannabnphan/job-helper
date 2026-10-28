import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content script: a single self-contained classic script injected on demand
// into the job application page (all frames) by the side panel.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'JobHelperContent',
      fileName: () => 'content.js',
    },
  },
});
