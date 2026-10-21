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
    // 以下の2つは、本番ビルドで cubing.js のスクランブル Worker を動かすため。
    // どちらかが欠けると Worker 内で `document is not defined` になり、
    // スクランブルが「生成中…」のまま止まる（dev サーバーでは起きない）。
    //
    // 動的 import に付く先読みヘルパーは document で <link rel=modulepreload> を
    // 足そうとする。Worker 内の動的 import でも使われるので切る。
    // ローカル配信なので先読みが無くても体感は変わらない。
    modulePreload: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Worker と画面の両方が使う cubing.js の内部モジュール（alg など）を
            // 独立したチャンクにまとめる。指定しないと入口チャンクに入り、Worker が
            // アプリ本体（React の描画など）ごと読み込んでしまう。
            {
              name: 'cubing-shared',
              test: /node_modules[\\/]cubing[\\/]dist[\\/]lib[\\/]cubing[\\/]chunks[\\/]chunk-/,
            },
          ],
        },
      },
    },
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
