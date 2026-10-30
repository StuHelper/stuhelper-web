import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';

async function setup(page, info, target = '/resources?school_id=school&course_id=course') {
  const locale = info.project.metadata.locale;
  const all = JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8'));
  const s = fixture(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (/\[intlify\].*(Not found|Fall back)/i.test(e.text())) errors.push(e.text()); });
  await routes(page, s);
  await page.goto(`http://127.0.0.1:18787${target}${target.includes('?') ? '&' : '?'}lang=${locale}`);
  return { all, m: all.resources, s, errors, locale };
}
async function layout(page, errors, locale) {
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  if (process.env.RESOURCE_SCREENSHOTS && ((locale === 'zh-CN' && page.viewportSize().width > 800) || (locale === 'ar-EG' && page.viewportSize().width < 800)) && test.info().title.startsWith('configured')) {
    fs.mkdirSync(process.env.RESOURCE_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.RESOURCE_SCREENSHOTS, `web-${locale}.png`), fullPage: true });
  }
}
// Category names in the fixture exist in Chinese and English; other languages show Chinese.
const fixtureName = (locale, zh, en) => (locale === 'en-US' ? en : zh);
async function describe(page, m, title) {
  await page.getByLabel(m.editor.title, { exact: true }).fill(title);
  await page.getByRole('radio', { name: m.origin.kinds.original, exact: true }).check();
  await page.getByLabel(m.origin.accept, { exact: true }).check();
}

test('configured category field filters and grouping follow server configuration', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info);
  await expect(page.getByRole('link', { name: 'Fixture notes', exact: true })).toBeVisible();
  await page.getByRole('search').getByRole('button', { name: new RegExp(all.common.filters) }).click();
  await page.getByRole('combobox', { name: m.category, exact: true }).selectOption('custom-category');
  await page.getByLabel(fixtureName(locale, '自定义年份', 'Custom year'), { exact: true }).fill('2025');
  await page.getByRole('dialog').getByRole('button', { name: m.browse.find, exact: true }).click();
  await expect(page.getByRole('heading', { name: new Intl.NumberFormat(locale, { useGrouping: false }).format(2025), exact: true })).toBeVisible();
  expect(s.calls.some((x) => x.query?.attributes === '{"edition":{"number":2025}}')).toBe(true);
  await layout(page, errors, locale);
});

test('upload uses current terms and retries the original metadata request', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info, '/resources/new?school_id=school&course_id=course');
  await describe(page, m, 'Uploaded lecture');
  s.lose = true;
  await page.getByRole('button', { name: m.editor.create, exact: true }).click();
  await expect(page.getByText(all.common.uncertain, { exact: true })).toBeVisible();
  await expect(page.getByLabel(m.editor.title, { exact: true })).toHaveValue('Uploaded lecture');
  await page.getByRole('button', { name: all.common.retryOriginal, exact: true }).click();
  await expect(page.getByText(m.editor.saved, { exact: true })).toBeVisible();
  const posts = s.calls.filter((x) => x.path === '' && x.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0].key).toBe(posts[1].key);
  expect(posts[0].body).toEqual(posts[1].body);
  expect(posts[0].body.metadata.origin.consent).toEqual({ accepted: true, version: 'v1', digest: 'a'.repeat(64) });
  await page.getByLabel(m.editor.chooseFile, { exact: true }).setInputFiles({ name: 'lecture.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.getByRole('button', { name: m.editor.send, exact: true }).click();
  await expect(page.getByText(m.editor.uploadState.attached, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: m.editor.submit, exact: true }).click();
  await expect(page.getByText(m.versionState.pending, { exact: true })).toBeVisible();
  expect(s.calls.find((x) => x.path === '/api/v1/media/uploads')?.body.purpose).toBe('custom-profile');
  await layout(page, errors, locale);
});

