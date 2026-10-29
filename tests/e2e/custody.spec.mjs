import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, test } from '../session-fixture.mjs';

async function setup(page, info) {
  const messages = JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
  const m = messages.custody, state = { items: [], posts: [], lose: false, reject: 0, lookups: 0 };
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (/\[intlify\].*(Not found|Fall back)/i.test(e.text())) errors.push(e.text()); });
  await page.clock.install({ time: new Date('2029-12-26T00:00:00Z') });
  await page.route('**/api/v1/storage/custody**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/policy')) return route.fulfill({ json: { version: 'custody-v1', digest: 'a'.repeat(64), url: 'https://example.invalid/custody', max_term_seconds: 30 * 86400 } });
    if (state.reject) return route.fulfill({ status: state.reject, json: { code: 'denied' } });
    if (request.method() === 'POST') {
      const body = request.postDataJSON(), key = request.headers()['idempotency-key']; state.posts.push({ body, key });
      const old = state.items[0];
      state.items = [{ id: old?.id ?? key, adapter: 'bhpan', revision: (old?.revision ?? 0) + 1, state: 'ready', authorization_expires_at: body.until ?? old.authorization_expires_at, request_id: key ?? old.request_id, last_error: '' }];
      if (state.lose) { state.lose = false; return route.abort(); }
      return route.fulfill({ status: 202, json: state.items[0] });
    }
    if (url.pathname.includes('/requests/')) { state.lookups++; return route.fulfill({ json: state.items[0] }); }
    return route.fulfill({ json: { items: state.items, next_cursor: '' } });
  });
  await page.goto(`http://127.0.0.1:18787/storage-accounts?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { name: m.connect, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.CUSTODY_SCREENSHOTS) { fs.mkdirSync(process.env.CUSTODY_SCREENSHOTS,{recursive:true}); await page.screenshot({path:path.join(process.env.CUSTODY_SCREENSHOTS,`web-${info.project.name}.png`),fullPage:true}); }
  return { m, state, errors, messages };
}
async function fill(page, m) {
  await page.getByLabel(m.username, { exact: true }).fill('fixture-account');
  await page.getByLabel(m.password, { exact: true }).fill('test-only-password');
  await page.locator('input[type=datetime-local]').fill('2030-01-02T00:00');
}
test('custody requires consent, clears secrets and preserves the binding on renewal', async ({ page }, info) => {
  const { m, state, errors } = await setup(page, info);
  await fill(page, m); await page.getByRole('button', { name: m.submit, exact: true }).click(); expect(state.posts).toHaveLength(0);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: m.submit, exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('article')).toContainText(m.states.ready); await expect(page.getByLabel(m.password, { exact: true })).toHaveValue('');
  expect(state.posts[0].body.consent).toEqual({ accepted: true, version: 'custody-v1', digest: 'a'.repeat(64) });
  expect(state.posts[0].body).not.toHaveProperty('owner_domain'); expect(state.posts[0].body).not.toHaveProperty('root');
  const original = state.items[0].id;
  await page.locator('article').getByRole('button', { name: m.reauthorize, exact: true }).click();
  await fill(page, m); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: m.submit, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.ready); expect(state.posts).toHaveLength(2); expect(state.posts[1].body.revision).toBe(1); expect(state.items[0].id).toBe(original);
  expect(errors).toEqual([]);
});
test('uncertain custody submission recovers by ID without retaining or resending a password', async ({ page }, info) => {
  const { m, state, errors, messages } = await setup(page, info); state.lose = true;
  await fill(page, m); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: m.submit, exact: true }).click();
  await expect(page.getByRole('status')).toContainText(m.uncertain); await expect(page.getByLabel(m.password, { exact: true })).toHaveValue(''); await expect(page.getByRole('button', { name: m.submit, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: m.recover, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.ready); expect(state.posts).toHaveLength(1); expect(state.lookups).toBe(1);
  state.reject = 403; await page.getByRole('button', { name: m.refresh, exact: true }).click();
  await expect(page.getByRole('status')).toContainText(messages.contribution.errors.forbidden); await expect(page.locator('article')).toHaveCount(0); await expect(page.locator('input[type=password]')).toHaveCount(0); expect(errors).toEqual([]);
});

test('an existing blocked custody request resumes without new credentials', async ({ page }, info) => {
  const { m, state, errors } = await setup(page, info);
  const item = { id: '00000000-0000-4000-8000-000000000001', adapter: 'bhpan', revision: 1, state: 'blocked', authorization_expires_at: '2030-01-01T00:00:00Z', request_id: '00000000-0000-4000-8000-000000000002', last_error: 'result_unknown' };
  state.items = [item]; await page.getByRole('button', { name: m.refresh, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.blocked);
  await page.getByRole('button', { name: m.resume, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.ready);
  expect(state.posts).toHaveLength(1); expect(state.posts[0].body).toEqual({ request_id: item.request_id, revision: 1 }); expect(errors).toEqual([]);
});
