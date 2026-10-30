import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the extension pages (side panel, options) and the service worker.
// The content script is built separately as a classic IIFE script
// (see vite.content.config.ts) because content scripts cannot be ES modules.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    // Keep content.js (built by the other config) when rebuilding in watch mode.
    emptyOutDir: !process.argv.includes('--watch'),
    target: 'chrome120',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        options: resolve(import.meta.dirname, 'src/options/index.html'),
        app: resolve(import.meta.dirname, 'src/app/index.html'),
        'service-worker': resolve(import.meta.dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
