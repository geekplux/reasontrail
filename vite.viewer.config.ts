// The local viewer (D32): a second entry built to dist-viewer/ as ONE classic script (iife) with fonts inlined as
// data URLs, so scripts/inline-viewer.mjs can fold everything into a single file that works from file://.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    assetsInlineLimit: 100_000, // the two woff2 fonts become data URLs in the CSS
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { input: 'viewer.html', output: { format: 'iife' } },
  },
});
