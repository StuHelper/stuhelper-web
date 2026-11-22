import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { member } from './demo-fixture.mjs';
import { legalPath, publishedDocument } from './legal-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const pendingSession = { authenticated: true, csrf_token: 'a'.repeat(43), expires_at: '2030-01-01T00:00:00Z', consent_required: true };
const publication = (id, version) => publishedDocument(id, version, { body: `<p>演示正文 · ${version}</p>` });
const doc = (id, version, extra = {}) => ({ version, digest: publication(id, version).digest, url: `${base}/legal/${id}/versions/${version}`, required: true, ...extra });
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

test('a page that needs an account asks for each document separately and continues after acceptance', async ({ page, context }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  const server = consentServer(page, { terms: doc('terms', 'v1'), privacy: doc('privacy', 'v1') });
  const termsPublication = publication('terms', 'v1');
  await context.route('**/api/v1/auth/session', (route) => route.fulfill({ json: pendingSession }));
  await context.route(`**${legalPath}/terms/versions/v1`, (route) => route.fulfill({ json: termsPublication }));
  await page.goto(`${base}/me/favorites?lang=${locale}`);
  const title = page.getByRole('heading', { name: c.consent.title, exact: true });
  await expect(title).toBeVisible();
  const terms = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.terms) });
  const privacy = page.getByRole('checkbox', { name: c.consent.agree.replace('{name}', c.consent.documents.privacy) });
  // Nothing is ticked in advance, and one box alone is not enough.
  await expect(terms).not.toBeChecked();
  await expect(privacy).not.toBeChecked();
  const termsLink = page.getByRole('link', { name: c.consent.read.replace('{name}', c.consent.documents.terms) });
  await expect(termsLink).toHaveAttribute('href', `${base}/legal/terms/versions/v1`);
  const opening = context.waitForEvent('page');
  await termsLink.click();
  const publishedPage = await opening;
  await expect(publishedPage.getByRole('heading', { level: 1, name: termsPublication.title })).toBeVisible();
  await expect(publishedPage.getByRole('main').getByText('演示正文 · v1')).toBeVisible();
  await publishedPage.close();
  expect(server.posts).toEqual([]);
  const submit = page.getByRole('button', { name: c.consent.submit, exact: true });
  await expect(submit).toBeDisabled();
  await terms.check();
  await expect(submit).toBeDisabled();
  await privacy.check();
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

test('an updated version shows what was accepted before and keeps sign-out, closure and public pages open', async ({ page, isMobile }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  consentServer(page, { terms: doc('terms', 'v2'), privacy: doc('privacy', 'v1', { required: false, receipt }) });
  await page.route('**/api/v1/profiles/me/closure', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  const favoritesURL = `${base}/me/favorites?lang=${locale}`;
  await page.goto(favoritesURL);
  await expect(page.getByText(c.consent.updated, { exact: true })).toBeVisible();
  // Only the updated document needs a tick; the other shows its earlier acceptance.
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('button', { name: c.account.menu.signOut, exact: true })).toBeVisible();
  const closureButton = page.getByRole('button', { name: c.security.closure.request, exact: true });
  const closurePanel = page.getByRole('dialog', { name: c.security.closure.request, exact: true });
  for (const colorScheme of isMobile ? ['light', 'dark'] : ['light']) {
    await test.step(`open the account closure panel in ${colorScheme} mode`, async () => {
      await page.emulateMedia({ colorScheme });
      await closureButton.scrollIntoViewIfNeeded();
      if (isMobile) {
        // A button inside the viewport can still sit behind the fixed navigation.
        const center = await closureButton.evaluate(button => {
          button.scrollIntoView({ block: 'center', behavior: 'instant' });
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x: x + width / 2, y: y + height / 2 };
        });
        await page.touchscreen.tap(center.x, center.y);
      } else {
        await closureButton.click();
      }
      await expect(closurePanel).toBeVisible();
      await expect(page).toHaveURL(favoritesURL);
      await closurePanel.getByRole('button', { name: c.common.close, exact: true }).click();
      await expect(closurePanel).toBeHidden();
    });
  }
  // Public pages stay readable; the account menu leads back to the consent page.
  await page.goto(`${base}/?lang=${locale}`);
  await expect(page.getByRole('heading', { name: c.consent.title, exact: true })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: c.consent.menu, exact: true }).click();
  await expect(page).toHaveURL(/\/consent\?/);
  await expect(page.getByRole('heading', { name: c.consent.title, exact: true })).toBeVisible();
});

