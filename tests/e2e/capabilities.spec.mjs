import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { member } from './demo-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const entries = ['/me/wallet', '/me/membership', '/me/groups', '/me/apps', '/me/developer'];
const optional = ['billing.wallet', 'billing.membership', 'groups.read', 'open-platform.data', 'qq-binding.manage'];
const discovery = (page, capabilities) => page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities } }));

test('disabled modules hide personal entries and direct wallet sends no billing request', async ({ page }, info) => {
  await discovery(page, []);
  const requests = [];
  page.on('request', request => { if (request.url().includes('/api/v1/billing/')) requests.push(request.url()); });
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  await expect(page.locator('a[href="/me/profile"]').first()).toBeAttached();
  for (const path of entries) await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await expect(page.locator('.not-found-code')).toHaveText('404');
  expect(requests).toEqual([]);
});

test('enabled modules show personal entries and discovery failure leaves them available', async ({ page }, info) => {
  await discovery(page, optional);
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  for (const path of entries) await expect(page.locator(`a[href="${path}"]`).first()).toBeAttached();
  await page.route('**/api/v1/system/capabilities', route => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.reload();
  for (const path of entries) await expect(page.locator(`a[href="${path}"]`).first()).toBeAttached();
});

test('loading capabilities blocks wallet requests until discovery finishes', async ({ page }, info) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/system/capabilities', async route => { await pending; await route.fulfill({ json: { api_version: 1, capabilities: [] } }); });
  const requests = [];
  page.on('request', request => { if (request.url().includes('/api/v1/billing/')) requests.push(request.url()); });
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await expect(page.locator('.not-found-code')).toHaveCount(0);
  expect(requests).toEqual([]);
  release();
  await expect(page.locator('.not-found-code')).toHaveText('404');
  expect(requests).toEqual([]);
});

test('disabled groups preserve card consent and disabled QQ never mounts binding', async ({ page }, info) => {
  await discovery(page, []);
  const profile = structuredClone(member.profile);
  profile.group_card_consent.nickname = true;
  const writes = [];
  await page.route('**/api/v1/profiles/me', route => {
    const body = route.request().postDataJSON();
    if (body) writes.push(body);
    return route.fulfill({ json: { ...profile, ...body } });
  });
  const messages = JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
  await page.goto(`${base}/me/profile?lang=${info.project.metadata.locale}`);
  await expect(page.locator('#profile-nickname')).toHaveValue(profile.nickname);
  await expect(page.locator('[aria-labelledby="profile-card"]')).toHaveCount(0);
  await page.locator('#profile-nickname').fill('Updated');
  await page.getByRole('button', { name: messages.profile.save, exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].group_card_consent).toEqual(profile.group_card_consent);
  const requests = [];
  page.on('request', request => { if (request.url().includes('/api/v1/qq-binding/')) requests.push(request.url()); });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await expect(page.locator('[aria-labelledby="security-identity"]')).toBeVisible();
  expect(requests).toEqual([]);
});
