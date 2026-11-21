import fs from 'node:fs';
import { expect, memberTest } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));

// The server reply is held back so the busy state can be observed before the page leaves.
function slowLogout(page, path, body) {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  page.route(`**/api/v1/auth/${path}`, async (route) => { calls.push(route.request().method()); await gate; await route.fulfill({ json: body }); });
  return { calls, release: () => release() };
}

memberTest('signing out from the menu shows progress at once, is sent once, and says this device was signed out', async ({ page }, info) => {
  const c = catalogue(info);
  const logout = slowLogout(page, 'logout', { signed_out: true, upstream_ended: true });
  await page.goto(`${base}/courses?lang=${info.project.metadata.locale}`);
  await page.getByRole('banner').getByRole('button', { name: c.nav.account, exact: true }).click();
  await page.getByRole('menuitem', { name: c.account.menu.signOut }).click();
  const busy = page.getByRole('banner').getByRole('status', { name: c.account.signingOut });
  await expect(busy).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: c.nav.account, exact: true })).toHaveCount(0);
  logout.release();
  const notice = page.getByRole('status').filter({ hasText: c.account.signedOut.device });
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText(c.account.upstreamStillActive);
  expect(logout.calls).toEqual(['POST']);
  await page.reload();
  await expect(page.getByText(c.account.signedOut.device)).toHaveCount(0);
});

memberTest('signing out everywhere says all signed-in devices were signed out and notes an unconfirmed single sign-on', async ({ page }, info) => {
  const c = catalogue(info);
  const logout = slowLogout(page, 'logout-all', { signed_out: true, current_session: true, upstream_ended: false });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: c.security.signOutAll, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.security.signOutAll, exact: true }).click();
  logout.release();
  const notice = page.getByRole('status').filter({ hasText: c.account.signedOut.all });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(c.account.upstreamStillActive);
  expect(logout.calls).toEqual(['POST']);
});

memberTest('cancelling sign out everywhere keeps the dialog on that choice while it closes', async ({ page }, info) => {
  const c = catalogue(info);
  await page.goto(`${base}/me?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: c.account.signOutAll, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(c.me.sessions.allConfirm);
  // Record the dialog text on every frame until it is removed, so a brief switch during the closing animation is caught.
  const seen = page.evaluate(() => new Promise((resolve) => {
    const texts = [];
    const sample = () => {
      const node = document.querySelector('[role="dialog"]');
      if (!node) { resolve(texts); return; }
      texts.push(node.textContent ?? '');
      requestAnimationFrame(sample);
    };
    sample();
  }));
  await dialog.getByRole('button', { name: c.common.cancel, exact: true }).click();
  const texts = await seen;
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) {
    expect(text).toContain(c.me.sessions.allConfirm);
    expect(text).not.toContain(c.me.sessions.deviceConfirm);
  }
  await expect(dialog).toHaveCount(0);
});
