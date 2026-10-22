import { defineConfig } from 'vite';

export default defineConfig({
  // The game is embedded in preview iframes on dynamic hosts, so the dev and
  // preview servers must accept any Host header.
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three.js is large and rarely changes: keep it in its own chunk so a
        // story tweak does not invalidate it in the browser cache.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
