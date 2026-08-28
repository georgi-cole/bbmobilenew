import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/bbmobilenew/'
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
  'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort'
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const chromiumLaunchOptions = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : {}

export default defineConfig({
  testDir: './e2e/playwright',
  outputDir: 'test-results',
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.VISUAL_AUDIT_WRITE === '1' ? 'off' : 'retain-on-failure',
  },
  webServer: {
    // PLAYWRIGHT_WEB_SERVER_COMMAND lets CI execute the same head-branch visual
    // tests against the base-branch app when generating comparison baselines.
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_WEB_SERVER_COMMAND == null,
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
      name: 'ios-small-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'ios-modern-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: 'ios-large-webkit',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        viewport: { width: 430, height: 932 },
      },
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
      name: 'android-large-chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        ...chromiumLaunchOptions,
        viewport: { width: 432, height: 960 },
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
