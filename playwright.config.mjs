import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /mobile-320 contract/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-320',
      grep: /mobile-320 contract/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/study/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
