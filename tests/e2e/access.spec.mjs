import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';
import { expect, memberTest, test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const summary = (campus_eligibility) => ({ campus_eligibility, teacher_verified: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null });
// Business requests a closed page must never send.
function business(page) {
  const seen = [];
  page.on('request', (request) => { if (/\/api\/v1\/(catalog|reviews|resources)/.test(request.url())) seen.push(request.url()); });
  return seen;
}
async function verification(page, eligible, applications = [], credentials = []) {
  await page.route('**/api/v1/verification/summary', (route) => route.fulfill({ json: summary(eligible) }));
  await page.route('**/api/v1/verification/applications*', (route) => route.fulfill({ json: applications }));
  await page.route('**/api/v1/verification/credentials*', (route) => route.fulfill({ json: credentials }));
}
const application = (state) => ({ id: 'a1', school_id: 'school', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state, revision: 1, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z', expires_at: '2030-01-01T00:00:00Z', credential_id: '', result_code: '' });
const credential = (state) => ({ id: 'c1', school_id: 'school', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state, student_display: '2026****01', revision: 1, verified_at: '2026-10-01T00:00:00Z', expires_at: null });

test('a guest sees sign-in instead of content and sends no business request', async ({ page }, info) => {
  const all = catalogue(info), seen = business(page);
  await page.goto(`${base}/courses/course?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.gate.guest.title })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: all.gate.guest.action, exact: true })).toBeVisible();
  expect(seen).toEqual([]);
});

test('an account read failure keeps content closed and explains the retry', async ({ page }, info) => {
  const all = catalogue(info), seen = business(page);
  let healthy = false;
  await page.unroute('**/api/v1/auth/session');
  await page.route('**/api/v1/auth/session', (route) => (healthy ? route.fulfill({ status: 401, json: { code: 'unauthenticated' } }) : route.fulfill({ status: 503, json: { code: 'identity_unavailable' } })));
  await page.goto(`${base}/resources?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.gate.unavailable.title })).toBeVisible();
  expect(seen).toEqual([]);
  healthy = true;
  await page.getByRole('button', { name: all.gate.unavailable.action, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: all.gate.guest.title })).toBeVisible();
});

memberTest('each qualification state gets its own next step', async ({ page }, info) => {
  const all = catalogue(info), seen = business(page), url = `${base}/courses/course?lang=${info.project.metadata.locale}`;
  await verification(page, false);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: all.gate.unverified.title })).toBeVisible();
  await page.unroute('**/api/v1/verification/applications*');
  await page.route('**/api/v1/verification/applications*', (route) => route.fulfill({ json: [application('pending_review')] }));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: all.gate.processing.title })).toBeVisible();
  await page.unroute('**/api/v1/verification/applications*');
  await page.route('**/api/v1/verification/applications*', (route) => route.fulfill({ json: [] }));
  await page.unroute('**/api/v1/verification/credentials*');
  await page.route('**/api/v1/verification/credentials*', (route) => route.fulfill({ json: [credential('expired')] }));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: all.gate.expired.title })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: all.gate.expired.action, exact: true })).toHaveAttribute('href', /next=.*courses.*course/);
  expect(seen).toEqual([]);
});

memberTest('a verified user enters content; the home page becomes a workspace', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await academicFixture(page);
  await page.goto(`${base}/courses/course?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Test Course' })).toBeVisible();
  // "My courses" is switched off until the person consents to reading enrollment records.
  const enrollmentReads = [];
  page.on('request', (request) => { if (request.url().includes('/catalog/me/')) enrollmentReads.push(request.url()); });
  await page.goto(`${base}/campus?lang=${locale}`);
  await expect(page.getByRole('heading', { name: all.browse.recentlyViewed, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: all.home.myCourses, exact: true })).toHaveCount(0);
  expect(enrollmentReads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


memberTest('resource search and filters survive a reload', async ({ page }, info) => {
  const s = fixture();
  await routes(page, s);
  await page.goto(`${base}/resources?lang=${info.project.metadata.locale}`);
  // Typing searches after a short pause; there is no separate search button.
  await page.getByRole('searchbox').fill('notes');
  // The search stays in page state; the address shows only the page.
  await expect.poll(() => s.calls.some((call) => call.path === '' && call.query?.query === 'notes')).toBe(true);
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('notes');
  expect(s.calls.filter((call) => call.path === '' && call.query?.query === 'notes').length).toBeGreaterThan(1);
});

memberTest('a failed list shows one page-level recovery action', async ({ page }, info) => {
  const all = catalogue(info), s = fixture();
  await routes(page, s);
  await page.route('**/api/v1/resources*', (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.goto(`${base}/resources?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('button', { name: all.resources.browse.reload, exact: true })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(1);
});

