import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { demo } from './demo-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';
import { memberTest as test, expect } from '../session-fixture.mjs';

const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const base = 'http://127.0.0.1:18787';
const push = (page, path) => page.evaluate((to) => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(to), path);

test('verification routes reused by the router show their own flow in both directions', async ({ page }, info) => {
  const all = catalogue(info), m = all.verification, locale = info.project.metadata.locale;
  await demo(page);
  await page.goto(`${base}/me/verification?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: m.title, exact: true })).toBeVisible();
  await push(page, `/me/account/identity?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: m.identityTitle, exact: true })).toBeVisible();
  await expect(page.getByText(m.stage, { exact: true })).toHaveCount(0);
  await push(page, `/me/verification?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: m.title, exact: true })).toBeVisible();
  await expect(page.getByText(m.method, { exact: true }).first()).toBeVisible();
});

test('a successful vote retry shows the result the first attempt lost', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await academicFixture(page);
  let posts = 0;
  const review = { id: 'review', root_id: 'review', kind: 'course', school_id: 'school', target_id: 'course', term_id: 'fall', title: 'Review', body: 'Content', ratings: [3, 3, 3, 3, 3], author: { anonymous: true, handle: 'anonymous' }, revision: 1, published_at: '2026-10-31T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: false, state: 'published', can_edit: false };
  await page.route('**/api/v1/reviews/review', (route) => route.fulfill({ json: review }));
  await page.route('**/api/v1/reviews/review/actions', (route) => {
    posts += 1;
    Object.assign(review, { upvotes: 1, my_vote: 1, revision: 2 });
    return posts === 1 ? route.abort() : route.fulfill({ json: { id: 'review', state: 'published', revision: 2 } });
  });
  await page.goto(`${base}/reviews/review?lang=${locale}`);
  const vote = page.locator('#review-review .review-actions button').first();
  await vote.click();
  await page.getByRole('button', { name: all.common.retryOriginal ?? all.common.retry, exact: true }).click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  expect(posts).toBe(2);
});

test('switching the edited resource loads and saves the object named by the address', async ({ page }, info) => {
  const m = catalogue(info).resources, locale = info.project.metadata.locale, state = fixture(), puts = [];
  await routes(page, state);
  await page.route('**/api/v1/resources/items/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') { puts.push(id); return route.fallback(); }
    if (route.request().method() !== 'GET') return route.fallback();
    const version = { ...state.version, metadata: { ...state.metadata, title: `Title ${id}` } };
    return route.fulfill({ json: { ...state.resource, id, current: version, proposal: version } });
  });
  await page.goto(`${base}/resources/items/A/edit?lang=${locale}`);
  await page.locator('.stepper button').first().click();
  const title = page.getByLabel(m.editor.title, { exact: true });
  await expect(title).toHaveValue('Title A');
  await push(page, `/resources/items/B/edit?lang=${locale}`);
  await page.locator('.stepper button').first().click();
  await expect(page.getByLabel(m.editor.title, { exact: true })).toHaveValue('Title B');
  expect(puts).toEqual([]);
});

test('a configured choice field shows its saved option and accepts a new one', async ({ page }, info) => {
  const locale = info.project.metadata.locale, state = fixture();
  state.category.fields = [{ key: 'kind', names: { 'zh-CN': 'Kind', 'en-US': 'Kind' }, kind: 'choice', required: true, filterable: false, groupable: false, options: [{ id: 'a', names: { 'zh-CN': 'Option A', 'en-US': 'Option A' } }, { id: 'b', names: { 'zh-CN': 'Option B', 'en-US': 'Option B' } }] }];
  state.category.group_by = '';
  Object.assign(state.metadata, { attributes: { kind: { option: 'a' } } });
  await routes(page, state);
  await page.goto(`${base}/resources/items/${encodeURIComponent(state.resource.id)}/edit?lang=${locale}`);
  await page.locator('.stepper button').first().click();
  const select = page.getByRole('combobox', { name: 'Kind' }).or(page.locator('.field', { hasText: 'Kind' }).getByRole('combobox'));
  await expect(select.first()).toContainText('Option A');
  await select.first().click();
  await page.getByRole('option', { name: 'Option B', exact: true }).click();
  await expect(select.first()).toContainText('Option B');
  await expect(page.locator('.field', { hasText: 'Kind' }).locator('input.app-proxy')).toHaveValue('b');
});

test('an expired qualification keeps own records open and closes public content', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await demo(page);
  await page.route('**/api/v1/verification/summary', (route) => route.fulfill({ json: { campus_eligibility: false, teacher_verified: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null } }));
  await page.route('**/api/v1/verification/credentials*', (route) => route.fulfill({ json: [{ id: 'credential', school_id: 'school', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'expired', student_display: '2026****01', revision: 1, verified_at: '2026-10-01T00:00:00Z', expires_at: null }] }));
  await page.goto(`${base}/me/reviews?lang=${locale}`);
  await expect(page.getByRole('tab', { name: all.me.reviewTabs.entries, exact: true })).toBeVisible();
  await page.goto(`${base}/courses?lang=${locale}`);
  await expect(page.getByRole('main').getByText(all.gate.expired.action, { exact: true })).toBeVisible();
});

test('switching the review tab asks before discarding an edited draft', async ({ page }, info) => {
  const all = catalogue(info), locale = info.project.metadata.locale;
  await academicFixture(page);
  const draft = { id: 'draft', revision: 1, input: { kind: 'course', target_id: 'course', term_id: 'fall', teacher_id: 'teacher-a', title: 'Saved title', body: 'Saved body', ratings: [3, 3, 3, 3, 3], signed: false }, expires_at: '2099-01-01T00:00:00Z', withdrawn: false, reference_ids: ['course'], reference_state: 'verified' };
  await page.route('**/api/v1/reviews/me/drafts?**', (route) => route.fulfill({ json: [draft] }));
  await page.route('**/api/v1/reviews/me/drafts/draft', (route) => route.fulfill({ json: draft }));
  await page.route('**/api/v1/reviews/me/references?**', (route) => route.fulfill({ json: { items: [{ id: 'course', kind: 'course', name: 'Test Course' }], missing_ids: [] } }));
  await page.goto(`${base}/me/reviews?tab=drafts&lang=${locale}`);
  await page.getByRole('button', { name: all.me.continueEditing, exact: true }).click();
  const title = page.getByLabel(all.academic.editor.title, { exact: true });
  await title.fill('Unsaved title');
  await page.getByRole('tab', { name: all.me.reviewTabs.entries, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: all.common.cancel, exact: true }).click();
  await expect(title).toHaveValue('Unsaved title');
  await expect(page).toHaveURL(/tab=drafts/);
});
