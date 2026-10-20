import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        // ESMからCommonJSの aes-js を名前付きimportしているため、Viteで変換して読み込む
        inline: ['smartcube-web-bluetooth'],
      },
    },
  },
})
