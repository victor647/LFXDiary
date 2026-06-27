import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/nas-public-api': {
        target: 'https://www.lafaxi647.cn:5001',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nas-public-api/, ''),
      },
      '/nas-lan-api': {
        target: 'https://192.168.0.2:5001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/nas-lan-api/, ''),
      },
    },
  },
})
