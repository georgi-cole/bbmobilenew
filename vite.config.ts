import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Base-path strategy
//   npm run build             →  "/bbmobilenew/"  (GitHub Pages deployment)
//   npm run build:capacitor   →  "./"             (passed via --base ./ CLI flag,
//                                                   required for Capacitor/WKWebView)
export default defineConfig({
  base: '/bbmobilenew/',
  assetsInclude: ['**/*.wp2'],
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
