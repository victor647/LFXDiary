import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const nasPublicTarget = process.env.LFX_DIARY_NAS_PUBLIC_URL || 'https://www.lafaxi647.cn:5001'
const nasLanTarget = process.env.LFX_DIARY_NAS_LAN_URL || 'https://192.168.0.2:5001'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/nas-public-api': {
        target: nasPublicTarget,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nas-public-api/, ''),
      },
      '/nas-lan-api': {
        target: nasLanTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/nas-lan-api/, ''),
      },
      '/aliyun-air-api': {
        target: 'https://ncairhis.market.alicloudapi.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/aliyun-air-api/, ''),
      },
      '/cnemc-air-api': {
        target: 'https://air.cnemc.cn:18007',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/cnemc-air-api/, ''),
      },
    },
  },
})
