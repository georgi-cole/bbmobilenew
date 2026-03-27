import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Base-path strategy
//   VITE_BUILD_TARGET=capacitor  →  "./"   (Capacitor/native WebView)
//   (default / GitHub Pages)     →  "/bbmobilenew/"
//
// Run `npm run build:capacitor` for the native build.
const isCapacitorBuild = process.env.VITE_BUILD_TARGET === 'capacitor';

export default defineConfig({
  base: isCapacitorBuild ? './' : '/bbmobilenew/',
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
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
