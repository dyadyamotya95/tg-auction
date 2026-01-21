import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const NGROK_DOMAIN = 'phytosuccivorous-unfervidly-angle.ngrok-free.dev'

export default defineConfig({
  plugins: [svelte()],
  envDir: '../..',
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [NGROK_DOMAIN],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
