import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const challengeId = 'c'.repeat(43);

// Phone endpoints following the session contract. `answers` lets a test script failures.
async function phoneServer(page, answers = {}) {
  const state = { bound: true, masked: '****1234', calls: [] };
  await page.route('**/api/v1/auth/phone**', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const call = { method: request.method(), path: url.pathname, body: request.postDataJSON?.() ?? null, key: request.headers()['idempotency-key'], url: request.url() };
    state.calls.push(call);
    const scripted = answers[`${call.method} ${call.path}`]?.shift();
    if (scripted) return route.fulfill(scripted);
    if (call.method === 'GET') return route.fulfill({ json: { bound: state.bound, masked_phone: state.bound ? state.masked : null } });
    if (call.path.endsWith('/code')) return route.fulfill({ json: { challenge_id: challengeId, expires_at: new Date(Date.now() + 300_000).toISOString() } });
    if (call.path.endsWith('/change')) { state.bound = true; state.masked = `****${call.body.phone.slice(-4)}`; return route.fulfill({ json: { bound: true, masked_phone: state.masked } }); }
    if (call.method === 'DELETE') { state.bound = false; return route.fulfill({ json: { bound: false, masked_phone: null } }); }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return state;
}

test('changing the number sends a code to the new number, keeps the number after a wrong code and shows the new masked number', async ({ page }, info) => {
  const c = catalogue(info), p = c.phone;
  const state = await phoneServer(page, { 'POST /api/v1/auth/phone/change': [{ status: 422, json: { code: 'phone_code_invalid' } }] });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const row = page.locator('.group-row').filter({ hasText: c.security.phone });
  await expect(row.getByText(c.security.phoneBoundMasked.replace('{phone}', '****1234'))).toBeVisible();
  await row.getByRole('button', { name: p.change, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(p.newNumber).fill('13800138000');
  await dialog.getByRole('button', { name: p.sendCode }).click();
  await expect(dialog.getByText(p.sent)).toBeVisible();
  await expect(dialog.getByRole('button', { name: new RegExp(p.resendIn.split('{seconds}')[0].trim() || p.resendIn.split('{seconds}')[1].trim()) })).toBeDisabled();
  await dialog.getByLabel(p.code).fill('111111');
  await dialog.getByRole('button', { name: p.confirm }).click();
  await expect(dialog.getByText(c.errors.phone_code_invalid)).toBeVisible();
  await expect(dialog.getByLabel(p.newNumber)).toHaveValue('13800138000');
  await dialog.getByLabel(p.code).fill('222222');
  await dialog.getByRole('button', { name: p.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText(c.security.phoneBoundMasked.replace('{phone}', '****8000'))).toBeVisible();
  const changes = state.calls.filter((call) => call.path.endsWith('/change'));
  expect(changes.map((call) => call.body)).toEqual([{ phone: '13800138000', challenge_id: challengeId, code: '111111' }, { phone: '13800138000', challenge_id: challengeId, code: '222222' }]);
  // A corrected code is a new submission with its own key; codes never appear in an address.
  expect(changes[0].key).toBeTruthy();
  expect(changes[0].key).not.toBe(changes[1].key);
  expect(state.calls.some((call) => /111111|222222/.test(call.url))).toBe(false);
});

test('a change that needs a fresh sign-in goes to sign in and reopens the dialog on return', async ({ page }, info) => {
  const c = catalogue(info), p = c.phone;
  const visits = [];
  await phoneServer(page, { 'POST /api/v1/auth/phone/code': [{ status: 428, json: { code: 'recent_authentication_required', reauthentication_path: '/api/v1/auth/phone/reauthenticate' } }] });
  await page.route('**/api/v1/auth/phone/reauthenticate**', (route) => { visits.push(new URL(route.request().url())); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>sign in</p>' }); });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await page.locator('.group-row').filter({ hasText: c.security.phone }).getByRole('button', { name: p.change, exact: true }).click();
  await page.getByRole('dialog').getByLabel(p.newNumber).fill('13800138000');
  await page.getByRole('dialog').getByRole('button', { name: p.sendCode }).click();
  await expect.poll(() => visits.length).toBe(1);
  const back = new URL(visits[0].searchParams.get('return_to'));
  expect(back.pathname).toBe('/me/account');
  expect(back.searchParams.get('phone')).toBe('change');
  await page.goto(back.toString());
  await expect(page.getByRole('dialog').getByLabel(p.newNumber)).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('phone')).toBe(false);
});

test('removing the number explains why it is refused and removes it once allowed', async ({ page }, info) => {
  const c = catalogue(info), p = c.phone;
  const state = await phoneServer(page, { 'DELETE /api/v1/auth/phone': [{ status: 409, json: { code: 'phone_last_sign_in_method' } }] });
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const row = page.locator('.group-row').filter({ hasText: c.security.phone });
  await row.getByRole('button', { name: p.unbindLabel }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog).toContainText(p.unbindWarning);
  await dialog.getByRole('button', { name: p.unbind, exact: true }).click();
  await expect(dialog.getByText(c.errors.phone_last_sign_in_method)).toBeVisible();
  await dialog.getByRole('button', { name: p.unbind, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText(c.security.phoneMissing)).toBeVisible();
  await expect(row.getByRole('button', { name: p.bind, exact: true })).toBeVisible();
  expect(state.calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
});
