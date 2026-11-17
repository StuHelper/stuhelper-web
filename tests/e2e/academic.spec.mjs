import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { expect, memberTest as test } from '../session-fixture.mjs';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const pick = (scope, value) => scope.locator(`label:has(input[value="${value}"])`).click();
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (/\[intlify\].*(Not found|Fall back)/i.test(e.text())) errors.push(e.text()); });
  return errors;
}

test('invisible course and discussion show the standard not-found state', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), errors = watch(page);
  await academicFixture(page, { courseMissing: true });
  for (const path of ['/courses/course', '/reviews/review']) {
    await page.goto(`http://127.0.0.1:18787${path}?lang=${locale}`);
    await expect(page.getByText(all.errors.not_found, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Test Course' })).toHaveCount(0);
    await expect(page.getByText('Useful course content.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: all.academic.subject.writeCourse, exact: true })).toHaveCount(0);
    await expect(page.locator('.discussion form')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('semester choices preserve the server order including summer', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic;
  await academicFixture(page);
  const terms = [
    ['fall-2026', '2026 Autumn', 20263], ['summer-2026', '2026 Summer', 20262],
    ['spring-2026', '2026 Spring', 20261], ['fall-2025', '2025 Autumn', 20253],
  ];
  await page.route('**/api/v1/catalog/objects?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('kind') !== 'term') return route.fallback();
    return route.fulfill({ json: { items: terms.map(([id, name, term_order_key]) => ({ id, name, term_order_key, kind: 'term', school_id: 'school', credits: null, aliases: [], revision: 1, updated_at: '2026-11-15T00:00:00Z' })), next: '' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form');
  const choices = editor.getByRole('group', { name: a.editor.term, exact: true });
  await expect(choices.locator('label')).toHaveText(terms.map((term) => term[1]));
});

test('course review offers teachers from the chosen semester enrollment and publishes once', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), a = all.academic, errors = watch(page), posts = [];
  await academicFixture(page);
  await page.route('**/api/v1/reviews', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    return posts.length === 1 ? route.abort() : route.fulfill({ json: { id: 'new-review', state: 'published', revision: 1 } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toBeVisible();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await pick(editor, 'spring');
  await expect(editor.getByRole('group', { name: a.editor.teacher, exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(editor.getByRole('group', { name: a.editor.teacher, exact: true }).locator('label')).toHaveText([a.review.noTeacher, 'Teacher B']);
  await pick(editor, 'teacher-b');
  for (const name of ['recommendation', 'quality', 'difficulty', 'workload', 'grading']) {
    await expect(editor.getByText(a.editor.ratingsRequired, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: a.editor.publish, exact: true })).toBeDisabled();
    await editor.getByRole('group', { name: a.ratings[name].label, exact: true }).getByText(a.ratings[name].level4, { exact: true }).click();
  }
  await expect(editor.getByText(a.editor.ratingsRequired, { exact: true })).toHaveCount(0);
  await page.getByLabel(a.editor.title, { exact: true }).fill('Clear lectures');
  await page.getByLabel(a.editor.body, { exact: true }).fill('Weekly exercises helped.');
  await page.getByRole('button', { name: a.editor.publish, exact: true }).click();
  await expect(page.getByText(all.common.uncertain, { exact: true })).toBeVisible();
  await expect(page.getByLabel(a.editor.body, { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: all.common.retryOriginal, exact: true }).click();
  await expect(page.getByText(a.editor.published, { exact: true })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0].body).toMatchObject({ kind: 'course', target_id: 'course', term_id: 'spring', teacher_id: 'teacher-b', signed: false, ratings: [4, 4, 4, 4, 4] });
  expect(errors).toEqual([]);
});

test('ratings use five-level wording without exact averages and the layout fits the viewport', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic, errors = watch(page);
  await academicFixture(page);
  await page.goto(`http://127.0.0.1:18787/teachers/teacher-a?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Teacher A' })).toBeVisible();
  await expect(page.getByText(a.ratings.recommendation.level3, { exact: true }).first()).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/\b3\.0\b/);
  await page.getByRole('tab', { name: a.subject.mentorReviews, exact: true }).click();
  await expect(page.getByText(a.feed.emptyMentor, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('publish conditions only appear when the author does not meet them', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic, errors = watch(page);
  await academicFixture(page);
  const conditions = page.getByRole('region', { name: a.editor.eligibility, exact: true });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toBeVisible();
  await expect(conditions).toHaveCount(0);
  await pick(editor, 'spring');
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toHaveCount(0);
  await expect(conditions).toHaveCount(0);
  await page.route('**/api/v1/reviews/compose*', (route) => route.fulfill({ json: { allowed: false, state: 'forbidden', requirements: [{ key: 'login', state: 'satisfied' }, { key: 'phone_bound', state: 'missing' }], teacher_ids: [], identity: 'choice', rule_version: 'fixture' } }));
  await pick(editor, 'fall');
  await expect(conditions).toBeVisible();
  await expect(conditions).toContainText(a.composer.forbidden);
  expect(errors).toEqual([]);
});

test('directory filters stay out of the address and survive reload and back', async ({ page }, info) => {
  await academicFixture(page);
  const listCalls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/catalog/directory' && url.searchParams.get('kind') === 'course' && url.searchParams.get('limit') !== '1') listCalls.push(url.searchParams.get('department_id'));
  });
  const locale = info.project.metadata.locale;
  // An older shared link with the filter in the fragment still applies it.
  await page.goto(`http://127.0.0.1:18787/courses?lang=${locale}#department=dept`);
  await expect(page.getByRole('link', { name: /Test Course/ }).first()).toBeVisible();
  await expect.poll(() => listCalls.at(-1)).toBe('dept');
  // The address keeps only the page; the filter lives in history state.
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).searchParams.has('department')).toBe(false);
  await page.reload();
  await expect.poll(() => listCalls.at(-1)).toBe('dept');
  await page.getByRole('link', { name: /Test Course/ }).first().click();
  await expect(page).toHaveURL(/\/courses\/course/);
  listCalls.length = 0;
  await page.goBack();
  await expect.poll(() => listCalls.at(-1)).toBe('dept');
  expect(new URL(page.url()).searchParams.has('department')).toBe(false);
});

test('the teacher directory is open and lists teachers from the server', async ({ page }, info) => {
  await academicFixture(page);
  const kinds = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/catalog/directory') kinds.push(url.searchParams.get('kind'));
  });
  await page.goto(`http://127.0.0.1:18787/teachers?lang=${info.project.metadata.locale}`);
  await expect(page).toHaveURL(/\/teachers(\?|$)/);
  await expect(page.getByRole('link', { name: /Teacher A/ }).first()).toBeVisible();
  expect(kinds).toContain('teacher');
});

test('course and teacher directories keep filters independent across navigation', async ({ page }, info) => {
  await academicFixture(page);
  const b = catalogue(info).browse, calls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // The one-row request only supplies department counts; it is not the list.
    if (url.pathname === '/api/v1/catalog/directory' && url.searchParams.get('limit') !== '1') {
      calls.push({ kind: url.searchParams.get('kind'), q: url.searchParams.get('q'), department: url.searchParams.get('department_id') });
    }
  });
  const search = page.getByRole('searchbox');
  const navigate = (route) => page.locator(`a[href="${route}"]:visible`).first().click();
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}#q=Course&department=dept`);
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: 'Course', department: 'dept' });
  await navigate('/teachers');
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: null, department: null });
  await search.fill('Teacher');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher', department: null });
  await page.getByRole('combobox', { name: b.offeringDepartment }).click();
  await page.getByRole('option', { name: 'Test College', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher', department: 'dept' });
  await page.getByRole('button', { name: b.clearAll, exact: true }).click();
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: null, department: null });
  await search.fill('Teacher retained');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher retained', department: null });
  await navigate('/courses');
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: null, department: null });
  await search.fill('Fresh course');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: 'Fresh course', department: null });
  await page.goBack();
  await expect(search).toHaveValue('Teacher retained');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher retained', department: null });
  await page.goBack();
  await expect(search).toHaveValue('Course');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: 'Course', department: 'dept' });
  expect(new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
});

