// The CLI bundle (D33): an SSR build of cli/src/main.ts into one ESM file with a shebang. Node built-ins stay
// external; everything else (shared/session) is bundled, so cli/dist needs no node_modules (C4).
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'cli/src/main.ts',
    outDir: 'cli/dist',
    emptyOutDir: false, // cli/dist/viewer.html is written first by scripts/inline-viewer.mjs
    target: 'node20',
    minify: false,
    copyPublicDir: false,
    rolldownOptions: { output: { entryFileNames: 'cli.mjs', format: 'es', banner: '#!/usr/bin/env node' } },
  },
});
