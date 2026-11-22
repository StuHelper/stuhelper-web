import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';

const c = JSON.parse(readFileSync('src/locales/zh-CN.json', 'utf8'));

test('the demo opens published legal text and fetches the next history page', async ({ page }) => {
  await page.goto('/legal/terms?lang=zh-CN');
  const article = page.getByRole('article', { name: 'StuHelper 用户服务协议' });
  await expect(article.getByText('演示文档 · 3.0', { exact: true })).toBeVisible();
  await expect(article.getByRole('table').getByRole('cell', { name: '学习资料' })).toBeVisible();
  await article.getByRole('link', { name: c.legal.history }).click();
  const history = page.getByRole('main').getByRole('list');
  await expect(history.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('button', { name: c.common.loadMore }).click();
  await expect(history.getByRole('listitem')).toHaveCount(51);
  await history.getByRole('link').last().click();
  await expect(article.getByRole('note')).toHaveText(c.legal.fixed);
  await expect(article.getByText('演示文档 · 1.1', { exact: true })).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: c.legal.privacy }).click();
  const privacyPolicy = page.getByRole('article', { name: 'StuHelper 隐私政策' });
  await expect(privacyPolicy.getByRole('table').getByRole('cell', { name: '昵称' })).toBeVisible();
});
