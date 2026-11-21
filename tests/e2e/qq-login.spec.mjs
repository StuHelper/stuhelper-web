import fs from 'node:fs';
import { expect, memberTest, test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));

test('the header offers one sign-in button and QQ sign-in stays on the sign-in prompt', async ({ page }, info) => {
  const a = catalogue(info).account;
  const logins = [];
  await page.route((url) => url.pathname === '/api/v1/auth/login', (route) => { logins.push(new URL(route.request().url())); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>login</p>' }); });
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('button', { name: a.signIn, exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: a.signInWithQq, exact: true })).toHaveCount(0);
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  await page.getByRole('main').getByRole('button', { name: a.signInWithQq, exact: true }).click();
  await expect.poll(() => logins.length).toBe(1);
  expect(logins[0].searchParams.get('provider')).toBe('qq');
  expect(logins[0].searchParams.get('return_to')).toContain(base);
});

test('the ordinary sign-in button sends no provider', async ({ page }, info) => {
  const a = catalogue(info).account;
  const logins = [];
  await page.route((url) => url.pathname === '/api/v1/auth/login', (route) => { logins.push(new URL(route.request().url())); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>login</p>' }); });
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  await page.getByRole('banner').getByRole('button', { name: a.signIn, exact: true }).click();
  await expect.poll(() => logins.length).toBe(1);
  expect(logins[0].searchParams.has('provider')).toBe(false);
});

memberTest('the security page manages QQ sign-in only through the QQ binding section', async ({ page }, info) => {
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('a[href^="https://sso.stuhelper.com/account"]')).toHaveCount(0);
  await expect(page.locator('#security-qq-login')).toHaveCount(0);
});
