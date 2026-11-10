import { defineConfig } from 'vite';

// GitHub Pages project site lives at /agent-town/
export default defineConfig({
  base: '/agent-town/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
  },
});
