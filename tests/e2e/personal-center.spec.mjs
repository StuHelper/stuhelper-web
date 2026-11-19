import { member } from './demo-fixture.mjs';
import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
// Every personal page a signed-in member can open when all optional modules run.
const pages = ['/notifications', '/me/reviews', '/me/resources', '/me/requests', '/me/verification', '/me/groups', '/me/storage', '/me/favorites', '/me/votes', '/me/wallet', '/me/membership', '/me/apps', '/me/developer', '/me/profile', '/me/account'];

test('every personal page can be reached from the personal center on a phone and on a wide screen', async ({ page }, info) => {
  const all = catalogue(info);
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/session') || path.endsWith('/system/capabilities') || path.endsWith('/verification/summary') || path.endsWith('/notifications/unread-count')) return route.fallback();
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.me.title, exact: true })).toBeVisible();
  await expect(page.getByText(`${all.verification.campus} · ${all.verification.eligible}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${all.verification.identity} · ${all.verification.identityMissing}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${all.verification.phone} · ${all.verification.phoneBound}`, { exact: true })).toBeVisible();
  const phone = page.viewportSize().width <= 760;
  // A phone has no side navigation: the overview page itself is the menu. A wide screen uses the side navigation.
  await expect(page.locator('nav.me-nav')).toBeVisible({ visible: !phone });
  for (const path of pages) await expect(page.locator(`main a[href="${path}"]:visible`), path).not.toHaveCount(0);
  if (phone) {
    for (const key of ['content', 'groups.account', 'groups.services']) {
      const title = key.split('.').reduce((node, part) => node[part], all.me);
      await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    }
    // "My courses" stays switched off in the production build, on phones as well.
    await expect(page.locator('a[href="/me/courses"]')).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('a required nickname has a visible prompt and accepts at most twenty code points', async ({ page }, info) => {
  const all = catalogue(info), p = all.me.profile;
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: { ...member, profile: { ...member.profile, nickname: '', nickname_required: true } } }));
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  const section = page.locator('section.profile');
  await expect(section.getByText(all.profile.nicknameRequired, { exact: true })).toBeVisible();
  await section.locator('button').first().click();
  const input = section.getByLabel(p.nickname, { exact: true });
  const save = section.getByRole('button', { name: all.common.save, exact: true });
  await input.fill('😀'.repeat(21));
  await expect(save).toBeDisabled();
  await input.fill('😀'.repeat(20));
  await expect(save).toBeEnabled();
});
