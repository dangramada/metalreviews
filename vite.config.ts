import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import WebfontDownload from 'vite-plugin-webfont-dl';

export default defineConfig({
  plugins: [react(), WebfontDownload()],
  base: './',
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    // environmentMatchGlobs was removed from Vitest (gone from its runtime and types as
    // of the installed v4) — every .test.tsx file already carries its own
    // `// @vitest-environment jsdom` pragma, which is what actually selects jsdom now.
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
