import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { member } from './demo-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const pendingSession = { authenticated: true, csrf_token: 'a'.repeat(43), expires_at: '2030-01-01T00:00:00Z', consent_required: true };
const doc = (id, version, extra = {}) => ({ version, digest: (id === 'terms' ? 'a' : 'b').repeat(63) + version.slice(-1), url: `https://stuhelper.com/legal/${id}/${version}`, required: true, ...extra });
const receipt = { accepted_at: '2026-11-01T08:00:00Z', source: 'registration', request_id: '0'.repeat(32) };

// A consent server: the session stays minimal until both documents are accepted.
function consentServer(page, documents) {
  const state = { documents: structuredClone(documents), posts: [], conflictOnce: undefined };
  const status = () => ({ required: Object.values(state.documents).some((row) => row.required), documents: state.documents });
  page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: status().required ? pendingSession : member }));
  page.route('**/api/v1/auth/consent', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: status() });
    const body = request.postDataJSON();
    state.posts.push({ body, csrf: request.headers()['x-csrf-token'] });
    if (state.conflictOnce === body.document_id) {
      state.conflictOnce = undefined;
      state.documents[body.document_id] = doc(body.document_id, 'v3');
      return route.fulfill({ status: 409, json: { code: 'consent_version_changed' } });
    }
    const current = state.documents[body.document_id];
    if (current.version !== body.version || current.digest !== body.digest) return route.fulfill({ status: 409, json: { code: 'consent_version_changed' } });
    state.documents[body.document_id] = { ...current, required: false, receipt: { ...receipt, source: 'version_update' } };
    return route.fulfill({ json: status() });
  });
  return state;
}

test('a page that needs an account asks for each document separately and continues after acceptance', async ({ page }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  const server = consentServer(page, { terms: doc('terms', 'v1'), privacy: doc('privacy', 'v1') });
  await page.goto(`${base}/me/favorites?lang=${locale}`);
  const title = page.getByRole('heading', { name: c.consent.title, exact: true });
  await expect(title).toBeVisible();
  const terms = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.terms) });
  const privacy = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.privacy) });
  // Nothing is ticked in advance, and one box alone is not enough.
  await expect(terms).not.toBeChecked();
  await expect(privacy).not.toBeChecked();
  const submit = page.getByRole('button', { name: c.consent.submit, exact: true });
  await expect(submit).toBeDisabled();
  await terms.check();
  await expect(submit).toBeDisabled();
  await privacy.check();
  await expect(page.getByRole('link', { name: c.consent.read.replace('{name}', c.consent.documents.terms) })).toHaveAttribute('href', 'https://stuhelper.com/legal/terms/v1');
  await submit.click();
  await expect(title).toHaveCount(0);
  expect(server.posts.map((row) => row.body)).toEqual([
    { document_id: 'terms', accepted: true, version: 'v1', digest: doc('terms', 'v1').digest },
    { document_id: 'privacy', accepted: true, version: 'v1', digest: doc('privacy', 'v1').digest },
  ]);
});

test('an update during acceptance clears only the changed document', async ({ page }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  const server = consentServer(page, { terms: doc('terms', 'v1'), privacy: doc('privacy', 'v1') });
  server.conflictOnce = 'terms';
  await page.goto(`${base}/me/favorites?lang=${locale}`);
  const terms = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.terms) });
  const privacy = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.privacy) });
  await terms.check();
  await privacy.check();
  await page.getByRole('button', { name: c.consent.submit, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: c.consent.changed })).toBeVisible();
  await expect(terms).not.toBeChecked();
  await expect(privacy).toBeChecked();
  await expect(page.getByText(c.consent.version.replace('{version}', '\u2066v3\u2069'), { exact: true })).toBeVisible();
  await terms.check();
  await page.getByRole('button', { name: c.consent.submit, exact: true }).click();
  await expect(page.getByRole('heading', { name: c.consent.title, exact: true })).toHaveCount(0);
  expect(server.posts.at(-2).body).toMatchObject({ document_id: 'terms', version: 'v3' });
  expect(server.posts.at(-1).body).toMatchObject({ document_id: 'privacy', version: 'v1' });
});

test('an updated version shows what was accepted before and keeps sign-out, closure and public pages open', async ({ page }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  consentServer(page, { terms: doc('terms', 'v2'), privacy: doc('privacy', 'v1', { required: false, receipt }) });
  await page.route('**/api/v1/profiles/me/closure', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.goto(`${base}/me/favorites?lang=${locale}`);
  await expect(page.getByText(c.consent.updated, { exact: true })).toBeVisible();
  // Only the updated document needs a tick; the other shows its earlier acceptance.
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('button', { name: c.account.menu.signOut, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: c.security.closure.request, exact: true })).toBeVisible();
  // Public pages stay readable; the account menu leads back to the consent page.
  await page.goto(`${base}/?lang=${locale}`);
  await expect(page.getByRole('heading', { name: c.consent.title, exact: true })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: c.consent.menu, exact: true }).click();
  await expect(page).toHaveURL(/\/consent\?/);
  await expect(page.getByRole('heading', { name: c.consent.title, exact: true })).toBeVisible();
});
