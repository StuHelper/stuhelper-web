import { defineConfig, devices } from 'playwright/test';
export default defineConfig({
  outputDir: '.tools/playwright.config-results',
  testDir: './tests/e2e', timeout: 30_000, workers: 2, retries: 0,
  reporter: 'list', use: { trace: 'off', screenshot: 'off' },
  projects: ['zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'ja-JP', 'ko-KR', 'es-ES', 'ar-EG'].flatMap(locale => [
    { name: `desktop-${locale}`, metadata: { locale }, use: { ...devices['Desktop Chrome'] } },
    { name: `mobile-${locale}`, metadata: { locale }, use: { ...devices['Pixel 7'] } },
  ]),
  webServer: { command: 'pnpm exec vite preview --port 18787', url: 'http://127.0.0.1:18787', reuseExistingServer: false, timeout: 60_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
});