memberTest('my courses stays off and reads no enrollment records without consent', async ({ page }, info) => {
  const locale = info.project.metadata.locale;
  await academicFixture(page);
  const enrollmentReads = [];
  page.on('request', (request) => { if (request.url().includes('/catalog/me/')) enrollmentReads.push(request.url()); });
  await page.goto(`${base}/me/courses?lang=${locale}`);
  await expect(page).toHaveURL(/\/me(\?|$)/);
  await expect(page.locator('a[href="/me/courses"]')).toHaveCount(0);
  expect(enrollmentReads).toEqual([]);
});

memberTest('identity page waits for the real state and only shows masked identity', async ({ page }, info) => {
  const all = catalogue(info), v = all.verification;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/v1/verification/**', (route) => route.fulfill({ json: [] }));
  await verification(page, true);
  await page.route('**/api/v1/verification/summary', async (route) => {
    await held;
    return route.fulfill({ json: { ...summary(true), identity_verified: true, identity_masked: { name: '*航', document_number: '1****************8', document_type: 'cn_resident_id_card' } } });
  });
  await page.goto(`${base}/me/account/identity?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1, name: v.identityTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name: v.start })).toHaveCount(0);
  await expect(page.getByText(v.identityMissing, { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText(v.identityVerified, { exact: true })).toBeVisible();
  await expect(page.getByText('*航', { exact: true })).toBeVisible();
  await expect(page.getByText('1****************8', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: v.start })).toHaveCount(0);
});

memberTest('the account page shows the masked phone number and offers a retry when it cannot be read', async ({ page }, info) => {
  const all = catalogue(info);
  let fail = true;
  await page.route('**/api/v1/auth/phone', (route) => (fail ? route.fulfill({ status: 503, json: { code: 'unavailable' } }) : route.fulfill({ json: { bound: true, masked_phone: '138****1234' } })));
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const row = page.locator('.group-row').filter({ hasText: all.security.phone });
  await expect(row.getByRole('button', { name: all.common.retry })).toBeVisible();
  fail = false;
  await row.getByRole('button', { name: all.common.retry }).click();
  await expect(row.getByText(all.security.phoneBoundMasked.replace('{phone}', '138****1234'))).toBeVisible();
});

memberTest('the account page only says the identity is verified; the masked details open with View', async ({ page }, info) => {
  const all = catalogue(info);
  await page.route('**/api/v1/verification/**', (route) => route.fulfill({ json: [] }));
  await verification(page, true);
  await page.route('**/api/v1/verification/summary', (route) => route.fulfill({ json: { ...summary(true), identity_verified: true, identity_masked: { name: '*航', document_number: '1****************8', document_type: 'cn_resident_id_card' } } }));
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const row = page.locator('.group-row').filter({ hasText: all.security.realName });
  await expect(row.getByText(all.security.realNameDone, { exact: true })).toBeVisible();
  await expect(page.getByText('*航')).toHaveCount(0);
  await expect(page.getByText('1****************8')).toHaveCount(0);
  await row.getByRole('link', { name: all.security.view }).click();
  await expect(page.getByText('*航', { exact: true })).toBeVisible();
  await expect(page.getByText(all.verification.identityNumber, { exact: true })).toBeVisible();
});
