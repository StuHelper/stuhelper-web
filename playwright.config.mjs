import { defineConfig, devices } from 'playwright/test';

const primaryLocales = new Set(['zh-CN', 'en-US', 'ar-EG']);
// Pure state-machine and recovery regression suites run across CJK default (zh-CN),
// Latin plural (en-US) and RTL (ar-EG) on both desktop and mobile viewports;
// scenario-registered suites run across all 16 locale/viewport projects.
const stateMachineOnly = [
  '**/review-regressions.spec.mjs',
  '**/my-reviews-discussion.spec.mjs',
];

export default defineConfig({
  outputDir: '.tools/playwright.config-results',
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off' },
  projects: ['zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'ja-JP', 'ko-KR', 'es-ES', 'ar-EG'].flatMap((locale) => {
    const testIgnore = primaryLocales.has(locale) ? undefined : stateMachineOnly;
    return [
      { name: `desktop-${locale}`, metadata: { locale }, testIgnore, use: { ...devices['Desktop Chrome'] } },
      { name: `mobile-${locale}`, metadata: { locale }, testIgnore, use: { ...devices['Pixel 7'] } },
    ];
  }),
  webServer: {
    command: 'pnpm exec vite preview --port 18787',
    url: 'http://127.0.0.1:18787',
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
