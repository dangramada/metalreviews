import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
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
    environmentMatchGlobs: [
      // Use jsdom for React component tests (.test.tsx files only).
      // Existing .test.ts and .test.js files stay in the default Node environment.
      ['src/__tests__/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
