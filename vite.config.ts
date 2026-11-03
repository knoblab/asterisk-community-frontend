/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

let commitHash = ''
try {
  commitHash = (
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.VITE_COMMIT_HASH ||
    execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' })
  ).trim().slice(0, 7)
} catch {
  commitHash = ''
}

const devApiPlugin = () => ({
  name: 'dev-api-server',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
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
      if (req.url === '/api/weather' || req.url?.startsWith('/api/weather?')) {
        const apiKey = process.env.WEATHER_API_KEY || 'SSCp_h23QfGgqf4dt1Hxog';
        try {
          const kmaUrl = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?stn=133&help=0&authKey=${apiKey}`;
          const kmaRes = await fetch(kmaUrl);
          if (kmaRes.ok) {
            const text = await kmaRes.text();
            const dataLines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
            if (dataLines.length > 0) {
              const row = dataLines[0];
              const taStr = row.substring(64, 70).trim();
              const caTotStr = row.substring(164, 168).trim();
              const rnStr = row.substring(89, 96).trim();
              const taNum = parseFloat(taStr);
              const caTotNum = parseInt(caTotStr, 10);
              const rnNum = parseFloat(rnStr);
              const temp = isNaN(taNum) ? 0 : Math.round(taNum * 10) / 10;
              const hasRain = !isNaN(rnNum) && rnNum > 0;
              let condition = 'sun';
              let conditionLabel = '맑음';
              if (hasRain) {
                condition = 'rain';
                conditionLabel = '비';
              } else if (!isNaN(caTotNum) && caTotNum >= 6) {
                condition = 'cloud';
                conditionLabel = '흐림';
              } else if (!isNaN(caTotNum) && caTotNum >= 3) {
                condition = 'cloud-sun';
                conditionLabel = '구름조금';
              }
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'public, max-age=600');
              res.end(JSON.stringify({ temperature: temp, condition, conditionLabel, station: '133' }));
              return;
            }
          }
        } catch {
          // fallback
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ temperature: 18.0, condition: 'sun', conditionLabel: '맑음', station: '133' }));
        return;
      }
      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    devApiPlugin(),
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