test('the course directory shows category tabs, grouping and a quick view with rating charts', async ({ page }, info) => {
  await academicFixture(page);
  const b = catalogue(info).browse;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const tabs = page.getByRole('group', { name: b.courseCategory });
  await expect(tabs.getByRole('button', { name: /Test Seminar/ })).toBeVisible();
  await tabs.getByRole('button', { name: /Test Seminar/ }).click();
  await expect(tabs.getByRole('button', { name: /Test Seminar/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: b.listMode }).getByRole('button', { name: b.byDepartment }).click();
  await expect(page.getByRole('heading', { name: 'Test College' })).toBeVisible();
  // The department reads its own rows after its heading appears.
  await expect(page.getByRole('region', { name: 'Test College' }).getByRole('link', { name: 'Test Course' })).toBeVisible();
  const quick = page.getByRole('button', { name: b.quickViewItem.replace('{p0}', 'Test Course') });
  if (await quick.isVisible()) await quick.click();
  else {
    await page.getByRole('button', { name: b.moreActionsFor.replace('{p0}', 'Test Course') }).click();
    await page.getByRole('menuitem', { name: b.quickView }).click();
  }
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'Test Course' })).toBeVisible();
  await expect(drawer.getByRole('img').first()).toBeVisible();
  await expect(drawer.getByRole('heading', { name: b.recommendationDist })).toBeVisible();
  await expect(drawer.getByRole('link', { name: b.viewDetails })).toHaveAttribute('href', '/courses/course');
  expect(errors).toEqual([]);
});

