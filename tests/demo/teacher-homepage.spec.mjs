import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { devices, expect, test } from 'playwright/test';
import { captureHomepage } from '../teacher-homepage-screenshot.mjs';

const { languages } = JSON.parse(readFileSync(new URL('../../locale-policy.json', import.meta.url), 'utf8'));
const portrait = readFileSync(new URL('../../src/demo/teacher-portrait.png', import.meta.url));
const bodyImage = readFileSync(new URL('../../src/demo/teacher-body-image.png', import.meta.url));
const bodyImageId = createHash('sha256').update(bodyImage).digest('hex');
const imageTitle = '数值方法收敛曲线';
const teachingSource = 'https://teachers.example.invalid/lin/teaching';
const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, screen } = devices['Pixel 7'];

async function screenshot(target, locale, view) {
  if (['zh-CN', 'ar-EG'].includes(locale)) await captureHomepage(target, `demo-${view}-${locale}.png`);
}

async function expectSourceLink(profile, label, url) {
  const link = profile.getByRole('link', { name: label });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
}

async function expectMediaAccess(page) {
  const result = await page.evaluate(async (id) => {
    const teacher = (teacherId) => `/api/v1/catalog/objects/${teacherId}/teacher-homepage`;
    const image = `${teacher('p1')}/images/${id}`;
    const [media, head, otherImage, badDigest, emptyMedia] = await Promise.all([
      fetch(`${teacher('p1')}/media`),
      fetch(image, { method: 'HEAD' }),
      fetch(`${teacher('p2')}/images/${id}`),
      fetch(`${teacher('p1')}/images/invalid-digest`),
      fetch(`${teacher('p4')}/media`),
    ]);

    const personaKey = 'stuhelper-demo-persona';
    const previous = localStorage.getItem(personaKey);
    const scopes = {};
    try {
      for (const persona of ['unverified', 'guest']) {
        localStorage.setItem(personaKey, persona);
        const [list, bytes] = await Promise.all([fetch(`${teacher('p1')}/media`), fetch(image)]);
        scopes[persona] = [list.status, bytes.status];
      }
    } finally {
      if (previous === null) localStorage.removeItem(personaKey);
      else localStorage.setItem(personaKey, previous);
    }

    return {
      status: media.status,
      items: (await media.json()).items,
      listCache: media.headers.get('cache-control'),
      head: { status: head.status, headers: Object.fromEntries(head.headers), body: await head.text() },
      otherImage: otherImage.status,
      badDigest: badDigest.status,
      emptyMedia: await emptyMedia.json(),
      scopes,
    };
  }, bodyImageId);

  expect(result.status).toBe(200);
  expect(result.listCache).toBe('private, no-store');
  expect(result.items).toMatchObject([
    { kind: 'image', field: 'research', title: imageTitle, url: `/api/v1/catalog/objects/p1/teacher-homepage/images/${bodyImageId}`, image: { content_type: 'image/png', width: 640, height: 360, size_bytes: bodyImage.length } },
    { kind: 'image', field: 'sections', section: '近期教学', url: teachingSource },
    { kind: 'video', field: 'sections', section: '教学媒体' },
    { kind: 'attachment', field: 'sections', section: '教学媒体' },
  ]);
  expect(result.head).toEqual({
    status: 200,
    headers: {
      'cache-control': 'private, no-store', 'content-length': String(bodyImage.length), 'content-type': 'image/png',
      'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff',
    },
    body: '',
  });
  expect(result.otherImage).toBe(404);
  expect(result.badDigest).toBe(400);
  expect(result.emptyMedia).toEqual({ items: [] });
  expect(result.scopes).toEqual({ unverified: [403, 403], guest: [401, 401] });
}

for (const [locale, { direction }] of Object.entries(languages)) {
  const messages = JSON.parse(readFileSync(new URL(`../../src/locales/${locale}.json`, import.meta.url), 'utf8'));
  const homepage = messages.teacherHomepage;
  const localized = (path) => `${path}?lang=${locale}`;

  test.describe(locale, () => {
    if (locale === 'ar-EG') test.use({ viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, screen });

    test('the demo serves teacher photos and body media and accepts a reader complaint', async ({ page }) => {
      const sourceRequests = [];
      page.on('request', (request) => {
        if (new URL(request.url()).origin === new URL(teachingSource).origin) sourceRequests.push(request.url());
      });
      await page.goto(localized('/teachers/p1'));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', direction);
      const profile = page.getByRole('region', { name: homepage.title, exact: true });
      const photo = profile.getByRole('img', { name: homepage.photo.replace('{name}', '林知远'), exact: true });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute('src', /^blob:/);
      await expect.poll(() => photo.evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([128, 160]);

      await profile.locator('figure').filter({ hasText: imageTitle }).scrollIntoViewIfNeeded();
      const copy = profile.getByRole('img', { name: imageTitle, exact: true });
      await expect(copy).toHaveAttribute('src', /^blob:/);
      await expect.poll(() => copy.evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([640, 360]);
      await profile.getByText('近期教学', { exact: true }).click();
      await expectSourceLink(profile, '课堂板书示例', teachingSource);
      await profile.getByText('教学媒体', { exact: true }).click();
      await expectSourceLink(profile, homepage.media.videoLink, `${teachingSource}/video`);
      await expectSourceLink(profile, homepage.media.attachmentLink, `${teachingSource}/worksheet.pdf`);
      expect(sourceRequests).toEqual([]);

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
      if (locale === 'zh-CN') await expectMediaAccess(page);
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
