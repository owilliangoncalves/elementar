import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Rotas da API (elementar-api, porta 8000) repassadas no desenvolvimento.
const api = { target: 'http://127.0.0.1:8000', changeOrigin: true }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    // A API serve o front compilado a partir daqui.
    outDir: '../src/elementar/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/estados': api,
      '/municipios': api,
      '/atualizacao': api,
      '/saude': api,
      '/docs': api,
      '/openapi.json': api,
    },
  },
})
