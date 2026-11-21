import { expect, memberTest as test } from '../session-fixture.mjs';

test('switching language on a page opened with ?lang= keeps the new language after reload', async ({ page }, info) => {
  const from = info.project.metadata.locale, to = from === 'en-US' ? 'zh-CN' : 'en-US';
  await page.goto(`http://127.0.0.1:18787/courses?lang=${from}`);
  await expect(page.locator('html')).toHaveAttribute('lang', from);
  const select = page.locator('.locale-select:visible').first();
  await select.click();
  await page.locator(`[role="option"][lang="${to}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
  await expect.poll(() => new URL(page.url()).searchParams.get('lang')).toBe(to);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
