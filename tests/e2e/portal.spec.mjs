import fs from 'node:fs';
import { expect, test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the portal shows the brand first and sends no business request', async ({ page }, info) => {
  const all = catalogue(info), seen = [];
  page.on('request', (request) => { if (/\/api\/v1\/(catalog|reviews|resources|search)/.test(request.url())) seen.push(request.url()); });
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.brand.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: all.portal.campus.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: all.portal.platform.title, exact: true })).toBeVisible();
  // Product navigation shows; the campus sub-navigation belongs to campus pages only.
  await expect(page.getByRole('navigation', { name: all.nav.primary, exact: true }).getByRole('link', { name: all.nav.campus, exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: all.nav.campusSections, exact: true })).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(seen).toEqual([]);
});

test('product pages introduce the product and link to its own site', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  for (const [path, name, host, tag] of [['/newapi', 'StuHelper API', 'newapi.stuhelper.com', all.portal.api.tag], ['/store', 'StuHelper Store', 'store.stuhelper.org', all.portal.store.tag]]) {
    await page.goto(`${base}${path}?lang=${locale}`);
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByText(tag, { exact: true })).toBeVisible();
    const visit = page.getByRole('link', { name: all.portal.visit.replace('{host}', host), exact: true });
    await expect(visit).toHaveAttribute('href', `https://${host}`);
    await expect(visit).toHaveAttribute('rel', 'noopener');
    await expect(page).toHaveTitle(name);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  }
});

test('the campus home keeps its sub-navigation and the brand leads back to the portal', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await page.goto(`${base}/campus?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.home.title, exact: true })).toBeVisible();
  const sections = page.getByRole('navigation', { name: all.nav.campusSections, exact: true }).first();
  await expect(sections.getByRole('link', { name: all.nav.discover, exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: all.brand.home, exact: true }).click();
  await expect(page).toHaveURL(/\/(\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: all.brand.name, exact: true })).toBeVisible();
});

test('the appearance choice applies at once and survives a reload', async ({ page }, info) => {
  const all = catalogue(info);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await page.getByRole('button', { name: all.shell.themeDark, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: all.shell.themeLight, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the portal does not advertise the open platform when that module is off', async ({ page }, info) => {
  const all = catalogue(info);
  // The launch set: campus modules on, open platform off.
  await page.route('**/api/v1/system/capabilities', (route) => route.fulfill({ json: { api_version: 1, capabilities: ['favorites.manage', 'notifications.inbox', 'search.query'] } }));
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 2, name: all.portal.campus.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: all.portal.platform.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: all.nav.products, exact: true }).getByRole('link', { name: all.nav.platform })).toHaveCount(0);
  await expect(page.getByRole('contentinfo').getByRole('link', { name: all.nav.platform, exact: true })).toHaveCount(0);
});
