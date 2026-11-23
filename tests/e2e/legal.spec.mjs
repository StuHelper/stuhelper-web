import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, test } from '../session-fixture.mjs';
import { legalPath, metadata, publishedDocument } from './legal-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const current = publishedDocument('terms', '3.0');
const archived = publishedDocument('terms', '2.0', {
  effectiveDate: '2026-01-01',
  body: '<h2>服务范围</h2><p>此版本的服务范围以最初发布的内容为准。</p>',
});
const privacy = publishedDocument('privacy', '3.0', { body: '<p>本示例介绍个人信息的处理方式。</p>' });
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const open = (page, url, info) => page.goto(new URL(`${url}?lang=${info.project.metadata.locale}`, info.project.use.baseURL ?? base).href);
const alertAt = (page) => page.getByRole('main').getByRole('alert');
const problem = (route, status, code) => route.fulfill({ status, json: { code } });

test.use({ timezoneId: 'America/Los_Angeles' });

async function routeDocuments(page, respond) {
  const requests = [];
  await page.route((url) => url.pathname.startsWith(`${legalPath}/`), (route) => {
    const url = new URL(route.request().url());
    requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    return respond(route, url);
  });
  return requests;
}

async function screenshot(page, info, name, project = 'desktop-zh-CN') {
  const directory = process.env.LEGALWEB_SCREENSHOTS;
  if (directory && info.project.name === project) {
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${project}-${name}.png`), animations: 'disabled' });
  }
}

test('footer links open the current public terms and privacy policy with their calendar date', async ({ page }, info) => {
  const c = catalogue(info);
  const requests = await routeDocuments(page, (route, url) => route.fulfill({ json: url.pathname.endsWith('/terms') ? current : privacy }));
  await open(page, '/', info);
  const footer = page.getByRole('contentinfo');
  const terms = footer.getByRole('link', { name: c.legal.terms, exact: true });
  const policy = footer.getByRole('link', { name: c.legal.privacy, exact: true });
  await expect(terms).toHaveAttribute('href', '/legal/terms');
  await expect(policy).toHaveAttribute('href', '/legal/privacy');
  await terms.click();
  const article = page.getByRole('article', { name: current.title });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: current.title })).toBeVisible();
  await expect(article.getByText('本示例说明服务的使用方式及用户行权渠道。')).toBeVisible();
  const date = await page.evaluate(({ locale, date }) => new Intl.DateTimeFormat(locale, {
    calendar: 'gregory', dateStyle: 'medium', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`)), { locale: info.project.metadata.locale, date: current.effective_date });
  await expect(main.getByText(current.version, { exact: true })).toBeVisible();
  await expect(main.getByRole('definition')).toHaveText(date);
  await expect(main.getByRole('link', { name: c.legal.history })).toHaveAttribute('href', '/legal/terms/versions');
  await expect(main.getByRole('note')).toHaveCount(0);
  await screenshot(page, info, 'current');
  await policy.click();
  await expect(page.getByRole('heading', { level: 1, name: privacy.title })).toBeVisible();
  expect(requests).toEqual([`GET ${legalPath}/terms`, `GET ${legalPath}/privacy`]);
});

test('a fixed version opens the stored publication and can return to the current version', async ({ page }, info) => {
  const c = catalogue(info);
  const requests = await routeDocuments(page, (route, url) => route.fulfill({ json: url.pathname.endsWith('/2.0') ? archived : current }));
  await open(page, '/legal/terms/versions/2.0', info);
  const article = page.getByRole('article', { name: archived.title });
  const main = page.getByRole('main');
  await expect(main.getByRole('note')).toHaveText(c.legal.fixed);
  await expect(article.getByText('此版本的服务范围以最初发布的内容为准。')).toBeVisible();
  await expect(main.getByRole('link', { name: c.legal.history })).toHaveAttribute('href', '/legal/terms/versions');
  await screenshot(page, info, 'fixed');
  await main.getByRole('link', { name: c.legal.current }).click();
  await expect(article.getByText('本示例说明服务的使用方式及用户行权渠道。')).toBeVisible();
  await expect(main.getByRole('note')).toHaveCount(0);
  expect(requests).toEqual([`GET ${legalPath}/terms/versions/2.0`, `GET ${legalPath}/terms`]);
});

test('legal history follows the server offset and retries an unavailable next page', async ({ page }, info) => {
  const c = catalogue(info);
  const upcoming = publishedDocument('terms', '4.0', { effectiveDate: '2027-01-01' });
  const firstPage = [upcoming, current, ...Array.from({ length: 48 }, (_, index) => ({ ...archived, version: `2.${49 - index}` }))].map(metadata);
  let followingAttempts = 0;
  const requests = await routeDocuments(page, (route, url) => {
    if (url.pathname.endsWith('/2.0')) return route.fulfill({ json: archived });
    if (!url.searchParams.has('offset')) return route.fulfill({ json: { items: firstPage, next_offset: 50 } });
    followingAttempts++;
    return followingAttempts === 1
      ? problem(route, 503, 'dependency_unavailable')
      : route.fulfill({ json: { items: [metadata(archived)] } });
  });
  await open(page, '/legal/terms/versions', info);
  const main = page.getByRole('main');
  const list = main.getByRole('list');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(c.legal.history);
  await expect(list.getByRole('listitem')).toHaveCount(50);
  await expect(list.getByRole('link').first()).toHaveAttribute('href', '/legal/terms/versions/4.0');
  await screenshot(page, info, 'history');
  const more = main.getByRole('button', { name: c.common.loadMore });
  await more.click();
  await expect(alertAt(page)).toContainText(c.errors.unavailable);
  await expect(list.getByRole('listitem')).toHaveCount(50);
  await alertAt(page).getByRole('button', { name: c.common.retry }).click();
  await expect(list.getByRole('listitem')).toHaveCount(51);
  await expect(more).toHaveCount(0);
  await list.getByRole('link').last().click();
  await expect(main.getByRole('note')).toHaveText(c.legal.fixed);
  const parsed = requests.slice(0, 3).map((request) => {
    const [method, url] = request.split(' ');
    const { pathname, searchParams } = new URL(url, base);
    return [method, pathname, searchParams.get('limit'), searchParams.get('offset')];
  });
  expect(parsed).toEqual([
    ['GET', `${legalPath}/terms/versions`, '50', null],
    ['GET', `${legalPath}/terms/versions`, '50', '50'],
    ['GET', `${legalPath}/terms/versions`, '50', '50'],
  ]);
  expect(requests.slice(3)).toEqual([`GET ${legalPath}/terms/versions/2.0`]);
});

