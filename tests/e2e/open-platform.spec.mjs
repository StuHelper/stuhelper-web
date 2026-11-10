import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const policy = { grant_seconds: 180 * 86400, token_seconds: 3600, daily_quota: 1000 };
const app = (values) => ({ id: 'app-1', name: 'Timetable widget', purpose: 'Shows the timetable.', redirect_uris: ['https://widget.example.invalid/cb'], requested_scopes: ['profile', 'schedule'], approved_scopes: ['profile', 'schedule'], client_type: 'confidential', state: 'active', note: '', revision: 2, credential_revision: 1, policy, created_at: '2026-10-01T00:00:00Z', ...values });

// Open-platform server following the contract. Writes are recorded with their idempotency keys.
async function platform(page) {
  const state = {
    apps: [app({})],
    grants: [{ id: 'grant-1', app_id: 'app-1', app_name: 'Timetable widget', subject: 'me', scopes: ['profile', 'schedule'], state: 'active', expires_at: '2027-01-01T00:00:00Z', revision: 4 }],
    notices: [{ id: 'notice-1', app_id: 'app-1', subject: 'user-1', scopes: ['schedule'], reason: 'user_revoked', created_at: '2026-11-01T00:00:00Z', sequence: 1 }],
    writes: [],
    credentialKeys: new Set(),
  };
  await page.route('**/api/v1/open-platform/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/open-platform', '');
    if (request.method() === 'GET') {
      if (path === '/apps') return route.fulfill({ json: { items: state.apps } });
      if (path === '/grants') return route.fulfill({ json: { items: state.grants } });
      if (path === '/apps/app-1/notices') return route.fulfill({ json: { items: state.notices } });
      return route.fulfill({ status: 404, json: { code: 'not_found' } });
    }
    const body = request.postDataJSON();
    const key = request.headers()['idempotency-key'];
    state.writes.push({ path, body, key });
    if (path === '/grants/grant-1/revoke') {
      const scopes = state.grants[0].scopes.filter((scope) => !body.scopes.includes(scope));
      state.grants = [{ ...state.grants[0], scopes, revision: 5, state: scopes.length ? 'active' : 'revoked' }];
      return route.fulfill({ json: state.grants[0] });
    }
    if (path === '/apps') {
      const created = app({ id: 'app-2', name: body.name, purpose: body.purpose, redirect_uris: body.redirect_uris, requested_scopes: body.requested_scopes, approved_scopes: [], client_type: body.client_type, state: 'pending', revision: 1, credential_revision: 0 });
      state.apps = [created, ...state.apps];
      return route.fulfill({ json: created });
    }
    if (path === '/apps/app-1/credential') {
      const first = !state.credentialKeys.has(key);
      state.credentialKeys.add(key);
      return route.fulfill({ json: { app_id: 'app-1', revision: 2, retrievable: first, ...(first ? { client_secret: 'opsecret_fixture' } : {}) } });
    }
    if (path === '/apps/app-1/notices/notice-1/ack') {
      state.notices = [{ ...state.notices[0], acknowledgement: body.status, note: body.note, acknowledged_at: '2026-11-08T00:00:00Z' }];
      return route.fulfill({ json: state.notices[0] });
    }
    if (path === '/consents') return route.fulfill({ json: { id: 'consent-1', application: app({}), requested_scopes: body.scope, redirect_uri: body.redirect_uri, expires_at: '2030-01-01T00:00:00Z', qq_tiers: [] } });
    if (path === '/consents/consent-1/decision') return route.fulfill({ json: { redirect_uri: `${base}/oauth-landing?${body.decision === 'approve' ? 'code=c1' : 'error=access_denied'}&state=s1` } });
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return state;
}

