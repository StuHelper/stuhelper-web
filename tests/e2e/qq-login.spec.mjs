import fs from 'node:fs';
import { expect, memberTest, test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));

test('a guest sees QQ sign-in in the header and it asks the server for the QQ sign-in page', async ({ page }, info) => {
  const a = catalogue(info).account;
  const logins = [];
  await page.route((url) => url.pathname === '/api/v1/auth/login', (route) => { logins.push(new URL(route.request().url())); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>login</p>' }); });
  await page.goto(`${base}/?lang=${info.project.metadata.locale}`);
  const qq = page.getByRole('banner').getByRole('button', { name: a.signInWithQq, exact: true });
  await expect(qq).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: a.signIn, exact: true })).toBeVisible();
  await qq.click();
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

memberTest('the security page links to the account centre for optional QQ sign-in', async ({ page }, info) => {
  const s = catalogue(info).security.qqLogin;
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const section = page.getByRole('region', { name: s.title, exact: true });
  await expect(section.getByText(s.hint, { exact: true })).toBeVisible();
  const link = section.getByRole('link', { name: new RegExp(s.manage) });
  await expect(link).toHaveAttribute('href', 'https://sso.stuhelper.com/account');
  await expect(link).toHaveAttribute('target', '_blank');
});
