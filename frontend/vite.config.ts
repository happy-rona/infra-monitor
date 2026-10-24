import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = { '/api': { target: 'http://localhost:8080', changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node' },
});
