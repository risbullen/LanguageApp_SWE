import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// base './' so the build works at any GitHub Pages path
export default defineConfig({
  base: './',
  // shown in the app so you can see exactly which build you're on
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // Installable app ("Add to home screen") that works offline after the first visit
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SvenskaKul',
        short_name: 'SvenskaKul',
        description: 'Learn Swedish (and soon Punjabi) with pictures, sound and conversations.',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // speech files: cached as they are played, so lessons work offline the next time
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: { cacheName: 'audio', expiration: { maxEntries: 3000 } },
          },
          {
            urlPattern: ({ url }) => url.origin.includes('fonts.g'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
} as never);
