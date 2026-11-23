import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';

const c = JSON.parse(readFileSync('src/locales/zh-CN.json', 'utf8'));

test('the demo opens published legal text and fetches the next history page', async ({ page }) => {
  await page.goto('/legal/terms?lang=zh-CN');
  const article = page.getByRole('article', { name: 'StuHelper 用户服务协议' });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'StuHelper 用户服务协议' })).toBeVisible();
  await expect(main.getByText('SH-TOS-2026.11.01', { exact: true })).toBeVisible();
  await expect(main.getByText('运营主体', { exact: true })).toBeVisible();
  await expect(article.getByText('版本 SH-TOS-2026.11.01')).toHaveCount(0);
  await expect(article.getByRole('table').getByRole('cell', { name: '学习资料' })).toBeVisible();
  await main.getByRole('navigation', { name: c.legal.contents }).getByRole('link', { name: '第二条 账号与安全' }).click();
  await expect(page).toHaveURL(/#section-2$/);
  await main.getByRole('link', { name: c.legal.history }).click();
  const history = page.getByRole('main').getByRole('list');
  await expect(history.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('button', { name: c.common.loadMore }).click();
  await expect(history.getByRole('listitem')).toHaveCount(51);
  await history.getByRole('link').last().click();
  await expect(page.getByRole('main').getByRole('note')).toHaveText(c.legal.fixed);
  await expect(page.getByRole('main').getByText('SH-TOS-2022.09.01', { exact: true })).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: c.legal.privacy }).click();
  const privacyPolicy = page.getByRole('article', { name: 'StuHelper 隐私政策' });
  await expect(privacyPolicy.getByRole('table').getByRole('cell', { name: '昵称' })).toBeVisible();
});
