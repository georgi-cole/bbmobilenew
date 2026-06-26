import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const nodeBin = process.execPath;
const viteScript = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

export default defineConfig({
  testDir: './e2e/playwright',
  retries: 1,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `"${nodeBin}" "${viteScript}" --host 127.0.0.1 --port 4173`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
