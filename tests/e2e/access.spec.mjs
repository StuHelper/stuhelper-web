import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';
import { expect, memberTest, test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const summary = (campus_eligibility) => ({ campus_eligibility, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null });
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
  await page.goto(`${base}/?lang=${locale}`);
  await expect(page.getByRole('heading', { name: all.home.myCourses, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Test Course', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: all.home.recent, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

memberTest('bookmark shows the stored state and can be removed in place', async ({ page }, info) => {
  const all = catalogue(info), posts = [];
  await academicFixture(page);
  await page.route('**/api/v1/reviews/me/bookmarks*', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: ['course'] });
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 'bookmark', state: 'saved', revision: 1 } });
  });
  await page.goto(`${base}/courses/course?lang=${info.project.metadata.locale}`);
  const button = page.getByRole('button', { name: all.academic.subject.saved, exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(page.getByRole('button', { name: all.academic.subject.bookmark, exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(posts).toEqual([{ target_id: 'course', set: false }]);
});

memberTest('resource search and filters survive a reload', async ({ page }, info) => {
  const all = catalogue(info), s = fixture();
  await routes(page, s);
  await page.goto(`${base}/resources?lang=${info.project.metadata.locale}`);
  await page.getByRole('searchbox').fill('notes');
  await page.getByRole('button', { name: all.resources.browse.find, exact: true }).click();
  await expect(page).toHaveURL(/q=notes/);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('notes');
  expect(s.calls.filter((call) => call.path === '' && call.query?.query === 'notes').length).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: all.resources.browse.find, exact: true })).toHaveCount(1);
});

memberTest('a failed list shows one page-level recovery action', async ({ page }, info) => {
  const all = catalogue(info), s = fixture();
  await routes(page, s);
  await page.route('**/api/v1/resources*', (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.goto(`${base}/resources?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('button', { name: all.resources.browse.reload, exact: true })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(1);
});

memberTest('my courses separates terms and keeps a data failure apart from having no courses', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await academicFixture(page);
  await page.goto(`${base}/me/courses?lang=${locale}`);
  await expect(page.getByRole('tab', { name: 'Spring semester', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Fall semester', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Teacher A', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Teacher B', exact: true })).toHaveCount(0);
  await page.route('**/api/v1/catalog/me/enrollments', (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.reload();
  await expect(page.getByRole('button', { name: all.courses.reload, exact: true })).toBeVisible();
  await expect(page.getByText(all.courses.empty, { exact: true })).toHaveCount(0);
});
