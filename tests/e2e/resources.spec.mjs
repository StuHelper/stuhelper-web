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
  await page.getByRole('button', { name: all.common.filters, exact: true }).click();
  await page.getByRole('combobox', { name: m.category, exact: true }).click();
  await page.getByRole('option', { name: fixtureName(locale, '自定义', 'Custom') }).click();
  await page.getByLabel(fixtureName(locale, '自定义年份', 'Custom year'), { exact: true }).fill('2025');
  await page.getByRole('dialog').getByRole('button', { name: m.browse.find, exact: true }).click();
  await expect(page.getByRole('heading', { name: new Intl.NumberFormat(locale, { useGrouping: false }).format(2025), exact: true })).toBeVisible();
  expect(s.calls.some((x) => x.query?.attributes === '{"edition":{"number":2025}}')).toBe(true);
  await layout(page, errors, locale);
});

test('new resource explains why uploads are unavailable when there are no enabled categories', async ({ page }, info) => {
  const target = '/resources/new?school_id=school&course_id=course';
  const { m } = await setup(page, info, target);
  await page.route('**/api/v1/resources/categories*', route => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.reload();
  await expect(page.getByText(m.editor.noCategories, { exact: true })).toBeVisible();
  await expect(page.getByLabel(m.editor.title, { exact: true })).toHaveCount(0);
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

test('tags are added one at a time with Enter, a comma or leaving the field, and can be removed', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info, '/resources/new?school_id=school&course_id=course');
  const tg = all.tags;
  await describe(page, m, 'Tagged notes');
  const field = page.getByRole('textbox', { name: m.editor.tags, exact: true });
  await field.fill('期末');
  await field.press('Enter');
  await field.fill('真题');
  await field.press(',');
  await field.fill('Week 3');
  // Leaving the field also keeps what was typed; a duplicate is not added twice.
  await page.getByLabel(m.editor.title, { exact: true }).click();
  await field.fill('期末');
  await field.press('Enter');
  const chips = page.getByRole('list', { name: m.editor.tags });
  await expect(chips.getByRole('listitem')).toHaveText(['期末', '真题', 'Week 3']);
  await expect(field).toHaveValue('');
  await chips.getByRole('button', { name: tg.remove.replace('{tag}', '真题') }).click();
  // Backspace in an empty field takes the last tag back for editing.
  await field.press('Backspace');
  await expect(field).toHaveValue('Week 3');
  await field.press('Enter');
  await field.fill('x'.repeat(65));
  await field.press('Enter');
  await expect(page.getByText(tg.tooLong.replace('{max}', '64'))).toBeVisible();
  await expect(field).toHaveValue('x'.repeat(65));
  await field.fill('');
  await page.getByRole('button', { name: m.editor.create, exact: true }).click();
  await expect(page.getByText(m.editor.saved, { exact: true })).toBeVisible();
  expect(s.calls.find((x) => x.path === '' && x.method === 'POST').body.metadata.tags).toEqual(['期末', 'Week 3']);
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
  await page.goto(`http://127.0.0.1:18787/me/requests?lang=${locale}`);
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
  s.media.state = 'ready';
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

test('the side list shows recently visited courses, filters by one and can be cleared', async ({ page }, info) => {
  const locale = info.project.metadata.locale;
  const b = JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8')).browse;
  const s = fixture(), deletes = [];
  await routes(page, s);
  await page.route('**/api/v1/catalog/me/recent-courses', (route) => {
    if (route.request().method() === 'DELETE') { deletes.push(1); return route.fulfill({ json: { cleared: true } }); }
    const items = deletes.length ? [] : [{ course: { id: 'course', kind: 'course', school_id: 'school', name: 'Visited course', credits: null, aliases: [], revision: 1, updated_at: '2026-11-15T00:00:00Z' }, visited_at: '2026-11-15T00:00:00Z', resource_count: 3 }];
    return route.fulfill({ json: { items, resources_state: 'available' } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:18787/resources?lang=${locale}`);
  const side = page.getByRole('navigation', { name: b.recentCourses });
  await side.getByRole('button', { name: /Visited course/ }).click();
  await expect(side.getByRole('button', { name: /Visited course/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => s.calls.some((call) => call.path === '' && call.query?.course_id === 'course')).toBe(true);
  expect(new URL(page.url()).searchParams.has('course_id')).toBe(false);
  await side.getByRole('button', { name: b.clearRecent, exact: true }).click();
  await expect(side.getByText(b.noRecentCourses, { exact: true })).toBeVisible();
  expect(deletes).toHaveLength(1);
});

test('starting another upload after saving creates two independent drafts', async ({ page }, info) => {
  const { all, m, s } = await setup(page, info, '/resources');
  const drafts = new Map();
  await page.route('**/api/v1/resources', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const id = 'draft-' + (drafts.size + 1);
    const { metadata } = route.request().postDataJSON();
    drafts.set(id, metadata.title);
    return route.fulfill({ json: {
      ...s.resource, id, revision: 1, state: 'draft', current: undefined,
      proposal: { ...s.version, metadata, file: undefined, state: 'draft' },
    } });
  });
  const start = () => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/resources/new'));
  for (const [index, title] of ['First lecture', 'Second lecture'].entries()) {
    await start();
    await expect(page.getByLabel(m.editor.title, { exact: true })).toHaveValue('');
    await page.getByRole('combobox', { name: all.academic.course, exact: true }).click();
    await page.getByRole('option', { name: 'Fixture course' }).click();
    await describe(page, m, title);
    await page.getByRole('button', { name: m.editor.create, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/resources/items/draft-' + (index + 1) + '/edit$'));
    await expect(page.getByText(m.editor.saved, { exact: true })).toBeVisible();
  }
  expect([...drafts.entries()]).toEqual([['draft-1', 'First lecture'], ['draft-2', 'Second lecture']]);
  expect(s.calls.filter(call => call.method === 'PUT')).toEqual([]);
});

test('inline preview, directory picker, file-type filter, group order and expired package regeneration work together', async ({ page }, info) => {
  const { all, m, s, errors, locale } = await setup(page, info, '/resources');
  // Course name is resolved via lookup on rows even when recent-courses is empty.
  await expect(page.getByText(/Fixture course/)).toBeVisible();

  // Enter folder and click upload: directory_id travels in history state and preselects the folder.
  await page.getByRole('button', { name: fixtureName(locale, '资料目录', 'Resource folder'), exact: true }).click();
  await page.getByRole('link', { name: m.upload, exact: true }).click();
  await expect(page).toHaveURL(/\/resources\/new/);
  expect(new URL(page.url()).searchParams.has('directory_id')).toBe(false);
  await page.getByRole('combobox', { name: all.academic.course, exact: true }).fill('Fixture');
  await page.getByRole('option', { name: 'Fixture course' }).click();
  await page.getByRole('button', { name: fixtureName(locale, '资料目录', 'Resource folder'), exact: true }).click();
  await describe(page, m, 'Folder lecture');
  await page.getByRole('button', { name: m.editor.create, exact: true }).click();
  await expect(page.getByText(m.editor.saved, { exact: true })).toBeVisible();
  expect(s.calls.find((x) => x.path === '' && x.method === 'POST')?.body.metadata.directory_id).toBe('folder');

  // Inline preview and pending proposal inspection on DetailView.
  s.resource = {
    id: 'resource',
    revision: 3,
    state: 'published',
    current: s.version,
    proposal: { ...s.version, id: 'proposal-v2', metadata: { ...s.metadata, title: 'Updated lecture v2' }, state: 'pending' },
    download_allowed: true,
    access_reason: 'allowed',
    owned: true,
  };
  await page.goto(`http://127.0.0.1:18787/resources/items/resource?lang=${locale}`);
  await expect(page.getByText('Updated lecture v2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: m.detail.preview, exact: true }).click();
  await expect(page.locator('pre.preview-text')).toHaveText('hello');
  expect(s.calls.some((x) => x.path === '/items/resource/preview')).toBe(true);

  // File-type filter (kept out of URL), deterministic descending group order, and expired package recreate.
  const older = { ...s.resource, id: 'res-2020', current: { ...s.version, id: 'v-2020', metadata: { ...s.metadata, title: 'Paper 2020', attributes: { edition: { number: 2020 } } } } };
  const newer = { ...s.resource, id: 'res-2025', current: { ...s.version, id: 'v-2025', metadata: { ...s.metadata, title: 'Paper 2025', attributes: { edition: { number: 2025 } } } } };
  await page.route('**/api/v1/resources?*', (route) => route.fulfill({ json: { items: [older, newer], next_cursor: '', total: 2 } }));
  const packageBodies = [];
  await page.route('**/api/v1/resources/packages', (route) => {
    packageBodies.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        id: `pkg-${packageBodies.length}`,
        parts: [{ number: 1, bytes: 5, files: [s.file] }],
        expires_at: packageBodies.length % 2 === 1 ? '2020-01-01T00:00:00Z' : '2035-01-01T00:00:00Z',
      },
    });
  });
  await page.goto(`http://127.0.0.1:18787/resources?lang=${locale}`);
  await page.getByRole('button', { name: fixtureName(locale, '自定义试卷', 'Custom papers'), exact: true }).click();
  const headings = page.locator('main h2.d-title');
  await expect(headings).toHaveCount(2);
  await expect(headings.nth(0)).toHaveText(new Intl.NumberFormat(locale, { useGrouping: false }).format(2025));
  await expect(headings.nth(1)).toHaveText(new Intl.NumberFormat(locale, { useGrouping: false }).format(2020));

  await page.getByRole('button', { name: all.common.filters, exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: m.browse.fileType, exact: true }).click();
  await page.getByRole('option', { name: 'TXT', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: m.browse.find, exact: true }).click();
  expect(new URL(page.url()).searchParams.has('file_type')).toBe(false);

  await page.getByRole('button', { name: fixtureName(locale, '资料目录', 'Resource folder'), exact: true }).click();
  await page.getByRole('button', { name: m.browse.downloadFolder, exact: true }).click();
  await expect(page.getByText(m.package.expiredNotice, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: m.package.recreate, exact: true }).click();
  await expect(page.getByText(m.package.expiredNotice, { exact: true })).toHaveCount(0);
  expect(packageBodies).toEqual([{ directory_id: 'folder' }, { directory_id: 'folder' }]);

  await page.getByRole('button', { name: all.browse.batchDownload, exact: true }).click();
  await page.getByRole('checkbox', { name: /Paper 2025/ }).check();
  await page.getByRole('button', { name: all.browse.packDownload, exact: true }).click();
  await expect(page.getByText(m.package.expiredNotice, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: all.browse.cancelSelection, exact: true }).click();
  await page.getByRole('button', { name: m.package.recreate, exact: true }).click();
  await expect(page.getByText(m.package.expiredNotice, { exact: true })).toHaveCount(0);
  expect(packageBodies.slice(2)).toEqual([{ resource_ids: ['res-2025'] }, { resource_ids: ['res-2025'] }]);

  // Own resources course name resolution & receipt resource_title display.
  await page.goto(`http://127.0.0.1:18787/me/resources?lang=${locale}`);
  await expect(page.getByText('Fixture course', { exact: true })).toBeVisible();
  await page.goto(`http://127.0.0.1:18787/me/requests?lang=${locale}`);
  await expect(page.getByText('Fixture notes', { exact: true })).toBeVisible();
  await layout(page, errors, locale);
});

test('transient list download failures toast in place and my-resources withdrawal auto-opens request form', async ({ page }, info) => {
  const { all, m, errors, locale } = await setup(page, info);
  await page.route('**/api/v1/resources/items/resource/download', (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  if (page.viewportSize().width <= 760) {
    await page.getByRole('button', { name: all.browse.moreActionsFor.replace('{p0}', 'Fixture notes'), exact: true }).click();
    await page.getByRole('menuitem', { name: all.browse.download, exact: true }).click();
  } else {
    await page.getByRole('button', { name: all.browse.downloadItem.replace('{p0}', 'Fixture notes'), exact: true }).click();
  }
  await expect(page.getByText(all.errors.unavailable, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/resources(\?|$)/);

  await page.goto(`http://127.0.0.1:18787/me/resources?lang=${locale}`);
  await page.getByRole('link', { name: all.me.requestWithdrawal, exact: true }).click();
  await expect(page.getByLabel(m.request.reason, { exact: true })).toBeVisible();
  await layout(page, errors, locale);
});

test('a signed-in rights holder can file a complaint when resource details are denied', async ({ page }, info) => {
  const state = fixture();
  await routes(page, state);
  await page.route('**/api/v1/resources/items/resource', route => route.fulfill({ status: 403, json: { code: 'resources_permission_denied' } }));
  const { locale } = info.project.metadata;
  const all = JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8'));
  await page.goto(`http://127.0.0.1:18787/resources/items/resource?lang=${locale}`);
  await page.getByRole('button', { name: all.resources.detail.complain }).click();
  const reason = page.getByLabel(all.resources.request.reason, { exact: true });
  const submit = page.getByRole('button', { name: all.common.submit, exact: true });
  await reason.fill('Fixture rights claim');
  await page.getByLabel(all.resources.request.contact, { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel(all.resources.request.evidence, { exact: true }).fill('Fixture ownership evidence');
  // A complaint needs a violation type; the long list is searchable.
  await expect(submit).toBeDisabled();
  await page.getByRole('combobox', { name: all.violation.label, exact: true }).click();
  const categories = page.getByRole('option').and(page.locator(':not([data-disabled])'));
  await expect(categories).toHaveText(Object.values(all.violation.categories).map(({ name }) => name));
  await page.getByRole('textbox', { name: all.common.searchOptions }).fill(all.violation.categories.copyright.name);
  await page.getByRole('option', { name: all.violation.categories.copyright.name, exact: true }).click();
  await expect(page.getByText(all.violation.categories.copyright.hint, { exact: true })).toBeVisible();
  const posts = () => state.calls.filter(call => call.path === '/items/resource/requests' && call.method === 'POST');
  const atLimit = '😀'.repeat(2000);
  const overLimit = atLimit + '😀';
  const number = new Intl.NumberFormat(locale);
  await reason.fill(overLimit);
  expect((await reason.inputValue()) === overLimit).toBe(true);
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(reason).toHaveAccessibleDescription(`${number.format(2001)} / ${number.format(2000)}`);
  await expect(submit).toBeDisabled();
  await reason.evaluate((field) => field.form.requestSubmit());
  expect(posts()).toHaveLength(0);

  await reason.fill(atLimit);
  await expect(reason).toHaveAccessibleDescription(`${number.format(2000)} / ${number.format(2000)}`);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(all.resources.request.received)).toBeVisible();
  expect(posts().map(call => [call.body.kind, call.body.category])).toEqual([['complaint', 'copyright']]);
  expect(posts()[0].body.reason === atLimit).toBe(true);
});

test('an uploader can correct owned metadata using its saved category when category browsing is denied', async ({ page }, info) => {
  const state = fixture();
  const saved = structuredClone(state.metadata);
  await routes(page, state);
  await page.route('**/api/v1/verification/summary', route => route.fulfill({ json: {
    campus_eligibility: false, teacher_verified: false, identity_verified: false,
    evaluated_at: '2026-11-01T00:00:00Z', revision: 1, next_evaluation_at: null,
  } }));
  await page.route('**/api/v1/resources/categories?**', route => route.fulfill({ status: 403, json: { code: 'permission_denied' } }));
  const locale = info.project.metadata.locale;
  const m = JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8')).resources;
  await page.goto(`http://127.0.0.1:18787/resources/items/resource/edit?lang=${locale}`);
  await page.locator('.stepper').getByRole('button', { name: m.editor.step1 }).click();
  await expect(page.getByLabel(m.editor.title, { exact: true })).toHaveValue(saved.title);
  await page.getByLabel(m.editor.title, { exact: true }).fill('Corrected title');
  await page.getByRole('button', { name: m.editor.saveChanges, exact: true }).click();
  await expect.poll(() => state.resource.proposal?.metadata.title).toBe('Corrected title');
  expect(state.resource.proposal.metadata).toEqual({ ...saved, title: 'Corrected title' });
  expect(state.resource.current.metadata.title).toBe(saved.title);
  expect(state.calls.filter(call => call.method === 'PUT' && call.path === '/items/resource')).toHaveLength(1);
});

test('course suggestions load on opening the picker and closing discards a pending search', async ({ page }, info) => {
  const searches = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/catalog/objects' && url.searchParams.get('kind') === 'course') searches.push(url.searchParams.get('q') ?? '');
  });
  await page.clock.install();
  const { all } = await setup(page, info, '/resources/new');
  const picker = page.getByRole('combobox', { name: all.academic.course, exact: true });
  await expect(picker).toBeVisible();
  await page.clock.fastForward(1000);
  expect(searches).toEqual([]);
  await picker.click();
  await expect(page.getByRole('option', { name: 'Fixture course', exact: true })).toBeVisible();
  await picker.fill('discarded');
  await picker.press('Escape');
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await page.clock.fastForward(1000);
  expect(searches).toEqual(['']);
  await picker.click();
  await expect(page.getByRole('option', { name: 'Fixture course', exact: true })).toBeVisible();
  expect(searches).not.toContain('discarded');
});

test('the filter sheet does not follow the reader to another page and is closed on return', async ({ page }, info) => {
  const { all, errors } = await setup(page, info);
  await expect(page.getByRole('link', { name: 'Fixture notes', exact: true })).toBeVisible();
  // Visit another page and come back so the list is the kept instance, then leave it with the sheet open.
  await page.locator('a[href="/courses"]:visible').first().click();
  await expect(page).toHaveURL(/\/courses/);
  await page.goBack();
  await expect(page).toHaveURL(/\/resources/);
  await page.getByRole('button', { name: all.common.filters, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/courses/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe('none');
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Fixture notes', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('editing an original resource asks again when its consent was given to older terms', async ({ page }, info) => {
  const locale = info.project.metadata.locale;
  const m = JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8')).resources;
  const state = fixture();
  await routes(page, state);
  const open = async (consent) => {
    state.metadata.origin = { kind: 'original', consent };
    await page.goto(`http://127.0.0.1:18787/resources/items/resource/edit?lang=${locale}`);
    await page.locator('.stepper').getByRole('button', { name: m.editor.step1 }).click();
    return page.getByLabel(m.origin.accept, { exact: true });
  };
  // The fixture serves terms v1; a consent to v0 must not stay ticked.
  await expect(await open({ accepted: true, version: 'v0', digest: 'b'.repeat(64) })).not.toBeChecked();
  await expect(await open({ accepted: true, version: 'v1', digest: 'a'.repeat(64) })).toBeChecked();
});
