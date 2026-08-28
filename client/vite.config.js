import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En développement (`npm run dev`), le serveur Vite tourne sur le port 5173
 * et relaie l'API et le websocket vers le backend Node (port 8080).
 * En production, le backend sert directement le contenu de `dist/`.
 */
export default defineConfig({
  plugins: [react()],
  base:'/',
  server: {
    port: 5176,
    proxy: {
      '/api': { target: 'http://localhost:3005', changeOrigin: true },
      '/auth': { target: 'http://localhost:3005', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3005', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
});
