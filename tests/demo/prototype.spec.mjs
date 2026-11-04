import fs from 'node:fs';
import { test, expect } from 'playwright/test';

const catalogue = (locale) => JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8'));
const push = (page, path) => page.evaluate((to) => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(to), path);
const persona = (page, value) => page.addInitScript((who) => localStorage.setItem('stuhelper-demo-persona', who), value);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('switching language keeps an unsaved review', async ({ page }) => {
  const z = catalogue('zh-CN');
  await page.goto('/courses/c3?lang=zh-CN');
  await page.getByRole('button', { name: z.academic.subject.writeReview ?? /评价/ }).first().click();
  const body = page.getByLabel(z.academic.editor.body, { exact: true });
  await body.fill('Unsaved review text');
  await page.evaluate(async () => {
    const { i18n } = await import('/src/app/i18n.ts');
    i18n.global.locale.value = 'en-US';
  });
  await expect(page.locator('textarea').first()).toHaveValue('Unsaved review text');
});

test('switching the draft tab asks before destroying unsaved input', async ({ page }) => {
  const z = catalogue('zh-CN');
  await page.goto('/me/reviews?tab=drafts&lang=zh-CN');
  await page.getByRole('button', { name: z.me.continueEditing ?? '继续编辑', exact: true }).first().click();
  const body = page.getByLabel(z.academic.editor.body, { exact: true });
  await body.fill('Unsaved draft text');
  await page.getByRole('tab', { name: z.me.reviewTabs.entries, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: z.common.cancel, exact: true }).click();
  await expect(body).toHaveValue('Unsaved draft text');
  await expect(page).toHaveURL(/tab=drafts/);
});

test('the course filter follows the address, including back navigation', async ({ page }) => {
  await page.goto('/courses?dept=d-cs&lang=zh-CN');
  await expect(page.getByRole('combobox').filter({ hasText: '计算机' }).first()).toBeVisible();
  await push(page, '/courses?dept=d-auto&lang=zh-CN');
  await expect(page).toHaveURL(/dept=d-auto/);
  const selected = await page.evaluate(() => new URL(location.href).searchParams.get('dept'));
  expect(selected).toBe('d-auto');
  await expect(page.getByRole('combobox').filter({ hasText: '自动化' }).first()).toBeVisible();
  await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$router.back(); });
  await expect(page).toHaveURL(/dept=d-cs/);
  await expect(page.getByRole('combobox').filter({ hasText: '计算机' }).first()).toBeVisible();
});

test('finding courses from a teacher shows only that teacher\'s courses', async ({ page }) => {
  await page.goto('/courses?teacher=p3&lang=zh-CN');
  const links = page.locator('main a[href^="/courses/c"]');
  await expect(links.first()).toBeVisible();
  const shown = [...new Set(await links.evaluateAll((rows) => rows.map((row) => new URL(row.href).pathname)))].sort();
  expect(shown).toEqual(['/courses/c3', '/courses/c4']);
});

test('guests do not see personal notifications', async ({ page }) => {
  const z = catalogue('zh-CN');
  await persona(page, 'guest');
  await page.goto('/notifications?lang=zh-CN');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: z.demo.notifications, exact: true })).toHaveCount(0);
  await expect(page.locator('.note')).toHaveCount(0);
});

test('signing out from the account menu clears recent pages', async ({ page }) => {
  await page.goto('/courses/c3?lang=zh-CN');
  await expect(page.locator('main h1')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('stuhelper.recent') || '[]').length)).toBe(1);
  await page.locator('.avatar').first().click();
  await page.getByRole('menuitem').filter({ hasText: /退出|登出/ }).click();
  await page.waitForURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('stuhelper.recent'))).toBeNull();
});

for (const locale of ['en-US', 'fr-FR', 'ru-RU', 'es-ES', 'ar-EG']) {
  test(`course details fit a phone in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/courses/c3?lang=${locale}`);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}
