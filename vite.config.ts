import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 打包時用相對路徑（base: './'），放在 GitHub Pages 的子路徑（/倉庫名/）或其他網址下都能直接開。
 * public/models 的人物模型會一起打包進 dist/models，網頁版不用再手動補。
 * 兩個頁面：遊戲（index.html）與技能特效測試場（skill-lab.html）。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: { port: 5183, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lab: fileURLToPath(new URL('./skill-lab.html', import.meta.url)),
      },
    },
  },
}))
