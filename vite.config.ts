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
      // The 3D town (three.js) is one large chunk on purpose; it loads only when 3D is used.
      chunkSizeWarningLimit: 800,
    },
    server: {
      host: true,
      port: 5173,
      // Desktop builds write here; without this the dev page reloads on every packaging step.
      watch: { ignored: ['**/release/**', '**/dist-desktop/**'] },
    },
    // The 3D town is imported lazily; listing three.js here stops the dev server reloading the
    // page the first time it finds each of these imports.
    optimizeDeps: {
      include: [
        'three',
        'three/addons/controls/MapControls.js',
        'three/addons/controls/PointerLockControls.js',
        'three/addons/renderers/CSS2DRenderer.js',
        'three/addons/utils/BufferGeometryUtils.js',
      ],
    },
  };
});
