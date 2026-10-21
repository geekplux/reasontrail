/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'cli/test/**/*.test.ts', 'shared/**/*.test.ts', 'worker/**/*.test.ts', 'scripts/**/*.test.{js,mjs,ts}'],
    maxWorkers: 2,
    css: { include: [/tokens\.css/] }, // tokens.test.ts reads the real file via ?raw
  },
});
