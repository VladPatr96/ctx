import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron';

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
      fs: {
        allow: [
          resolve(__dirname, '..'),
        ],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:7331',
          changeOrigin: false,
        },
        '/events': {
          target: 'http://127.0.0.1:7331',
          changeOrigin: false,
        },
        '/state': {
          target: 'http://127.0.0.1:7331',
          changeOrigin: false,
        },
        '/storage-health': {
          target: 'http://127.0.0.1:7331',
          changeOrigin: false,
        },
      }
    }
  }
})
