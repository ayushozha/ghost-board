import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Split Three.js ecosystem into its own lazy chunk so it is NOT part
        // of the initial bundle. It is only fetched when Market Arena renders.
        manualChunks(id) {
          if (id.includes('three') || id.includes('@react-three/fiber') || id.includes('@react-three/drei')) {
            return 'three-vendor';
          }
          // Put other large libraries in a shared vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
