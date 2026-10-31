/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const timeApiDevPlugin = () => ({
  name: 'time-api-dev-server',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url === '/api/time' || req.url?.startsWith('/api/time?')) {
        const now = Date.now();
        const kstDate = new Date(now + 9 * 60 * 60 * 1000);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            unixtime: now,
            utc: new Date(now).toISOString(),
            kst: kstDate.toISOString(),
            dateTime: kstDate.toISOString().replace('Z', '+09:00'),
          })
        );
        return;
      }
      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    timeApiDevPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      useCredentials: true,
      includeAssets: [
        'favicon-new.svg',
        'favicon.svg',
        'icon.svg',
        'icon-192.svg',
        'icon-512.svg',
        'apple-touch-icon.svg',
        'apple-touch-icon.png',
        'OG-new.png',
      ],
      manifest: {
        name: 'asterisk* cnsh.space',
        short_name: 'cnsh.space',
        description: '자유로운 소통, 질문 답변, 정보 공유를 위한 asterisk* cnsh.space',
        theme_color: '#000000',
        background_color: '#F7F6F2',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/__/, /^\/api(\/|$)/, /^\/uploads(\/|$)/, /^\/media(\/|$)/],
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        headers: {
          ...(process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET
            ? { 'X-Edge-Verified': process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET || '' }
            : {}),
        },
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        headers: {
          ...(process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET
            ? { 'X-Edge-Verified': process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET || '' }
            : {}),
        },
      },
      '/media': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        headers: {
          ...(process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET
            ? { 'X-Edge-Verified': process.env.EDGE_SECRET || process.env.VITE_EDGE_SECRET || '' }
            : {}),
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
