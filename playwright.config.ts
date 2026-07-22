import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const nodeBin = process.execPath
const viteScript = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const baseURL = 'http://127.0.0.1:4173/bbmobilenew/'

export default defineConfig({
  testDir: './e2e/playwright',
  outputDir: 'test-results',
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `"${nodeBin}" "${viteScript}" --host 127.0.0.1 --port 4173 --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'mobile-chromium',
      use: { browserName: 'chromium', ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      use: { browserName: 'webkit', ...devices['iPhone 13'] },
    },
    {
      name: 'narrow-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'compact-mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'wide-desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
})
