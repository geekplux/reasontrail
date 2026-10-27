/// <reference types="vitest/config" />
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The website serves the built local-viewer template as `/viewer.html`: "Save shareable copy" writes the redacted
 * graph into it. Built with `build:viewer` before the site, so the two always match. */
function viewerTemplate(): Plugin {
  return {
    name: 'reasontrail-viewer-template',
    apply: 'build',
    buildStart() {
      const r = spawnSync('pnpm', ['run', '-s', 'build:viewer'], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: ['ignore', 'ignore', 'inherit'] });
      if (r.status !== 0) this.error(`build:viewer failed (exit ${r.status})`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'viewer.html', source: readFileSync(new URL('./cli/dist/viewer.html', import.meta.url), 'utf8') });
    },
  };
}

export default defineConfig({
  plugins: [react(), viewerTemplate()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'cli/test/**/*.test.ts', 'shared/**/*.test.ts', 'worker/**/*.test.ts', 'scripts/**/*.test.{js,mjs,ts}', 'skills/**/*.test.mjs'],
    maxWorkers: 2,
    css: { include: [/\.css\?raw$/] }, // tokens.test.ts reads every stylesheet via ?raw; component tests skip CSS
  },
});
