import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const backendPort = process.env.BACKEND_PORT || 3000;
const backendOrigin = `http://localhost:${backendPort}`;

export default defineConfig({
  root: __dirname,
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': backendOrigin,
      '/auth': backendOrigin,
      '/ws': { target: `ws://localhost:${backendPort}`, ws: true },
    },
  },
});