test('the teacher quick view reads the most upvoted course review attributed to the teacher', async ({ page }, info) => {
  await academicFixture(page);
  const b = catalogue(info).browse, reviewQueries = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === '/api/v1/reviews' && url.searchParams.get('sort') === 'upvotes') reviewQueries.push(Object.fromEntries(url.searchParams)); });
  await page.goto(`http://127.0.0.1:18787/teachers?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: b.quickView, exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => reviewQueries.at(-1)?.kind).toBe('course');
  expect(reviewQueries.at(-1)?.teacher_id).toBe('teacher-a');
});

// A two-page course directory in the shape of GET /catalog/directory, for the list states below.
const directoryObject = (id, kind, name) => ({ id, kind, name, school_id: 'school', credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z' });
const directoryRow = (id, name, recommendation) => ({ object: directoryObject(id, 'course', name), departments: [directoryObject('dept', 'department', 'Test College')], categories: [directoryObject('seminar', 'category', 'Test Seminar')], review_count: 2, recommendation, dimensions: Array.from({ length: 5 }, () => ({ level: 4, samples: 2, courses: 1 })), heat: 1 });
const directoryPage = (rows, next, total) => ({ items: rows, next, total, facet_total: total, category_facets: [{ id: 'seminar', name: 'Test Seminar', count: total, review_count: total }], department_facets: [{ id: 'dept', name: 'Test College', count: total, review_count: total }], generated_at: '2026-11-15T00:00:00Z' });

test('course rows show the recommendation in words and the next page arrives without a button', async ({ page }, info) => {
  const all = catalogue(info), b = all.browse, errors = watch(page);
  let release;
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('limit') === '1') return route.fallback();
    if (!query.get('after')) return route.fulfill({ json: directoryPage([directoryRow('a', 'Course A', 'strongly_recommended'), directoryRow('b', 'Course B', 'average')], 'page-2', 3) });
    await new Promise((resolve) => { release = resolve; });
    return route.fulfill({ json: directoryPage([directoryRow('c', 'Course C', 'unrated')], '', 3) });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const rows = page.locator('main li.line');
  await expect(rows).toHaveCount(2);
  // The level is a word, never a score, and exactly one copy of it is visible in either layout.
  await expect(rows.nth(0).locator('.d-level:visible')).toHaveText(b.levelStrongly);
  await expect(rows.nth(1).locator('.d-level:visible')).toHaveText(b.levelAverage);
  await expect(page.getByRole('main')).not.toContainText(/\d[.,]\d/);
  // The end of the list is already in reach, so the next page loads by itself.
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: all.common.loading })).toBeVisible();
  await expect(page.getByRole('button', { name: all.common.loadMore, exact: true })).toHaveCount(0);
  release();
  await expect(rows).toHaveCount(3);
  // A course without enough reviews shows no level.
  await expect(rows.nth(2).locator('.d-level:visible')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: all.common.loading })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('each department in the grouped view reads its own rows and shows all of them on request', async ({ page }, info) => {
  const all = catalogue(info), b = all.browse, errors = watch(page), seen = [];
  const number = (value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
  const departments = [{ id: 'dept', name: 'Test College', count: 7, review_count: 7 }, { id: 'dept-2', name: 'Second College', count: 1, review_count: 0 }];
  await page.addInitScript(() => localStorage.setItem('stuhelper.directory.grouped', '1'));
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    seen.push(Object.fromEntries(query));
    const department = query.get('department_id');
    const size = department === 'dept' ? 7 : 1;
    const rows = Array.from({ length: department ? size : 1 }, (_, i) => directoryRow(`${department ?? 'x'}-${i}`, `${department ?? 'x'} course ${i}`, 'recommended'));
    const limit = Number(query.get('limit'));
    // One course of nine has no department, so no section holds it.
    return route.fulfill({ json: { ...directoryPage(rows.slice(0, limit), rows.length > limit ? 'more' : '', 9), department_facets: departments } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const first = page.getByRole('region', { name: 'Test College' });
  const second = page.getByRole('region', { name: 'Second College' });
  await expect(first.locator('li.line')).toHaveCount(5);
  await expect(second.locator('li.line')).toHaveCount(1);
  // A department with no more rows than the preview has nothing to expand, and no list-wide button exists.
  await expect(second.locator('button.more')).toHaveCount(0);
  await expect(page.getByRole('button', { name: all.common.loadMore, exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: b.expandAll.replace('{p0}', number(7)), exact: true }).click();
  await expect(first.locator('li.line')).toHaveCount(7);
  expect(seen.some((q) => q.department_id === 'dept' && q.limit === '100')).toBe(true);
  await first.getByRole('button', { name: b.collapse, exact: true }).click();
  await expect(first.locator('li.line')).toHaveCount(5);
  await expect(page.getByText(b.unassignedCourses.replace('{p0}', number(1)), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: b.showInList, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Test College' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: b.listMode }).getByRole('button', { name: b.byDepartment })).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('a new search keeps the previous rows until the result arrives and clears them when it fails', async ({ page }, info) => {
  const all = catalogue(info), errors = watch(page);
  let release, outcome = 'ok';
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('limit') === '1') return route.fallback();
    if (!query.get('q')) return route.fulfill({ json: directoryPage([directoryRow('a', 'Course A', 'recommended')], '', 1) });
    await new Promise((resolve) => { release = resolve; });
    return outcome === 'ok' ? route.fulfill({ json: directoryPage([directoryRow('b', 'Course B', 'recommended')], '', 1) }) : route.fulfill({ status: 503, json: { code: 'unavailable' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const list = page.locator('main .sections');
  await expect(page.locator('main a[href="/courses/a"]')).toBeVisible();
  await page.getByRole('searchbox').fill('B');
  // While the request is open the old row stays, marked busy; no placeholder replaces the list.
  await expect(list).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('main a[href="/courses/a"]')).toBeVisible();
  await expect(page.locator('main .skeleton')).toHaveCount(0);
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(page.locator('main a[href="/courses/b"]')).toBeVisible();
  await expect(page.locator('main a[href="/courses/a"]')).toHaveCount(0);
  await expect(page.locator('main .sections')).not.toHaveAttribute('aria-busy', 'true');
  // A failed search must not leave rows the server did not confirm.
  outcome = 'fail';
  release = undefined;
  await page.getByRole('searchbox').fill('C');
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('main a[href^="/courses/"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: all.academic.directory.reloadCourses, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the quick view names the course at once, gives a verdict in words and retries a failed overview', async ({ page }, info) => {
  const all = catalogue(info), b = all.browse, errors = watch(page);
  let summaries = 0, held, healthy = false;
  await academicFixture(page);
  await page.route('**/api/v1/catalog/objects/course/summary', async (route) => {
    summaries += 1;
    if (healthy) return route.fallback();
    await new Promise((resolve) => { held = resolve; });
    return route.fulfill({ status: 503, json: { code: 'unavailable' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  await expect(page.locator('main li.line')).toHaveCount(1);
  const quick = page.getByRole('button', { name: b.quickViewItem.replace('{p0}', 'Test Course') });
  if (await quick.isVisible()) await quick.click();
  else {
    await page.getByRole('button', { name: b.moreActionsFor.replace('{p0}', 'Test Course') }).click();
    await page.getByRole('menuitem', { name: b.quickView }).click();
  }
  const drawer = page.getByRole('dialog');
  // The heading comes from the row, before the overview request has answered.
  await expect(drawer.getByRole('heading', { name: 'Test Course' })).toBeVisible();
  expect(summaries).toBe(1);
  // Ratings load on their own: the verdict names the level in words for every dimension.
  const verdict = drawer.getByRole('region', { name: b.recommendation, exact: true });
  await expect(verdict.locator('.d-level').first()).toHaveText(b.levelRecommended);
  await expect(verdict.locator('.d-level')).toHaveCount(5);
  await expect(verdict).not.toContainText(/\d[.,]\d/);
  held();
  await expect(drawer.getByRole('alert')).toContainText(b.quickViewUnavailable);
  await expect(drawer.getByRole('heading', { name: 'Test Course' })).toBeVisible();
  healthy = true;
  await drawer.getByRole('alert').getByRole('button', { name: all.common.retry, exact: true }).click();
  await expect(drawer.getByRole('alert')).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: b.viewDetails })).toHaveAttribute('href', '/courses/course');
  // On a phone the drawer is a sheet attached to the bottom edge; on a wide screen it is a side panel.
  const box = await drawer.boundingBox(), viewport = page.viewportSize();
  expect(Math.round(box.y + box.height)).toBe(viewport.height);
  if (viewport.width <= 640) expect(box.y).toBeGreaterThan(0);
  else expect(box.y).toBe(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the editor names what is still missing and keeps plain field names beside the counters', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic, errors = watch(page);
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const list = (items) => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  const ratings = (done) => a.editor.ratingsDone.replace('{done}', number(done)).replace('{total}', number(5));
  const missing = (items) => a.editor.missing.replace('{items}', list(items));
  await academicFixture(page);
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  const publish = editor.getByRole('button', { name: a.editor.publish, exact: true });
  await expect(editor.getByText(missing([a.editor.term, ratings(0), a.editor.title, a.editor.body]), { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();
  await pick(editor, 'spring');
  for (const name of ['recommendation', 'quality']) await editor.locator(`label:has(input[name="rating-${name}"][value="4"])`).click();
  await expect(editor.getByText(missing([ratings(2), a.editor.title, a.editor.body]), { exact: true })).toBeVisible();
  for (const name of ['difficulty', 'workload', 'grading']) await editor.locator(`label:has(input[name="rating-${name}"][value="3"])`).click();
  // The counters are not part of the labels, so both fields are still found by their plain names.
  await editor.getByLabel(a.editor.title, { exact: true }).fill('Clear title');
  await expect(editor.getByText(missing([a.editor.body]), { exact: true })).toBeVisible();
  await expect(editor.getByText(`${number(11)} / ${number(200)}`, { exact: true })).toBeVisible();
  await editor.getByLabel(a.editor.body, { exact: true }).fill('Useful text.');
  await expect(editor.getByText(a.editor.missing.split('{items}')[0].trim(), { exact: false })).toHaveCount(0);
  await expect(publish).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('review cards show the reply preview from the list without asking for replies one by one', async ({ page }, info) => {
  await academicFixture(page);
  const reviewQueries = [];
  await page.route('**/api/v1/reviews?*', async (route) => {
    const url = new URL(route.request().url());
    reviewQueries.push(Object.fromEntries(url.searchParams));
    if (url.searchParams.get('kind') !== 'course') return route.fallback();
    const reply = { id: 'reply-1', root_id: 'review', parent_id: 'review', kind: 'reply', school_id: 'school', target_id: 'course', title: '', body: 'Preview reply body', ratings: [0, 0, 0, 0, 0], author: { anonymous: true, handle: 'anonymous' }, revision: 1, published_at: '2026-10-28T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: false, state: 'published', can_edit: false };
    const review = { id: 'review', root_id: 'review', kind: 'course', school_id: 'school', target_id: 'course', term_id: 'fall', title: 'A student review', body: 'Useful course content.', ratings: [3, 3, 3, 3, 3], author: { anonymous: true, handle: 'anonymous' }, revision: 1, published_at: '2026-10-27T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: false, state: 'published', can_edit: false, reply_count: 1, reply_preview: [reply] };
    return route.fulfill({ json: { items: [review], next: '' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  await expect(page.getByText('Preview reply body')).toBeVisible();
  expect(reviewQueries.some((q) => q.kind === 'course' && q.include_reply_preview === 'true')).toBe(true);
  expect(reviewQueries.filter((q) => q.kind === 'reply')).toEqual([]);
});
