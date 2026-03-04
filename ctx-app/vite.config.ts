import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

function readDashboardToken(): string {
  const tokenFile = resolve(__dirname, '..', '.data', '.dashboard-token');
  try {
    if (existsSync(tokenFile)) return readFileSync(tokenFile, 'utf8').trim();
  } catch { /* ignore */ }
  return '';
}

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron';
  const backendPort = process.env.CTX_DASHBOARD_PORT || '7331';
  const backendTarget = `http://127.0.0.1:${backendPort}`;

  const proxyWithAuth = (target: string) => ({
    target,
    changeOrigin: false,
    configure: (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any) => {
        const token = readDashboardToken();
        if (token && !proxyReq.getHeader('authorization')) {
          proxyReq.setHeader('Authorization', `Bearer ${token}`);
        }
      });
    },
  });

  return {
    plugins: [
      react(),
      isElectron && electron([
        {
          // Main-process entry
          entry: 'electron/main.ts',
        },
        {
          entry: 'electron/preload.ts',
          onbt(args) {
            args.reload()
          },
        },
      ]),
      isElectron && renderer(),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': proxyWithAuth(backendTarget),
        '/events': proxyWithAuth(backendTarget),
        '/state': proxyWithAuth(backendTarget),
        '/storage-health': proxyWithAuth(backendTarget),
      }
    }
  }
})
