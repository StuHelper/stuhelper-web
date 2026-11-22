import { readFileSync } from 'node:fs';
import { devices, expect, test } from 'playwright/test';
import { captureHomepage } from '../teacher-homepage-screenshot.mjs';

const { languages } = JSON.parse(readFileSync(new URL('../../locale-policy.json', import.meta.url), 'utf8'));
const portrait = readFileSync(new URL('../../src/demo/teacher-portrait.png', import.meta.url));
const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, screen } = devices['Pixel 7'];

async function screenshot(target, locale, view) {
  if (['zh-CN', 'ar-EG'].includes(locale)) await captureHomepage(target, `demo-${view}-${locale}.png`);
}

for (const [locale, { direction }] of Object.entries(languages)) {
  const messages = JSON.parse(readFileSync(new URL(`../../src/locales/${locale}.json`, import.meta.url), 'utf8'));
  const homepage = messages.teacherHomepage;
  const localized = (path) => `${path}?lang=${locale}`;

  test.describe(locale, () => {
    if (locale === 'ar-EG') test.use({ viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, screen });

    test('the demo serves a teacher photo and accepts a reader complaint', async ({ page }) => {
      await page.goto(localized('/teachers/p1'));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', direction);
      const profile = page.getByRole('region', { name: homepage.title, exact: true });
      const photo = profile.getByRole('img', { name: homepage.photo.replace('{name}', '林知远'), exact: true });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute('src', /^blob:/);
      await expect.poll(() => photo.evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([128, 160]);
      await screenshot(profile, locale, 'profile');
      await profile.getByRole('button', { name: homepage.complain, exact: true }).click();

      const dialog = page.getByRole('dialog', { name: homepage.complaint.title, exact: true });
      const category = messages.violation.categories.wrong_info.name;
      await dialog.getByRole('combobox', { name: messages.violation.label, exact: true }).click();
      await page.getByRole('textbox', { name: messages.common.searchOptions, exact: true }).fill(category);
      await page.getByRole('option', { name: category, exact: true }).click();
      await dialog.getByRole('textbox', { name: homepage.complaint.reason }).fill('演示资料中的答疑时间有误。');
      await dialog.getByRole('button', { name: messages.common.submit, exact: true }).click();
      await expect(dialog.getByText(homepage.complaint.sent, { exact: true })).toBeVisible();
    });

    test('the demo links an active teacher to request history and returns a new photo receipt', async ({ page }) => {
      await page.goto(localized('/teachers/p2'));
      const profile = page.getByRole('region', { name: homepage.title, exact: true });
      await expect(profile.getByRole('link', { name: homepage.manage, exact: true })).toHaveAttribute('href', '/me/teacher-homepage/p2');

      await page.goto(localized('/me/verification/teacher'));
      await page.getByRole('link', { name: homepage.manageFor.replace('{name}', '周清和'), exact: true }).click();
      const history = page.getByRole('region', { name: homepage.request.history, exact: true });
      for (const status of Object.values(homepage.request.status)) {
        await expect(history.getByText(status, { exact: true })).toBeVisible();
      }

      const section = page.getByRole('region', { name: homepage.request.title, exact: true });
      await section.getByRole('button', { name: homepage.request.start, exact: true }).click();
      await section.getByRole('combobox').click();
      await page.getByRole('textbox', { name: messages.common.searchOptions, exact: true }).fill(homepage.fields.photo);
      await page.getByRole('option', { name: homepage.fields.photo, exact: true }).click();
      await section.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: portrait });
      const note = '请将照片换成新的演示头像。';
      await section.getByRole('textbox', { name: homepage.request.message }).fill(note);
      await section.getByRole('button', { name: messages.common.submit, exact: true }).click();
      await expect(section.getByText(homepage.request.sent, { exact: true })).toBeVisible();

      await history.getByRole('link').filter({ hasText: homepage.fields.photo }).click();
      await expect(page.getByRole('heading', { name: homepage.receipt.title, exact: true })).toBeVisible();
      await expect(page.getByText(homepage.receipt.photo, { exact: true })).toBeVisible();
      await expect(page.getByText(note, { exact: true })).toBeVisible();
      await screenshot(page.getByRole('main'), locale, 'receipt');
    });
  });
}