for (const [status, code] of [[404, 'not_found'], [503, 'dependency_unavailable']]) {
  test(`the current legal page can recover after HTTP ${status}`, async ({ page }, info) => {
    const c = catalogue(info);
    let attempts = 0;
    const requests = await routeDocuments(page, (route) => {
      attempts++;
      return attempts === 1 ? problem(route, status, code) : route.fulfill({ json: current });
    });
    await open(page, '/legal/terms', info);
    await expect(alertAt(page)).toContainText(status === 404 ? c.legal.unpublished : c.errors.unavailable);
    await expect(page.getByRole('article', { name: current.title })).toHaveCount(0);
    await screenshot(page, info, `http-${status}`);
    await alertAt(page).getByRole('button', { name: c.common.retry }).click();
    await expect(page.getByRole('heading', { level: 1, name: current.title })).toBeVisible();
    await expect(alertAt(page)).toHaveCount(0);
    expect(requests).toEqual([`GET ${legalPath}/terms`, `GET ${legalPath}/terms`]);
  });
}

test('malformed slug and version addresses never request a legal document', async ({ page }, info) => {
  const c = catalogue(info);
  const requests = await routeDocuments(page, (route) => problem(route, 404, 'not_found'));
  for (const url of [
    '/legal/Terms', '/legal/terms%0A', '/legal/bad%2Fslug/versions', '/legal/terms%0A/versions',
    '/legal/terms/versions/bad%2Fversion', '/legal/terms/versions/2.0%0A',
  ]) {
    await open(page, url, info);
    await expect(alertAt(page)).toContainText(c.errors.not_found);
    expect(requests).toEqual([]);
  }
});

test('legal body and table keep their reading direction and fit the viewport', async ({ page, isMobile }, info) => {
  const locale = info.project.metadata.locale;
  const title = 'سياسة الخصوصية';
  const columns = ['الغرض', ...Array.from({ length: 15 }, (_, index) => `الحقل ${index + 1}`), 'موعد الحذف'];
  const paragraph = 'تشرح هذه الوثيقة كيفية معالجة معلوماتك الشخصية وطرق ممارسة حقوقك.';
  const body = `<p>${paragraph}</p><table><thead><tr>${columns.map((name) => `<th>${name}</th>`).join('')}</tr></thead><tbody><tr>${columns.map(() => '<td>بيانات</td>').join('')}</tr></tbody></table>`;
  const rtlDocument = publishedDocument('privacy', '3.0', { title, body });
  await routeDocuments(page, (route) => route.fulfill({ json: rtlDocument }));
  await open(page, '/legal/privacy', info);
  const article = page.getByRole('article', { name: title });
  const html = page.locator('html');
  await expect(html).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
  await expect(article.getByText(paragraph, { exact: true })).toHaveCSS('direction', 'rtl');
  const table = article.getByRole('table');
  const first = table.getByRole('columnheader', { name: columns[0], exact: true });
  const last = table.getByRole('columnheader', { name: columns.at(-1), exact: true });
  await expect(first).toBeVisible();
  await expect(first).toHaveCSS('direction', 'rtl');
  // A narrow table may scroll, but an Arabic word must remain readable on one line.
  for (const word of [first, table.getByRole('cell', { name: 'بيانات', exact: true }).first()]) {
    const lines = await word.evaluate((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return new Set(Array.from(range.getClientRects(), (rect) => rect.top)).size;
    });
    expect(lines).toBe(1);
  }
  expect((await first.boundingBox()).x).toBeGreaterThan((await last.boundingBox()).x);
  const pageOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await pageOverflow()).toBeLessThanOrEqual(0);
  await screenshot(page, info, 'rtl', 'mobile-ar-EG');
  if (isMobile) {
    const scrollRange = await table.locator('..').evaluate((element) => {
      element.scrollLeft = -element.scrollWidth;
      return { width: element.clientWidth, scrollWidth: element.scrollWidth, position: element.scrollLeft };
    });
    expect(scrollRange.scrollWidth).toBeGreaterThan(scrollRange.width);
    expect(scrollRange.position).toBeLessThan(0);
    await expect(last).toBeInViewport();
    expect(await pageOverflow()).toBeLessThanOrEqual(0);
  }
  if (locale === 'ar-EG') {
    await page.locator('.locale-select:visible').first().click();
    await page.locator('[role="option"][lang="zh-CN"]').click();
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(article.getByText(paragraph, { exact: true })).toHaveCSS('direction', 'rtl');
    await expect(first).toHaveCSS('direction', 'rtl');
  }
});
