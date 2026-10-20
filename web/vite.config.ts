import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Goサーバー（既定 127.0.0.1:8080）。CUBALYST_API で上書きできる。
const apiTarget = process.env.CUBALYST_API ?? 'http://127.0.0.1:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // cubing.js（3D描画など）が大きいため。ローカル配信なのでサイズは問題にならない。
    chunkSizeWarningLimit: 1200,
  },
  server: {
    // ローカル専用。SSHポートフォワード経由でWindowsから開く。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
