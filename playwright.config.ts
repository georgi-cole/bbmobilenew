import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseURL = 'http://127.0.0.1:4173/bbmobilenew/'
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ].find((candidate) => existsSync(candidate))
    : undefined)
const chromiumLaunchOptions = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : {}

export default defineConfig({
  testDir: './e2e/playwright',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.VISUAL_AUDIT_WRITE === '1' ? 'off' : 'retain-on-failure',
  },
  webServer: {
    // Start through the repository's normal dev lifecycle instead of invoking
    // Vite directly. `npm run dev` executes `predev`, which regenerates the
    // audio catalog (and other generated runtime config) before the browser
    // ever imports it.
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
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
        ...chromiumLaunchOptions,
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'mobile-chromium',
      use: { browserName: 'chromium', ...devices['Pixel 7'], ...chromiumLaunchOptions },
    },
    {
      name: 'mobile-webkit',
      use: { browserName: 'webkit', ...devices['iPhone 13'] },
    },
    {
      name: 'narrow-chromium',
      use: {
        browserName: 'chromium',
        ...chromiumLaunchOptions,
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
        ...chromiumLaunchOptions,
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
        ...chromiumLaunchOptions,
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
})