test('current denial clears resource data and request receipts survive navigation', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info, '/resources/items/resource');
  await expect(page.getByRole('heading', { name: 'Fixture notes', exact: true })).toBeVisible();
  s.reject = true;
  await page.getByRole('button', { name: m.detail.download, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(all.errors.forbidden);
  await expect(page.getByRole('heading', { name: 'Fixture notes', exact: true })).toHaveCount(0);
  s.reject = false;
  await page.goto(`http://127.0.0.1:18787/resources/requests?lang=${locale}`);
  await expect(page).toHaveURL(/\/me\/requests/);
  await page.getByRole('button', { name: all.me.checkStatus, exact: true }).click();
  await expect(page.getByText('Processed decision')).toBeVisible();
  await page.getByRole('button', { name: all.me.appeal, exact: true }).click();
  await page.getByLabel(m.request.reason, { exact: true }).fill('Additional authorization evidence');
  await page.getByRole('button', { name: all.common.submit, exact: true }).click();
  await expect.poll(() => s.calls.filter((x) => x.path.endsWith('/requests') && x.method === 'POST').length).toBe(1);
  expect(s.calls.find((x) => x.path.endsWith('/requests') && x.method === 'POST').body.previous_task_id).toBe('previous-task');
  await layout(page, errors, locale);
});

test('folder packages list every part and allow individual retry', async ({ page }, info) => {
  const { m, s, errors, locale } = await setup(page, info);
  await page.getByRole('button', { name: fixtureName(locale, '资料目录', 'Resource folder'), exact: true }).click();
  await page.getByRole('button', { name: m.browse.downloadFolder, exact: true }).click();
  await expect(page.getByRole('heading', { name: m.package.title, exact: true })).toBeVisible();
  const parts = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: m.package.download, exact: true }) });
  await expect(parts).toHaveCount(2);
  await parts.first().getByRole('button', { name: m.package.download, exact: true }).click();
  await expect.poll(() => s.calls.filter((x) => x.path === '/packages/package/parts/1').length).toBe(1);
  await parts.first().getByRole('button', { name: m.package.download, exact: true }).click();
  await expect.poll(() => s.calls.filter((x) => x.path === '/packages/package/parts/1').length).toBe(2);
  expect(s.calls.find((x) => x.path === '/packages').body).toEqual({ directory_id: 'folder' });
  await layout(page, errors, locale);
});

test('owned file reuse avoids content transfer and keeps separate review', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info, '/resources/new?school_id=school&course_id=course');
  await describe(page, m, 'Reused lecture');
  await page.getByRole('button', { name: m.editor.create, exact: true }).click();
  await expect(page.getByText(m.editor.saved, { exact: true })).toBeVisible();
  s.media.reused = true;
  s.media.state = 'verifying';
  await page.getByLabel(m.editor.chooseFile, { exact: true }).setInputFiles({ name: 'lecture.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.getByRole('button', { name: m.editor.send, exact: true }).click();
  await expect(page.getByText(m.editor.reusePending, { exact: true })).toBeVisible();
  const puts = () => s.calls.filter((x) => x.path?.startsWith('/api/v1/media') && x.method === 'PUT');
  expect(puts()).toHaveLength(0);
  s.media.state = 'awaiting_approval';
  await page.getByRole('button', { name: all.common.retry, exact: true }).click();
  await expect(page.getByText(m.editor.reused, { exact: true })).toBeVisible();
  await expect(page.getByText(m.editor.uploadState.attached, { exact: true })).toBeVisible();
  expect(s.calls.filter((x) => x.path === '/api/v1/media/uploads')).toHaveLength(1);
  expect(s.calls.find((x) => x.path === '/api/v1/media/uploads').body.reuse_existing).toBe(true);
  expect(puts()).toHaveLength(0);
  await page.getByRole('button', { name: m.editor.submit, exact: true }).click();
  await expect(page.getByText(m.versionState.pending, { exact: true })).toBeVisible();
  await layout(page, errors, locale);
});
