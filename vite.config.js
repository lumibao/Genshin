import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs. GitHub Pages serves this repository from
  // https://<user>.github.io/Genshin/, i.e. a subdirectory — with the default
  // absolute base ('/') every script and stylesheet would be requested from
  // the domain root and 404, leaving a blank, unstyled page. A relative base
  // also works from a user site, a custom domain, or a local file server.
  base: './',
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
