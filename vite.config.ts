import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import WebfontDownload from 'vite-plugin-webfont-dl';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), WebfontDownload()],
  base: './',
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
