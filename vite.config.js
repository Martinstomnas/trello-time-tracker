import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        connector: resolve(__dirname, 'index.html'),
        timer: resolve(__dirname, 'timer.html'),
        report: resolve(__dirname, 'report.html'),
        settings: resolve(__dirname, 'settings.html'),
      },
    },
  },
  server: {
    cors: true,
    allowedHosts: true,
    port: 3000,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});