test('withdrawing one scope keeps the rest of the grant', async ({ page }, info) => {
  const all = catalogue(info), p = all.platform, state = await platform(page);
  await page.goto(`${base}/me/apps?lang=${info.project.metadata.locale}`);
  await expect(page.getByText('Timetable widget', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: p.grants.revoke, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(p.grants.revokeAllNotice, { exact: true })).toBeVisible();
  await dialog.getByRole('checkbox', { name: new RegExp(p.scopes.profile.title) }).uncheck();
  await expect(dialog.getByText(p.grants.revokeAllNotice, { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: p.grants.revokeSubmit, exact: true }).click();
  await expect(page.getByText(fill(p.grants.revokedSome, { name: 'Timetable widget' }), { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/grants/grant-1/revoke', body: { revision: 4, scopes: ['schedule'] }, key: expect.any(String) }]);
  await expect(page.getByRole('list', { name: p.grants.scopes }).getByText(p.scopes.schedule.title, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: p.grants.scopes }).getByText(p.scopes.profile.title, { exact: true })).toBeVisible();
});

test('a new application checks redirect addresses and is submitted for review', async ({ page }, info) => {
  const all = catalogue(info), d = all.platform.developer, state = await platform(page);
  await page.goto(`${base}/me/developer?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: d.create, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(d.name, { exact: true }).fill('Review exporter');
  await dialog.getByLabel(d.purpose, { exact: true }).fill('Exports public reviews to a table.');
  await dialog.getByLabel(d.redirects, { exact: true }).fill('http://export.example.invalid/cb');
  await expect(dialog.getByText(d.redirectProblem.https, { exact: true })).toBeVisible();
  await dialog.getByLabel(d.redirects, { exact: true }).fill('https://export.example.invalid/cb');
  await dialog.getByRole('radio', { name: new RegExp(d.clientTypes.public.title) }).check();
  await dialog.getByRole('checkbox', { name: new RegExp(all.platform.scopes.public_reviews.title) }).check();
  await dialog.getByRole('button', { name: d.submit, exact: true }).click();
  await expect(page.getByText(fill(d.submitted, { name: 'Review exporter' }), { exact: true })).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/apps', body: { name: 'Review exporter', redirect_uris: ['https://export.example.invalid/cb'], requested_scopes: ['public_reviews'], client_type: 'public' } });
  expect(state.writes.at(-1).body).not.toHaveProperty('revision');
  await expect(page.getByText(d.state.pending, { exact: true })).toBeVisible();
});

test('a rotated secret is shown once and a withdrawal notice records the reported result', async ({ page }, info) => {
  const all = catalogue(info), d = all.platform.developer, state = await platform(page);
  await page.goto(`${base}/me/developer?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: d.rotate, exact: true }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: d.rotate, exact: true }).click();
  await expect(page.getByText('opsecret_fixture', { exact: true })).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/apps/app-1/credential', body: { revision: 1 } });
  await page.getByRole('button', { name: d.secretSaved, exact: true }).click();
  await expect(page.getByText('opsecret_fixture', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: d.notices.open, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(d.notices.reason.user_revoked, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: d.notices.answer, exact: true }).click();
  await dialog.getByRole('radio', { name: d.notices.status.retention_exception, exact: true }).check();
  await expect(dialog.getByRole('button', { name: d.notices.send, exact: true })).toBeDisabled();
  await dialog.getByLabel(d.notices.retentionReason, { exact: true }).fill('Tax records kept for five years.');
  await dialog.getByRole('button', { name: d.notices.send, exact: true }).click();
  await expect(dialog.getByText(d.notices.status.retention_exception, { exact: true })).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/apps/app-1/notices/notice-1/ack', body: { status: 'retention_exception', note: 'Tax records kept for five years.' } });
});

test('consent requires an explicit choice and returns to the application with the selected scopes', async ({ page }, info) => {
  const all = catalogue(info), c = all.platform.consent, state = await platform(page);
  await page.route('**/oauth-landing**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>landing</p>' }));
  await page.goto(`${base}/oauth/authorize?response_type=code&client_id=app-1&redirect_uri=${encodeURIComponent('https://widget.example.invalid/cb')}&scope=profile%20schedule&state=s1&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256&lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { name: fill(c.heading, { name: 'Timetable widget' }) })).toBeVisible();
  const approve = page.getByRole('button', { name: new RegExp(c.approve.split('{')[0].trim().replace(/[()（]/g, '')) });
  await expect(approve).toBeDisabled();
  await page.getByRole('checkbox', { name: new RegExp(all.platform.scopes.schedule.title) }).check();
  await approve.click();
  await expect(page).toHaveURL(/oauth-landing\?code=c1&state=s1/);
  expect(state.writes[0]).toMatchObject({ path: '/consents', body: { client_id: 'app-1', scope: ['profile', 'schedule'], state: 's1', code_challenge_method: 'S256' } });
  expect(state.writes[1]).toMatchObject({ path: '/consents/consent-1/decision', body: { decision: 'approve', scopes: ['schedule'] } });
});

test('an incomplete authorization link is rejected without contacting the server', async ({ page }, info) => {
  const c = catalogue(info).platform.consent, state = await platform(page);
  await page.goto(`${base}/oauth/authorize?response_type=code&client_id=app-1&scope=profile&state=s1&lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('alert')).toContainText(c.invalid);
  expect(state.writes).toEqual([]);
});
