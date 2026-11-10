import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text);

// QQ binding server following the qq-binding contract.
function qq(page, initial = {}) {
  const state = { parts: { onebot: { bound: true, revision: 1 }, official: { bound: false, revision: 0 }, connect: { bound: false, revision: 0 }, ...initial }, writes: [], codeRequests: 0 };
  const status = () => ({ complete: Object.values(state.parts).every((part) => part.bound), ...structuredClone(state.parts), qq_number: state.parts.onebot.bound ? '2840137956' : '' });
  page.route('**/api/v1/qq-binding/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/qq-binding', '');
    if (request.method() === 'GET' && path === '/me') {
      // The bot reports the code shortly after it was generated.
      if (state.codeRequests && !state.parts.official.bound) state.parts.official = { bound: true, revision: 1 };
      return route.fulfill({ json: status() });
    }
    const body = request.postDataJSON();
    state.writes.push({ path, body, key: request.headers()['idempotency-key'] });
    if (path === '/codes') { state.codeRequests++; return route.fulfill({ json: { code: 'ABCDEFGHIJKLMNOP', expires_at: new Date(Date.now() + 300_000).toISOString(), notice_key: 'qq_binding.only_own_code' } }); }
    if (path === '/connect/start') return route.fulfill({ json: { url: `${base}/me/qq/callback?state=s1&code=c1`, expires_at: new Date(Date.now() + 300_000).toISOString() } });
    if (path === '/connect/confirm') { state.parts.connect = { bound: true, revision: 1 }; return route.fulfill({ json: status() }); }
    if (path === '/connect/cancel') return route.fulfill({ json: status() });
    const unlink = /^\/bindings\/(\w+)\/unlink$/.exec(path);
    if (unlink) { state.parts[unlink[1]] = { bound: false, revision: state.parts[unlink[1]].revision + 1 }; return route.fulfill({ json: status() }); }
    return route.fulfill({ status: 404, json: { code: 'qq_binding_not_found' } });
  });
  return state;
}
async function closure(page) {
  const state = { value: undefined };
  await page.route('**/api/v1/profiles/me/closure**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return state.value ? route.fulfill({ json: state.value }) : route.fulfill({ status: 404, json: { code: 'not_found' } });
    if (request.url().endsWith('/cancel')) { state.value = { ...state.value, state: 'cancelled', revision: 2 }; return route.fulfill({ json: state.value }); }
    expect(request.postDataJSON()).toEqual({ acknowledge_points_forfeiture: true });
    state.value = { id: '00000000-0000-4000-8000-0000000000c1', state: 'cooling', revision: 1, requested_at: '2026-11-08T00:00:00Z', cooling_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), completed_steps: [], blocker: '', points_policy: 'forfeit_all_points_and_pending_deductions', profile_id: '00000000-0000-4000-8000-000000000001' };
    return route.fulfill({ json: state.value });
  });
  return state;
}

test('QQ binding shows three parts and completes after the bot code and QQ Connect', async ({ page }, info) => {
  const all = catalogue(info), q = all.qq, state = qq(page);
  await closure(page);
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(q.progress, { done: '1', total: '3' }))).toBeVisible();
  await expect(page.getByText(q.requirement)).toBeVisible();
  await page.getByRole('button', { name: fill(q.bindPart, { part: q.parts.official.title }) }).click();
  await expect(page.getByLabel(q.codeLabel)).toHaveText('ABCDEFGHIJKLMNOP');
  await expect(page.getByText(q.ownCodeOnly)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
  expect(state.writes[0]).toMatchObject({ path: '/codes', body: { kind: 'official' } });
  await page.getByRole('button', { name: fill(q.bindPart, { part: q.parts.connect.title }) }).click();
  await expect(page.getByText(q.callback.bound)).toBeVisible();
  await expect(page).not.toHaveURL(/code=/);
  expect(state.writes.at(-1)).toMatchObject({ path: '/connect/confirm', body: { state: 's1', code: 'c1' } });
  await page.getByRole('link', { name: q.callback.back }).last().click();
  await expect(page.getByText(q.complete, { exact: true }).first()).toBeVisible();
});

test('declining QQ Connect cancels the state, and unbinding one part makes binding incomplete', async ({ page }, info) => {
  const all = catalogue(info), q = all.qq, state = qq(page, { official: { bound: true, revision: 1 }, connect: { bound: true, revision: 1 } });
  await closure(page);
  await page.goto(`${base}/me/qq/callback?state=s2&error=access_denied&lang=${info.project.metadata.locale}`);
  await expect(page.getByText(q.callback.declined)).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/connect/cancel', body: { state: 's2' } });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(q.complete, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: fill(q.unlinkPart, { part: q.parts.onebot.title }) }).click();
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText(q.unlinkWarning);
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: q.unlink, exact: true }).click();
  await expect(page.getByText(fill(q.progress, { done: '2', total: '3' }))).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/bindings/onebot/unlink', body: { revision: 1 } });
});

test('closure needs the points acknowledgement and the typed phrase, and can be cancelled while cooling', async ({ page }, info) => {
  const all = catalogue(info), c = all.security.closure;
  qq(page);
  const state = await closure(page);
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: c.request, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: c.submit });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel(fill(c.typeToConfirm, { phrase: c.phrase })).fill(c.phrase);
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox', { name: c.points }).check();
  await submit.click();
  await expect(page.getByRole('button', { name: c.cancel, exact: true })).toBeVisible();
  expect(state.value.state).toBe('cooling');
  await page.getByRole('button', { name: c.cancel, exact: true }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: c.cancel, exact: true }).click();
  await expect(page.getByRole('button', { name: c.request, exact: true })).toBeVisible();
});
