import { defineConfig } from 'vite';

// GitHub Pages project site lives at /agent-town/. `--mode desktop` builds for the Electron
// app, which loads the files from disk, so asset paths must be relative.
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  return {
    base: desktop ? './' : '/agent-town/',
    build: {
      outDir: desktop ? 'dist-desktop' : 'dist',
      assetsDir: 'assets',
      sourcemap: !desktop,
    },
    server: {
      host: true,
      port: 5173,
      // Desktop builds write here; without this the dev page reloads on every packaging step.
      watch: { ignored: ['**/release/**', '**/dist-desktop/**'] },
    },
  };
});
