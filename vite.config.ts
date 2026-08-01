import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` matters for GitHub Pages, which serves a project site from /<repo>/.
// Cloudflare Pages serves from the root, so the default stays '/'.
// Set VITE_BASE=/lyrics-binder/ in the GitHub Pages build if you go that route.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Ship new versions silently: a musician mid-set should never see an "update available"
      // prompt, and the app shell is small enough that a background swap is safe.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lyrics Binder',
        short_name: 'Binder',
        description: 'Your setlists and lyrics — offline, full screen, on stage.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell so a cold launch in airplane mode still boots.
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: 'index.html',
        // GitHub API calls must always hit the network — never serve a stale library from the SW
        // cache. IndexedDB is the offline source of truth, not the HTTP cache.
        navigateFallbackDenylist: [/github\.com/, /api\.github\.com/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Keep the service worker out of `vite dev`; it only complicates local iteration.
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
