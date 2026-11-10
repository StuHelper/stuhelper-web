import { defineConfig, devices } from 'playwright/test';

// The review prototype uses a separate build mode, so its regressions run against the demo server.
export default defineConfig({
  outputDir: '.tools/playwright.demo-results',
  testDir: './tests/demo', timeout: 30_000, workers: 2, retries: 0,
  reporter: 'list', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:18873', trace: 'off', screenshot: 'off' },
  webServer: { command: 'pnpm exec vite --port 18873 --strictPort', env: { VITE_DEMO: '1' }, url: 'http://127.0.0.1:18873', reuseExistingServer: false, timeout: 60_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
});
