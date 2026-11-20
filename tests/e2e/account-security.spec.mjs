import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text);

// QQ binding server following the qq-binding contract.
function qq(page, initial = {}, login = 'unbound') {
  const state = { parts: { onebot: { bound: true, revision: 1 }, official: { bound: false, revision: 0 }, connect: { bound: false, revision: 0 }, ...initial }, writes: [], codeRequests: 0, login };
  const status = () => ({ complete: Object.values(state.parts).every((part) => part.bound), ...structuredClone(state.parts), qq_number: state.parts.onebot.bound ? '2840137956' : '', connect_login: state.login });
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
    if (path === '/codes') { state.codeRequests++; return route.fulfill({ json: { code: 'ABCDEFGHIJKLMNOP', copy_text: 'StuHelper/QQ-ABCDEFGHIJKLMNOP', bots: [{ platform: 'official', bot_id: '3889001', display_name: 'StuHelper' }], expires_at: new Date(Date.now() + 300_000).toISOString(), notice_key: 'qq_binding.only_own_code' } }); }
    if (path === '/connect/start') return route.fulfill({ json: { url: 'https://qq.example.invalid/authorize', expires_at: new Date(Date.now() + 300_000).toISOString() } });
    if (path === '/connect/confirm') { state.parts.connect = { bound: true, revision: 1 }; state.login = 'linked'; return route.fulfill({ json: status() }); }
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
  await expect(page.getByLabel(q.codeLabel)).toHaveText('StuHelper/QQ-ABCDEFGHIJKLMNOP');
  await expect(page.getByText(fill(q.sendTo, { bots: 'StuHelper' }))).toBeVisible();
  await expect(page.getByText(q.ownCodeOnly)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
  expect(state.writes[0]).toMatchObject({ path: '/codes', body: { kind: 'official' } });
  // QQ returns to the registered /me/qq/callback page, which confirms the binding once.
  await page.route('https://qq.example.invalid/authorize', route => route.fulfill({
    status: 302, headers: { location: `${base}/me/qq/callback?state=s1&code=c1` },
  }));
  await page.getByRole('button', { name: fill(q.bindPart, { part: q.parts.connect.title }) }).click();
  await expect(page.getByText(q.callback.bound)).toBeVisible();
  await expect(page).not.toHaveURL(/code=/);
  expect(state.writes.at(-2)).toMatchObject({ path: '/connect/start', body: {} });
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

test('a lost QQ confirmation retries the original callback without returning its code to the address', async ({ page }, info) => {
  const all = catalogue(info);
  const state = qq(page), calls = [];
  await page.route('**/api/v1/qq-binding/connect/confirm', route => {
    calls.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    return calls.length === 1 ? route.abort() : route.fallback();
  });
  await page.goto(`${base}/me/qq/callback?state=fixture-state&code=fixture-code&lang=${info.project.metadata.locale}`);
  const retry = page.getByRole('button', { name: all.common.retryOriginal, exact: true });
  await expect(retry).toBeVisible();
  expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  await page.getByRole('link', { name: all.qq.callback.back, exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: all.common.cancel, exact: true }).click();
  await retry.click();
  await expect(page.getByText(all.qq.callback.bound, { exact: true })).toBeVisible();
  expect(state.parts.connect).toEqual({ bound: true, revision: 1 });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({ key: expect.any(String), body: { state: 'fixture-state', code: 'fixture-code' } });
  expect(calls[1]).toEqual(calls[0]);
});

test('only the QQ Connect part opens when it alone is switched on, and QQ errors are explained', async ({ page }, info) => {
  const q = catalogue(info).qq, state = qq(page, { onebot: { bound: false, revision: 0 } }, 'reauthorize');
  await closure(page);
  await page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities: ['qq-binding.manage', 'qq-binding.connect'] } }));
  // QQ reports 100048 when the app lacks UnionID access: the attempt is closed and named.
  await page.goto(`${base}/me/qq/callback?state=s3&error=100048&lang=${info.project.metadata.locale}`);
  await expect(page.getByText(q.errors.unionid_permission_required)).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/connect/cancel', body: { state: 's3' } });
  // A repeated state is an invalid callback and is never sent.
  const sent = state.writes.length;
  await page.goto(`${base}/me/qq/callback?state=a&state=b&code=c&lang=${info.project.metadata.locale}`);
  await expect(page.getByText(q.errors.invalid_state)).toBeVisible();
  expect(state.writes.length).toBe(sent);
  state.writes.length = 0;
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const section = page.locator('[aria-labelledby="qq-title"]');
  // Someone who already signs in with QQ is told that one more authorization completes the binding.
  await expect(section.getByText(q.login.reauthorize)).toBeVisible();
  for (const kind of ['onebot', 'official']) {
    const row = section.locator('.group-row').filter({ hasText: q.parts[kind].title });
    await expect(row.getByText(q.notOpen, { exact: true })).toBeVisible();
    await expect(row.getByRole('button')).toHaveCount(0);
  }
  const connect = section.locator('.group-row').filter({ hasText: q.parts.connect.title });
  await expect(connect.getByRole('button', { name: fill(q.bindPart, { part: q.parts.connect.title }) })).toBeVisible();
  expect(state.writes).toEqual([]);
});