test('the personal center opens consent records, legal documents and account closure', async ({ page, isMobile }, info) => {
  const c = catalogue(info), locale = info.project.metadata.locale;
  const documents = {
    terms: doc('terms', 'v1', { required: false, receipt }),
    privacy: doc('privacy', 'v2', { required: false, receipt }),
  };
  consentServer(page, documents);
  await page.goto(`/me?lang=${locale}`);
  const menu = isMobile
    ? page.getByRole('region', { name: c.me.groups.account, exact: true })
    : page.getByRole('navigation', { name: c.me.title, exact: true });
  const entry = menu.locator('a[href="/me/privacy"]');
  await expect(entry).toContainText(c.privacy.title);
  await entry.click();
  await expect(page.getByRole('heading', { name: c.privacy.title, exact: true })).toBeVisible();
  const agreements = page.getByRole('region', { name: c.privacy.agreements });
  const time = await page.evaluate(({ locale, accepted }) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory', timeZone: 'Asia/Shanghai',
  }).format(new Date(accepted)), { locale, accepted: receipt.accepted_at });
  for (const [id, current] of Object.entries(documents)) {
    const row = agreements.getByRole('listitem').filter({ hasText: c.consent.documents[id] });
    await expect(row).toContainText(c.privacy.acceptedVersion.replace('{version}', `\u2066${current.version}\u2069`).replace('{time}', time));
    await expect(row.getByRole('link', { name: c.privacy.read })).toHaveAttribute('href', current.url);
  }
  const links = page.getByRole('region', { name: c.privacy.documents, exact: true });
  for (const [slug, name] of [['terms', c.consent.documents.terms], ['privacy', c.consent.documents.privacy], ['email-transfer', c.privacy.transferDocument]]) {
    await expect(links.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/legal/${slug}`);
  }
  await expect(page.getByText(c.verification.transfer.notAccepted, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (process.env.PRIVACYUI_SHOTS) await page.screenshot({ path: path.join(process.env.PRIVACYUI_SHOTS, `${info.project.name}-privacy.png`), fullPage: true });
  await agreements.getByRole('link', { name: c.privacy.closure }).click();
  await expect(page).toHaveURL(/\/me\/account#security-closure$/);
  await expect(page.getByRole('heading', { name: c.security.closure.title, exact: true })).toBeVisible();
});

test('a failed agreement lookup retries and shows a newly pending version', async ({ page }, info) => {
  const c = catalogue(info);
  let reads = 0;
  await page.route('**/api/v1/auth/consent', route => ++reads === 1
    ? route.fulfill({ status: 503, json: { code: 'dependency_unavailable' } })
    : route.fulfill({ json: { required: true, documents: {
      terms: doc('terms', 'v2'), privacy: doc('privacy', 'v1', { required: false, receipt }),
    } } }));
  await page.goto(`/me/privacy?lang=${info.project.metadata.locale}`);
  const agreements = page.getByRole('region', { name: c.privacy.agreements });
  await expect(agreements.getByRole('alert')).toContainText(c.errors.unavailable);
  await expect(page.getByText(c.verification.transfer.notAccepted, { exact: true })).toBeVisible();
  await agreements.getByRole('button', { name: c.common.retry }).click();
  await expect(agreements.getByText(c.privacy.pendingVersion.replace('{version}', '\u2066v2\u2069'), { exact: true })).toBeVisible();
  expect(reads).toBe(2);
});
