import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const INK = '#12100b';

// The app is served from the site root, except the public demo on GitHub Pages, which sits under the repository's name.
const BASE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BASE_PATH ?? '/';

export default defineConfig({
  base: BASE,
  plugins: [
    preact(),
    VitePWA({
      // A new version waits (no skipWaiting) until the owner is on Home: see src/ui/updates.ts.
      registerType: 'prompt',
      // The glob below already precaches the icons; listing manifest icons too would cache them twice.
      includeManifestIcons: false,
      manifest: {
        name: 'Margins',
        short_name: 'Margins',
        description: 'Case math, daily.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: INK,
        background_color: INK,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Public files (icons, favicon) are matched here too, so no includeAssets: that listed them twice.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Stated, not left to the 2 MiB default: a file over it is silently left out of the precache, which
        // would break offline use. scripts/check-precache.mjs fails the build if any built file is missing.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
