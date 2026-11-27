import { Buffer } from 'node:buffer';
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
    await expect(page.getByRole('main').getByRole('button', { name: all.academic.subject.writeCourse, exact: true })).toHaveCount(0);
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
  // Only the terms in which the course ran are offered, in the order the composer returns.
  await page.route('**/api/v1/reviews/compose*', (route) => route.fulfill({ json: { allowed: false, state: 'choose_term', requirements: [{ key: 'login', state: 'satisfied' }], terms: terms.map(([id, name, term_order_key]) => ({ id, name, term_order_key, enrolled: false })), teachers: [], identity: 'choice', rule_version: 'fixture' } }));
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form');
  const choices = editor.getByRole('group', { name: a.editor.term, exact: true });
  await expect(choices.locator('label')).toHaveText(terms.map((term) => term[1]));
});

test('course review lists the semester teachers, highlights own enrollment, takes several teachers and a grade, and publishes once', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), a = all.academic, errors = watch(page), posts = [];
  await academicFixture(page);
  // With school data authorization the composer marks the author's own term and teacher.
  await page.route('**/api/v1/reviews/compose*', (route) => {
    const term = new URL(route.request().url()).searchParams.get('term_id');
    return route.fulfill({ json: { allowed: !!term, state: term ? 'ready' : 'choose_term', requirements: [{ key: 'login', state: 'satisfied' }], terms: [{ id: 'spring', name: 'Spring semester', term_order_key: 2, enrolled: true }, { id: 'fall', name: 'Fall semester', term_order_key: 1, enrolled: false }], teachers: term === 'spring' ? [{ id: 'teacher-a', enrolled: false }, { id: 'teacher-b', enrolled: true }] : [], identity: 'choice', rule_version: 'fixture' } });
  });
  await page.route('**/api/v1/reviews', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    return posts.length === 1 ? route.abort() : route.fulfill({ json: { id: 'new-review', state: 'published', revision: 1 } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toBeVisible();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  const termGroup = editor.getByRole('group', { name: a.editor.term, exact: true });
  await expect(termGroup.locator('label.marked')).toHaveCount(1);
  await expect(termGroup.locator('label.marked')).toContainText('Spring semester');
  await pick(editor, 'spring');
  const teacherGroup = editor.getByRole('group', { name: a.editor.teacher, exact: true });
  await expect(teacherGroup.getByRole('checkbox')).toHaveCount(2);
  await expect(teacherGroup.locator('label.marked')).toContainText('Teacher B');
  await expect(editor.getByText(a.editor.enrolledLegend, { exact: true })).toBeVisible();
  await expect(editor.getByText(a.editor.teacherHint, { exact: true })).toBeVisible();
  await pick(editor, 'teacher-b');
  await pick(editor, 'teacher-a');
  await expect(teacherGroup.getByRole('checkbox', { checked: true })).toHaveCount(2);
  for (const name of ['recommendation', 'quality', 'difficulty', 'workload', 'grading']) {
    await expect(editor.getByText(a.editor.ratingsRequired, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: a.editor.publish, exact: true })).toBeDisabled();
    await editor.getByRole('group', { name: a.ratings[name].label, exact: true }).getByText(a.ratings[name].level4, { exact: true }).click();
  }
  await expect(editor.getByText(a.editor.ratingsRequired, { exact: true })).toHaveCount(0);
  await page.getByLabel(a.editor.title, { exact: true }).fill('Clear lectures');
  await page.getByLabel(a.editor.body, { exact: true }).fill('Weekly exercises helped.');
  // A chosen grade scale without a valid score holds publishing and names the field.
  const grades = editor.getByRole('group', { name: a.grade.label, exact: true });
  await grades.getByText(a.grade.scales.percent, { exact: true }).click();
  await expect(page.getByRole('button', { name: a.editor.publish, exact: true })).toBeDisabled();
  await editor.getByLabel(a.grade.percentLabel, { exact: true }).fill('101');
  await expect(editor.getByText(a.grade.percentInvalid, { exact: true })).toBeVisible();
  await editor.getByLabel(a.grade.percentLabel, { exact: true }).fill('92');
  await page.getByRole('button', { name: a.editor.publish, exact: true }).click();
  await expect(page.getByText(all.common.uncertain, { exact: true })).toBeVisible();
  await expect(page.getByLabel(a.editor.body, { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: all.common.retryOriginal, exact: true }).click();
  await expect(page.getByText(a.editor.published, { exact: true })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  // Teachers keep the listed order, whatever the click order.
  expect(posts[0].body).toMatchObject({ kind: 'course', target_id: 'course', term_id: 'spring', teacher_ids: ['teacher-a', 'teacher-b'], grade: { scale: 'percent', value: 92 }, signed: false, ratings: [4, 4, 4, 4, 4] });
  expect(errors).toEqual([]);
});

test('withdrawn is a grade choice of its own and needs no value', async ({ page }, info) => {
  const a = catalogue(info).academic, posts = [];
  await academicFixture(page);
  await page.route('**/api/v1/reviews', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 'new-review', state: 'published', revision: 1 } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await pick(editor, 'fall');
  for (const name of ['recommendation', 'quality', 'difficulty', 'workload', 'grading']) await editor.locator(`label:has(input[name="rating-${name}"][value="3"])`).click();
  await editor.getByLabel(a.editor.title, { exact: true }).fill('Dropped it');
  await editor.getByLabel(a.editor.body, { exact: true }).fill('Too much for my schedule.');
  const grades = editor.getByRole('group', { name: a.grade.label, exact: true });
  await grades.getByText(a.grade.scales.five_level, { exact: true }).click();
  await expect(editor.getByRole('button', { name: a.editor.publish, exact: true })).toBeDisabled();
  await grades.getByText(a.grade.scales.withdrawn, { exact: true }).click();
  await expect(editor.getByLabel(a.grade.percentLabel, { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: a.editor.publish, exact: true }).click();
  await expect(page.getByText(a.editor.published, { exact: true })).toBeVisible();
  expect(posts[0]).toMatchObject({ term_id: 'fall', teacher_ids: [], grade: { scale: 'withdrawn' } });
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
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toBeVisible();
  await expect(conditions).toHaveCount(0);
  await pick(editor, 'spring');
  await expect(page.getByText(a.composer.choose_term, { exact: true })).toHaveCount(0);
  await expect(conditions).toHaveCount(0);
  await page.route('**/api/v1/reviews/compose*', (route) => route.fulfill({ json: { allowed: false, state: 'forbidden', requirements: [{ key: 'login', state: 'satisfied' }, { key: 'phone_bound', state: 'missing' }], terms: [], teachers: [], identity: 'choice', rule_version: 'fixture' } }));
  await pick(editor, 'fall');
  await expect(conditions).toBeVisible();
  await expect(conditions).toContainText(a.composer.forbidden);
  expect(errors).toEqual([]);
});

test('directory filters stay out of the address, survive reload and come back from a detail page without reloading', async ({ page }, info) => {
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
  await expect(page.getByRole('link', { name: /Test Course/ }).first()).toBeVisible();
  // The list stays alive behind the detail page: back shows the same rows at the same place.
  // The one-row fixture is short, so the document is made tall enough to have a position to restore.
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; document.querySelector('.list-page').dataset.kept = 'yes'; window.scrollTo(0, 120); });
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  listCalls.length = 0;
  // A script click keeps the scroll position; Playwright would scroll the link into view first.
  await page.getByRole('link', { name: /Test Course/ }).first().evaluate((link) => link.click());
  await expect(page).toHaveURL(/\/courses\/course/);
  await page.goBack();
  await expect(page.getByRole('link', { name: /Test Course/ }).first()).toBeVisible();
  await expect(page.locator('.list-page')).toHaveAttribute('data-kept', 'yes');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  expect(listCalls).toEqual([]);
  expect(new URL(page.url()).searchParams.has('department')).toBe(false);
  // The back link on the detail page returns to the same kept list, like the browser button.
  await page.getByRole('link', { name: /Test Course/ }).first().evaluate((link) => link.click());
  await expect(page).toHaveURL(/\/courses\/course/);
  await page.locator('.page-back').click();
  await expect(page).toHaveURL(/\/courses(\?|$)/);
  await expect(page.locator('.list-page')).toHaveAttribute('data-kept', 'yes');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  expect(listCalls).toEqual([]);
  // Opened directly, the detail page has no previous page and its back link opens the list.
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.locator('.page-back').click();
  await expect(page).toHaveURL(/\/courses(\?|$)/);
  await expect.poll(() => listCalls.length).toBeGreaterThan(0);
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

const avatar = (id) => `/api/v1/catalog/objects/${id}/teacher-homepage/photos/${'a'.repeat(64)}/thumbnail`;

test('teacher cards read the homepage thumbnail and retain initials on denial', async ({ page }, info) => {
  await academicFixture(page, { avatars: { 'teacher-a': avatar('teacher-a'), 'teacher-b': avatar('teacher-b') } });
  const jpeg = await page.evaluate(() => document.createElement('canvas').toDataURL('image/jpeg').split(',')[1]);
  const fetched = [];
  await page.route('**/teacher-homepage/photos/**', async route => {
    const path = new URL(route.request().url()).pathname;
    fetched.push(path);
    if (path === avatar('teacher-a')) return route.fulfill({ contentType: 'image/jpeg', body: Buffer.from(jpeg, 'base64') });
    return route.fulfill({ status: 403, json: { code: 'forbidden' } });
  });
  await page.goto(`http://127.0.0.1:18787/teachers?lang=${info.project.metadata.locale}`);
  const first = page.locator('.face').first(), second = page.locator('.face').nth(1);
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('img')).toBeVisible();
  await expect(first.locator('img')).toHaveAttribute('alt', catalogue(info).teacherHomepage.photo.replace('{name}', 'Teacher A'));
  await second.scrollIntoViewIfNeeded();
  await expect.poll(() => fetched.includes(avatar('teacher-b'))).toBe(true);
  await expect(second).toHaveText('T');
  await expect(second.locator('img')).toHaveCount(0);
  for (const face of [first, second]) {
    const box = await face.boundingBox();
    expect([box.width, box.height]).toEqual([44, 44]);
  }
  expect(fetched.sort()).toEqual([avatar('teacher-a'), avatar('teacher-b')]);
});

test('offscreen teacher photos wait and at most four thumbnails load together', async ({ page }, info) => {
  const ids = Array.from({ length: 40 }, (_, i) => `faculty-${i}`);
  await academicFixture(page, { teacherIds: ids, avatars: Object.fromEntries(ids.map(id => [id, avatar(id)])) });
  const requested = new Set();
  let active = 0, peak = 0, release;
  const paused = new Promise(resolve => { release = resolve; });
  await page.route('**/teacher-homepage/photos/**', async route => {
    requested.add(new URL(route.request().url()).pathname);
    active++;
    peak = Math.max(peak, active);
    await paused;
    active--;
    await route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  try {
    await page.goto(`http://127.0.0.1:18787/teachers?lang=${info.project.metadata.locale}`);
    const faces = page.locator('.teacher-card .face');
    await expect(faces).toHaveCount(ids.length);
    await faces.first().scrollIntoViewIfNeeded();
    await expect.poll(() => requested.size).toBeGreaterThan(0);
    expect(requested.has(avatar(ids.at(-1)))).toBe(false);
    for (let i = 1; i <= 6; i++) await faces.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => active).toBe(4);
    await faces.last().scrollIntoViewIfNeeded();
    expect(requested.has(avatar(ids.at(-1)))).toBe(false);
    release();
    await expect.poll(() => requested.has(avatar(ids.at(-1)))).toBe(true);
    expect(peak).toBe(4);
  } finally {
    release();
  }
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
  // The teacher list was kept alive with its own search, so back needs no new request.
  const sent = calls.length;
  await page.goBack();
  await expect(search).toHaveValue('Teacher retained');
  expect(calls.length).toBe(sent);
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
const directoryPage = (rows, next, total) => ({ items: rows, next, total, facet_total: total, nature_facets: [], category_facets: [{ id: 'seminar', name: 'Test Seminar', count: total, review_count: total }], department_facets: [{ id: 'dept', name: 'Test College', count: total, review_count: total }], generated_at: '2026-11-15T00:00:00Z' });

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
  // On a phone the department leads the line under the name, before the category.
  if (info.project.name.startsWith('mobile-')) await expect(rows.nth(0).locator('.phone')).toContainText(/Test College.*Test Seminar/);
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
    const assigned = Array.from({ length: 7 }, (_, i) => directoryRow(`dept-${i}`, `dept course ${i}`, 'recommended'));
    const unassigned = directoryRow('unassigned', 'No department course', 'recommended');
    const rows = department === 'dept' ? assigned : department === 'dept-2' ? [assigned[0]] : [...assigned, unassigned];
    const limit = Number(query.get('limit'));
    // One course belongs to both departments. Another has no department: the facet sum
    // equals the total even though one result cannot appear in either section.
    return route.fulfill({ json: { ...directoryPage(rows.slice(0, limit), rows.length > limit ? 'more' : '', 8), department_facets: departments } });
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
  // One switch expands or collapses every department, overriding each card's own choice.
  const bulk = page.getByRole('group', { name: b.groupDisplay });
  await bulk.getByRole('button', { name: b.expandAllGroups, exact: true }).click();
  await expect(first.locator('li.line')).toHaveCount(7);
  await expect(first.getByRole('button', { name: b.collapse, exact: true })).toBeVisible();
  await bulk.getByRole('button', { name: b.collapseAllGroups, exact: true }).click();
  await expect(first.locator('li.line')).toHaveCount(5);
  await expect(bulk).toBeInViewport();
  await page.getByRole('group', { name: b.listMode }).getByRole('button', { name: b.all, exact: true }).click();
  await expect(page.getByText('No department course', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Test College' })).toHaveCount(0);
  await expect(bulk).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('department groups omit missing identities and restart expired pagination', async ({ page }, info) => {
  const facets = [
    { id: 'dept', name: 'Named college', count: 100, review_count: 0 },
    { id: '', name: '', count: 86, review_count: 0 },
  ];
  const requests = [];
  let restarted = false;
  await page.addInitScript(() => localStorage.setItem('stuhelper.directory.grouped', '1'));
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    const id = q.get('department_id'), after = q.get('after'), limit = Number(q.get('limit'));
    if (id !== 'dept') {
      return route.fulfill({ json: { ...directoryPage([directoryRow('named', 'Assigned', 'average')], '', 102), department_facets: facets } });
    }
    requests.push([after, limit]);
    if (after === 'expired') {
      restarted = true;
      return route.fulfill({ status: 409, json: { code: 'conflict' } });
    }
    const start = after === 'current' ? 100 : 0;
    const size = start ? 2 : limit;
    const rows = Array.from({ length: size }, (_, i) => ({
      ...directoryRow(`unknown-${start+i}`, `Department course ${start + i}`, 'average'), departments: [directoryObject('dept', 'department', 'Named college')],
    }));
    return route.fulfill({ json: { ...directoryPage(rows, start ? '' : restarted ? 'current' : 'expired', restarted ? 102 : 101), department_facets: facets.slice(0, 1) } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const group = page.getByRole('region', { name: 'Named college' });
  await expect(group).toBeVisible();
  await expect(page.locator('.masonry section')).toHaveCount(1);
  await expect(group.locator('li.line')).toHaveCount(5);
  await group.locator('button.more').click();
  await expect(group.locator('li.line')).toHaveCount(102);
  expect(requests).toEqual([[null, 5], [null, 100], ['expired', 100], [null, 100], ['current', 100]]);
  await expect(group.getByText('Assigned', { exact: true })).toHaveCount(0);
});

test('expanding every department reads at most two pages at once and stops when collapsed', async ({ page }, info) => {
  const b = catalogue(info).browse, errors = watch(page);
  const departments = Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, name: `College ${i}`, count: 250, review_count: 0 }));
  let inFlight = 0, peak = 0, fullPages = 0;
  const held = [];
  await page.addInitScript(() => localStorage.setItem('stuhelper.directory.grouped', '1'));
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const department = query.get('department_id'), limit = Number(query.get('limit')), after = Number(query.get('after') || 0);
    const rows = Array.from({ length: Math.min(limit, 250 - after) }, (_, i) => directoryRow(`${department}-${after + i}`, `${department} course ${after + i}`, 'recommended'));
    const body = { ...directoryPage(rows, after + limit < 250 ? String(after + limit) : '', 1000), department_facets: departments };
    if (limit !== 100) return route.fulfill({ json: body });
    fullPages += 1; inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((resolve) => held.push(resolve));
    inFlight -= 1;
    return route.fulfill({ json: body }).catch(() => undefined);
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  for (const d of departments) await expect(page.getByRole('region', { name: d.name }).locator('li.line')).toHaveCount(5);
  const bulk = page.getByRole('group', { name: b.groupDisplay });
  await bulk.getByRole('button', { name: b.expandAllGroups, exact: true }).click();
  await expect.poll(() => fullPages).toBe(2);
  // Release one page at a time: the queue never lets more than two run together.
  for (let i = 0; i < 4; i++) { held.shift()?.(); await page.waitForTimeout(50); }
  expect(peak).toBeLessThanOrEqual(2);
  await bulk.getByRole('button', { name: b.collapseAllGroups, exact: true }).click();
  const sent = fullPages;
  while (held.length) held.shift()();
  await page.waitForTimeout(300);
  expect(fullPages).toBe(sent);
  for (const d of departments) await expect(page.getByRole('region', { name: d.name }).locator('li.line')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('departments fill the shortest column, and expanding one moves only the cards below it', async ({ page }, info) => {
  const errors = watch(page);
  const counts = [12, 1, 1, 1, 1, 1];
  const departments = counts.map((count, i) => ({ id: `d${i}`, name: `College ${i}`, count, review_count: 0 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('stuhelper.directory.grouped', '1'));
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const department = query.get('department_id'), limit = Number(query.get('limit')), after = Number(query.get('after') || 0);
    const total = department ? counts[Number(department.slice(1))] : 18;
    const rows = Array.from({ length: Math.min(limit, total - after) }, (_, i) => directoryRow(`${department}-${after + i}`, `${department} course ${after + i}`, 'recommended'));
    return route.fulfill({ json: { ...directoryPage(rows, after + limit < total ? String(after + limit) : '', total), department_facets: departments } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const columns = page.locator('main .masonry-column');
  await expect(columns).toHaveCount(3);
  // The tall first department fills its column, so the short ones go to the other two columns.
  await expect(columns.nth(0).getByRole('region')).toHaveCount(1);
  await expect(columns.nth(1).getByRole('region')).toHaveCount(3);
  for (const d of departments) await expect(page.getByRole('region', { name: d.name }).locator('li.line')).toHaveCount(Math.min(d.count, 5));
  const below = columns.nth(1).getByRole('region').last();
  const across = columns.nth(2).getByRole('region').first();
  // Positions inside the masonry, so scrolling or the toolbar above does not count as movement.
  const top = (locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().top - element.closest('.masonry').getBoundingClientRect().top));
  // Row details such as saved state arrive after the rows; measure once the page has settled.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const [belowBefore, acrossBefore] = [await top(below), await top(across)];
  await page.getByRole('region', { name: 'College 0' }).locator('button.more').click();
  await expect(page.getByRole('region', { name: 'College 0' }).locator('li.line')).toHaveCount(12);
  await page.waitForTimeout(400);
  // The expanded card is alone in its column; cards in the other columns keep their places.
  expect(await top(across)).toBe(acrossBefore);
  expect(await top(below)).toBe(belowBefore);
  // A card under the expanded one in the same column would move down; here the tall card is alone.
  await expect(columns.nth(0).getByRole('region')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a long department list opens with a search field, filters as you type and applies the choice', async ({ page }, info) => {
  const all = catalogue(info), errors = watch(page);
  const departments = Array.from({ length: 14 }, (_, i) => ({ id: `d${i}`, name: i === 9 ? 'Aerospace School' : `College ${i}`, count: 1, review_count: 0 }));
  const asked = [];
  await academicFixture(page);
  await page.route('**/api/v1/catalog/directory**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query.get('department_id'));
    return route.fulfill({ json: { ...directoryPage([directoryRow('a', 'Course A', 'recommended')], '', 1), department_facets: departments } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  await page.getByRole('combobox', { name: all.browse.offeringDepartment }).click();
  const search = page.getByRole('textbox', { name: all.common.searchOptions });
  await expect(search).toBeFocused();
  await search.fill('aero space');
  const options = page.getByRole('option');
  await expect(options).toHaveText(['Aerospace School']);
  await search.fill('nothing like this');
  await expect(page.getByText(all.common.noOptionMatch)).toBeVisible();
  await search.fill('aero');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('combobox', { name: all.browse.offeringDepartment })).toHaveText('Aerospace School');
  await expect.poll(() => asked.includes('d9')).toBe(true);
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
  await expect(page.getByRole('main').getByRole('link', { name: 'Course A', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('B');
  // While the request is open the old row stays, marked busy; no placeholder replaces the list.
  await expect(list).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('main').getByRole('link', { name: 'Course A', exact: true })).toBeVisible();
  await expect(page.locator('main .skeleton')).toHaveCount(0);
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(page.getByRole('main').getByRole('link', { name: 'Course B', exact: true })).toBeVisible();
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
  // The directory publishes a four-band recommendation; the detailed fixture has level 3.
  await expect(page.locator('main li.line .d-level:visible')).toHaveText(b.levelRecommended);
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
  await expect(verdict.locator('.d-level').first()).toHaveText(b.levelAverage);
  await expect(verdict.locator('.d-level')).toHaveCount(5);
  await expect(drawer.locator('.radar').getByRole('img', { name: `${b.recommendation} ${b.levelAverage}` })).toBeVisible();
  const termLevel = b.termLevel.replace('{term}', 'Fall semester').replace('{level}', b.levelAverage);
  await expect(drawer.locator('.trend circle title')).toHaveText(termLevel);
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
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  const publish = editor.getByRole('button', { name: a.editor.publish, exact: true });
  await expect(editor.getByText(missing([a.editor.term, ratings(0), a.editor.title, a.editor.body]), { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();
  // A new course review starts from the editable template, which alone does not count as text.
  await expect(editor.getByLabel(a.editor.body, { exact: true })).toHaveValue(a.editor.courseTemplate);
  await expect(editor.getByLabel(a.editor.title, { exact: true })).toHaveAttribute('placeholder', a.editor.titlePlaceholder);
  await expect(editor.getByText(a.editor.courseTemplateHint, { exact: true })).toBeVisible();
  await expect(editor.getByText(a.editor.courseWritingTip, { exact: true })).toBeVisible();
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

test('without school data authorization a course review lists the public teachers, allows none and explains the unknown status', async ({ page }, info) => {
  const a = catalogue(info).academic, errors = watch(page);
  await academicFixture(page);
  await page.route('**/api/v1/verification/me/school-data', (route) => route.fulfill({ json: { state: 'inactive' } }));
  await page.route('**/api/v1/reviews/compose*', (route) => {
    const term = new URL(route.request().url()).searchParams.get('term_id');
    return route.fulfill({ json: { allowed: !!term, state: term ? 'ready' : 'choose_term', requirements: [{ key: 'login', state: 'satisfied' }], terms: [{ id: 'spring', name: 'Spring semester', term_order_key: 2, enrolled: false }, { id: 'fall', name: 'Fall semester', term_order_key: 1, enrolled: false }], teachers: term ? [{ id: 'teacher-a', enrolled: false }, { id: 'teacher-b', enrolled: false }] : [], identity: 'choice', rule_version: 'fixture' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await pick(editor, 'spring');
  await expect(editor.getByText('Teacher A', { exact: true })).toBeVisible();
  await expect(editor.getByText('Teacher B', { exact: true })).toBeVisible();
  // Without authorization nothing is marked as the author's own enrollment.
  await expect(editor.locator('label.marked')).toHaveCount(0);
  await expect(editor.getByText(a.editor.enrolledLegend, { exact: true })).toHaveCount(0);
  await expect(editor.getByText(a.editor.enrollmentInactive, { exact: true })).toBeVisible();
  await expect(editor.locator('.enrollment').filter({ hasText: a.enrollmentStatus.label.unknown })).toBeVisible();
  await expect(editor.getByRole('link', { name: a.editor.enrollmentSetup, exact: true })).toHaveAttribute('href', '/me/verification/school-data');
  for (const name of ['recommendation', 'quality', 'difficulty', 'workload', 'grading']) await editor.locator(`label:has(input[name="rating-${name}"][value="4"])`).click();
  await editor.getByLabel(a.editor.title, { exact: true }).fill('Clear title');
  await editor.getByLabel(a.editor.body, { exact: true }).fill('Useful text.');
  // No teacher is required: an unspecified teacher can be published.
  await expect(editor.getByRole('button', { name: a.editor.publish, exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the review editor names the authorized term, also after rechecks have stopped', async ({ page }, info) => {
  const all = catalogue(info), a = all.academic, sd = all.verification.schoolData, locale = info.project.metadata.locale;
  const term = sd.term.replace('{year}', new Intl.NumberFormat(locale, { useGrouping: false }).format(2026)).replace('{season}', sd.seasons.autumn);
  await academicFixture(page);
  let authorization = { state: 'active', verified_at: '2026-11-26T00:00:00Z', authorized_through: { id: 'fall', year: 2026, season: 'autumn' } };
  await page.route('**/api/v1/verification/me/school-data', (route) => route.fulfill({ json: authorization }));
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await expect(editor.getByText(a.editor.enrollmentActiveThrough.replace('{term}', term), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: a.editor.cancel ?? all.common.cancel, exact: true }).click().catch(() => undefined);
  authorization = { ...authorization, state: 'historical' };
  await page.reload();
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  await expect(editor.getByText(a.editor.enrollmentHistorical.replace('{term}', term), { exact: true })).toBeVisible();
  await expect(editor.getByRole('link', { name: a.editor.enrollmentReopen, exact: true })).toHaveAttribute('href', '/me/verification/school-data');
});

test('course review cards show the enrollment status captured at publication', async ({ page }, info) => {
  const a = catalogue(info).academic;
  await academicFixture(page);
  await page.route('**/api/v1/reviews?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('kind') !== 'course') return route.fallback();
    const review = (id, status) => ({ id, root_id: id, kind: 'course', school_id: 'school', target_id: 'course', term_id: 'fall', title: `Review ${id}`, body: 'Useful course content.', ratings: [3, 3, 3, 3, 3], author: { anonymous: true, handle: 'anonymous' }, revision: 1, published_at: '2026-10-27T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: false, state: 'published', can_edit: false, enrollment_status: status });
    return route.fulfill({ json: { items: [
      { ...review('one', 'enrolled'), teacher_ids: ['teacher-a', 'teacher-b'], grade: { scale: 'percent', value: 92 } },
      { ...review('two', 'not_enrolled'), teacher_ids: [], grade: { scale: 'withdrawn' } },
      { ...review('three', 'unknown'), teacher_ids: ['teacher-b'], grade: { scale: 'five_level', value: 'good' } },
    ], next: '' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  // Each card names every chosen teacher and shows the grade as entered.
  const card = (id) => page.locator('article').filter({ has: page.getByRole('link', { name: `Review ${id}`, exact: true }) });
  const format = (value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
  await expect(card('one')).toContainText(a.grade.display.replace('{value}', format(92)));
  await expect(card('one')).toContainText(new Intl.ListFormat(info.project.metadata.locale, { style: 'long', type: 'conjunction' }).format(['Teacher A', 'Teacher B']));
  await expect(card('two')).toContainText(a.grade.withdrawnDisplay);
  await expect(card('two')).toContainText(a.review.noTeacher);
  await expect(card('three')).toContainText(a.grade.display.replace('{value}', a.grade.five.good));
  const tones = { enrolled: 'tag-success', not_enrolled: 'tag-danger', unknown: 'tag-warning' };
  for (const [status, tone] of Object.entries(tones)) {
    // Labels can contain each other (for example Arabic "enrolled" inside "not enrolled"), so the hint identifies the badge.
    const badge = page.locator(`.enrollment[title="${a.enrollmentStatus.hint[status]}"]`);
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveClass(new RegExp(tone));
    await expect(badge).toContainText(a.enrollmentStatus.label[status]);
  }
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

test('course and teacher pages show no teaching classes and old class links lead to the directory', async ({ page }, info) => {
  const all = catalogue(info), errors = watch(page), seen = [];
  await academicFixture(page);
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname === '/api/v1/catalog/objects') seen.push(url.searchParams.get('kind')); });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  const sections = page.getByRole('tablist', { name: all.academic.subject.sections });
  await expect(sections.getByRole('tab', { name: all.academic.subject.teachers, exact: true })).toBeVisible();
  await expect(sections.getByRole('tab', { name: all.academic.offerings.title, exact: true })).toHaveCount(0);
  await sections.getByRole('tab', { name: all.academic.subject.teachers, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Teacher A' })).toBeVisible();
  for (const path of ['/classes/class-one', '/offerings/offering-fall']) {
    await page.goto(`http://127.0.0.1:18787${path}?lang=${info.project.metadata.locale}`);
    await expect(page).toHaveURL(/\/courses(\?|$)/);
  }
  expect(seen.filter((kind) => ['term_course', 'class', 'schedule', 'assignment'].includes(kind ?? ''))).toEqual([]);
  expect(errors).toEqual([]);
});

test('a course shows its English name and former codes, and an old course id opens the current course', async ({ page }, info) => {
  const all = catalogue(info), s = all.academic.subject, errors = watch(page);
  await academicFixture(page, { course: { english_name: 'Synthetic Course', former_codes: ['OLD101'], former_names: ['Old Course'], hours: 32, aliases: ['Synthetic Course'] } });
  await page.route('**/api/v1/catalog/objects/old-course/summary', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.route('**/api/v1/catalog/objects/old-course/resolution', (route) => route.fulfill({ json: { object: { id: 'course', kind: 'course', school_id: 'school', name: 'Test Course', credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z', canonical_id: 'course' }, ids: ['course', 'old-course'] } }));
  await page.goto(`http://127.0.0.1:18787/courses/old-course?lang=${info.project.metadata.locale}`);
  await expect(page).toHaveURL(/\/courses\/course(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Test Course', level: 1 })).toBeVisible();
  const facts = page.locator('dl.facts');
  await expect(facts.getByText(s.englishName, { exact: true })).toBeVisible();
  await expect(facts.getByText('Synthetic Course', { exact: true })).toBeVisible();
  await expect(facts.getByText('OLD101', { exact: true })).toBeVisible();
  await expect(facts.getByText('Old Course', { exact: true })).toBeVisible();
  // The English name is no longer listed again as an alias of the course.
  await expect(facts.getByText(s.aliases, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('course page defaults review sort to upvotes, renders distribution and trend charts, and my reviews opens pending courses prefilled', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), a = all.academic, b = all.browse, errors = watch(page), sorts = [];
  await academicFixture(page);
  await page.route('**/api/v1/reviews?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('kind') === 'course') sorts.push(q.get('sort'));
    return route.fallback();
  });
  await page.route('**/api/v1/reviews/me/overview', (route) => route.fulfill({ json: {
    review_count: 1,
    draft_count: 0,
    pending_courses: {
      state: 'available',
      reason: '',
      count: 2,
      items: [
        { course_id: 'course', course_name: 'Test Course', term_id: 'spring', term_name: 'Spring semester' },
      ],
    },
  } }));
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await expect.poll(() => sorts.at(0)).toBe('upvotes');
  await expect(page.getByRole('heading', { name: b.recommendationDist, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: b.trendByTerm, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: a.feed.sort }).click();
  await page.getByRole('option', { name: a.feed.newest, exact: true }).click();
  await expect.poll(() => sorts.at(-1)).toBe('newest');

  await page.goto(`http://127.0.0.1:18787/me/reviews?lang=${locale}`);
  const pendingRegion = page.getByRole('region', { name: all.me.pendingCoursesTitle, exact: true });
  await expect(pendingRegion.getByRole('link', { name: 'Test Course', exact: true })).toBeVisible();
  await pendingRegion.getByRole('button', { name: all.me.writePendingReview, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await expect(editor.locator('input[value="spring"]')).toBeChecked();
  await expect(editor.getByText('Teacher B', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('verified not-found links back to campus and fresh review edit window counts down to request actions', async ({ page }, info) => {
  const all = catalogue(info);
  const r = all.academic.review;
  await page.clock.install({ time: new Date('2026-11-18T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-18T10:00:10Z'));
  await academicFixture(page);
  await page.goto(`http://127.0.0.1:18787/no-such-campus-page?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: all.notFound.home, exact: true })).toHaveAttribute('href', '/campus');

  const freshReview = {
    id: 'fresh-rev',
    root_id: 'fresh-rev',
    kind: 'course',
    school_id: 'school',
    target_id: 'course',
    term_id: 'fall',
    title: 'Fresh review',
    body: 'Published ten seconds ago.',
    ratings: [4, 4, 3, 3, 4],
    author: { anonymous: true, handle: 'author' },
    revision: 1,
    published_at: '2026-11-18T10:00:00Z',
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    mine: true,
    state: 'published',
    can_edit: true,
  };
  let permissionReads = 0;
  await page.route('**/api/v1/reviews/me/entries/fresh-rev{,?*}', route => {
    permissionReads++;
    return route.fulfill({ json: { ...freshReview, can_edit: permissionReads === 1 } });
  });
  await page.route('**/api/v1/reviews?**', (route) => route.fulfill({ json: { items: [freshReview], next: '' } }));
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('button', { name: r.withdraw, exact: true })).toBeVisible();
  await expect(page.getByText(r.editWindowRemaining.replace('{time}', '4:50'), { exact: true })).toBeVisible();
  await page.clock.fastForward('05:00');
  await expect.poll(() => permissionReads).toBe(1);
  await expect(page.getByRole('button', { name: r.withdraw, exact: true })).toBeVisible();
  await page.clock.fastForward('00:31');
  await expect.poll(() => permissionReads).toBe(2);
  await expect(page.getByRole('button', { name: r.withdraw, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: r.requestEdit, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: r.requestDelete, exact: true })).toBeVisible();
});

test('a nature filter in navigation state reaches the directory without changing the URL', async ({ page }, info) => {
  const seen = [];
  await academicFixture(page);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname === '/api/v1/catalog/directory') seen.push(url.searchParams.get('nature_id'));
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  await page.evaluate(() => {
    history.replaceState({ ...history.state, filters: { nature: 'optional' } }, '');
  });
  seen.length = 0;
  await page.reload();
  await expect.poll(() => seen).toContain('optional');
  expect(new URL(page.url()).searchParams.has('nature')).toBe(false);
  expect(new URL(page.url()).hash).toBe('');
});

test('reporting a review needs a violation type and sends it with the report', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), a = all.academic, posts = [];
  await academicFixture(page);
  await page.route('**/api/v1/moderation/tasks', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 'task', object_id: 'review', kind: 'report', state: 'waiting', can_appeal: false, created_at: '2026-11-22T00:00:00Z', revision: 1 } });
  });
  await page.goto(`http://127.0.0.1:18787/reviews/review?lang=${locale}`);
  await page.getByRole('button', { name: a.review.report, exact: true }).first().click();
  const reason = page.getByLabel(a.review.reason, { exact: true });
  const submit = page.getByRole('button', { name: all.common.submit, exact: true });
  await reason.fill('Contains a phone number');
  await expect(submit).toBeDisabled();
  const field = page.getByRole('button', { name: all.violation.label, exact: true });
  await field.press('Enter');
  const picker = page.getByRole('dialog', { name: all.violation.pick, exact: true });
  await expect(picker).toHaveCSS('direction', locale === 'ar-EG' ? 'rtl' : 'ltr');
  await expect(picker.getByRole('heading', { level: 3 })).toHaveText(Object.values(all.violation.groups));
  await expect(picker.getByRole('listitem')).toHaveCount(24);
  for (const { name, hint } of Object.values(all.violation.categories)) {
    await expect(picker.getByRole('button', { name, exact: true })).toHaveAccessibleDescription(hint);
  }
  await picker.getByRole('button', { name: all.violation.categories.privacy_leak.name, exact: true }).press('Enter');
  await expect(picker).toHaveCount(0);
  await expect(field).toBeFocused();
  const atLimit = '😀'.repeat(2000);
  const overLimit = atLimit + '😀';
  const number = new Intl.NumberFormat(locale);
  await reason.fill(overLimit);
  expect((await reason.inputValue()) === overLimit).toBe(true);
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(reason).toHaveAccessibleDescription(`${number.format(2001)} / ${number.format(2000)}`);
  await expect(submit).toBeDisabled();
  await reason.evaluate((field) => field.form.requestSubmit());
  expect(posts).toHaveLength(0);

  await reason.fill(atLimit);
  await expect(reason).toHaveAccessibleDescription(`${number.format(2000)} / ${number.format(2000)}`);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ object_id: 'review', kind: 'report', category: 'privacy_leak' });
  expect(posts[0].reason === atLimit).toBe(true);
});

test('a follow-up attempted inside the five-minute window explains when it opens', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info);
  const retryAt = '2030-01-01T00:05:54Z';
  await academicFixture(page);
  await page.route('**/api/v1/reviews/review/actions', (route) => route.fulfill({ status: 409, json: { code: 'conflict', subcode: 'append_window_not_open', field: 'action', retry_at: retryAt } }));
  await page.route('**/api/v1/reviews/me/entries/review**', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.route(/\/api\/v1\/reviews\/review(\?.*)?$/, (route) => route.fulfill({ json: { id: 'review', root_id: 'review', kind: 'course', school_id: 'school', target_id: 'course', term_id: 'fall', title: 'Mine', body: 'Body', ratings: [3, 3, 3, 3, 3], author: { anonymous: true, handle: 'author' }, revision: 1, published_at: '2026-10-27T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: true, state: 'published', can_edit: false } }));
  await page.goto(`http://127.0.0.1:18787/reviews/review?lang=${locale}`);
  await page.getByLabel(all.academic.followUp).fill('More notes');
  await page.getByRole('button', { name: all.academic.submitFollowUp, exact: true }).click();
  const time = await page.evaluate(({ locale, retryAt }) => new Intl.DateTimeFormat(locale, {
    calendar: 'gregory', timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'medium',
  }).format(new Date(retryAt)), { locale, retryAt });
  const reopening = page.getByText(all.academic.followUpOpensAt.replace('{time}', time), { exact: true });
  await expect(page.getByRole('status').and(reopening)).toBeVisible();
  await expect(page.getByText(all.errors.append_window_not_open, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(all.academic.followUp)).toHaveValue('More notes');
});

test('a mentor comment does not wait for the course follow-up window', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), posts = [];
  await academicFixture(page);
  await page.clock.setFixedTime(new Date('2026-11-22T00:00:30Z'));
  await page.route('**/api/v1/reviews/me/entries/review**', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.route(/\/api\/v1\/reviews\/review(\?.*)?$/, (route) => route.fulfill({ json: { id: 'review', root_id: 'review', kind: 'mentor', school_id: 'school', target_id: 'teacher-a', title: 'Mine', body: 'Body', ratings: [0, 0, 0, 0, 0], author: { anonymous: true, handle: 'author' }, revision: 1, published_at: '2026-11-22T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: true, state: 'published', can_edit: true } }));
  await page.route('**/api/v1/reviews/review/actions', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 'review', state: 'published', revision: 2 } });
  });
  await page.goto(`http://127.0.0.1:18787/reviews/review?lang=${locale}`);
  const followUp = page.getByLabel(all.academic.followUp);
  await followUp.fill('More notes');
  const [before] = all.academic.followUpOpensAt.split('{time}');
  await expect(page.getByText(before.trim())).toHaveCount(0);
  await page.getByRole('button', { name: all.academic.submitFollowUp, exact: true }).click();
  await expect(followUp).toHaveValue('');
  expect(posts).toEqual([{ action: 'append', revision: 1, body: 'More notes' }]);
});

test('rating groups keep their dimension names when the school customises the level wording', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic;
  await academicFixture(page);
  // A school's level 0 text is the "not enough data" wording used in summaries.
  const band = ['Not enough data', 'L1', 'L2', 'Fair', 'L4', 'L5'];
  await page.route('**/api/v1/reviews/presentation**', (route) => route.fulfill({ json: { effective: { school_id: 'school', revision: 1, rating_texts: { [locale]: Array.from({ length: 5 }, () => band) } }, configured: null, source: 'custom' } }));
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  await page.getByRole('main').getByRole('button', { name: a.subject.writeCourse, exact: true }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await pick(editor, 'spring');
  for (const name of ['recommendation', 'quality', 'difficulty', 'workload', 'grading']) {
    const group = editor.getByRole('group', { name: a.ratings[name].label, exact: true });
    await expect(group).toHaveCount(1);
    await expect(group.getByText('Fair', { exact: true })).toBeVisible();
  }
  await expect(editor.getByRole('group', { name: 'Not enough data', exact: true })).toHaveCount(0);
});

test('category labels use a nine-rem column, one line and the full name on hover', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'Phones use the separate compact layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await academicFixture(page);
  const longName = '课程分类标签超长文字'.repeat(7);
  const row = directoryRow('width', 'Width test', 'recommended');
  row.categories[0].name = longName;
  await page.route('**/api/v1/catalog/directory**', route => route.fulfill({ json: directoryPage([row], '', 1) }));
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}`);
  const label = page.locator('li.line .cell .tag').first();
  await expect(label).toBeVisible();
  for (const width of ['61rem', '45rem']) {
    await page.locator('.flush').first().evaluate((el, size) => {
      el.style.width = size;
      el.style.maxWidth = 'none';
    }, width);
    const metrics = await label.evaluate(el => {
      const css = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        columnRem: el.parentElement.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize),
        wrap: css.whiteSpace,
        overflow: css.overflowX,
        ellipsis: css.textOverflow,
        clipped: el.scrollWidth > el.clientWidth,
        hoverTitle: hit?.closest('[title]')?.getAttribute('title'),
        course: hit?.closest('a')?.getAttribute('href'),
        departmentVisible: getComputedStyle(el.closest('.line').querySelector('.dept')).display !== 'none',
      };
    });
    expect(metrics).toEqual({
      columnRem: 9, wrap: 'nowrap', overflow: 'hidden', ellipsis: 'ellipsis', clipped: true,
      hoverTitle: longName, course: '/courses/width', departmentVisible: width === '61rem',
    });
  }
});

test('the course page term filter lists only the terms the course was offered in, and long filters are searchable', async ({ page }, info) => {
  const locale = info.project.metadata.locale, a = catalogue(info).academic, errors = watch(page), queries = [];
  await academicFixture(page);
  // The catalog answers a course's term query with its offered terms only; here the course ran in the fall.
  await page.route('**/api/v1/catalog/objects?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('kind') === 'teacher' && q.get('course_id') === 'course') return route.fulfill({ json: { items: Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, kind: 'teacher', school_id: 'school', name: `Teacher ${String.fromCharCode(65 + i)}`, credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z' })), next: '' } });
    if (q.get('kind') !== 'term') return route.fallback();
    queries.push(q.get('course_id'));
    return route.fulfill({ json: { items: q.get('course_id') === 'course' ? [{ id: 'fall', kind: 'term', school_id: 'school', name: 'Fall semester', credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z' }] : [], next: '' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
  // Term and teacher filters are dropdowns, so a long list keeps the row short.
  await page.getByRole('combobox', { name: a.feed.term, exact: true }).click();
  await expect(page.getByRole('option', { name: 'Fall semester', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Spring semester', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Fall semester', exact: true }).click();
  await expect(page.getByRole('combobox', { name: a.feed.term, exact: true })).toContainText('Fall semester');
  // Many teachers: the list opens with a search field and typing narrows it.
  await page.getByRole('combobox', { name: a.feed.teacher, exact: true }).click();
  const search = page.getByRole('textbox', { name: catalogue(info).common.searchOptions, exact: true });
  await search.fill('Teacher L');
  await expect(page.getByRole('option', { name: 'Teacher L', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Teacher A', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Teacher L', exact: true }).click();
  await expect(page.getByRole('combobox', { name: a.feed.teacher, exact: true })).toContainText('Teacher L');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(queries).toContain('course');
  expect(queries).not.toContain(null);
  expect(errors).toEqual([]);
});

test('the standing review entry lists own courses only with school data authorization and opens the editor with term and teachers chosen', async ({ page }, info) => {
  const locale = info.project.metadata.locale, all = catalogue(info), a = all.academic, l = a.launcher, errors = watch(page);
  await academicFixture(page);
  let authorization = { state: 'inactive' };
  const enrollmentReads = [];
  await page.route('**/api/v1/verification/me/school-data', (route) => route.fulfill({ json: authorization }));
  await page.route('**/api/v1/catalog/me/recent-courses', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/v1/catalog/me/enrollments**', (route) => {
    enrollmentReads.push(route.request().url());
    return route.fulfill({ json: [
      { id: 'e-fall', subject: 'synthetic', school_id: 'school', course_id: 'course', term_id: 'fall', teacher_ids: ['teacher-a'], active: true, term_order_key: 20253 },
      { id: 'e-spring', subject: 'synthetic', school_id: 'school', course_id: 'course', term_id: 'spring', teacher_ids: ['teacher-a', 'teacher-b'], active: true, term_order_key: 20261 },
    ] });
  });
  // The fall course is already reviewed; the spring course, taught by two teachers, is not.
  await page.route('**/api/v1/reviews/me/entries**', (route) => route.fulfill({ json: { items: [{ id: 'own-fall', root_id: 'own-fall', kind: 'course', school_id: 'school', target_id: 'course', term_id: 'fall', title: 'Mine', body: 'Mine', ratings: [3, 3, 3, 3, 3], author: { anonymous: true, handle: 'me' }, revision: 1, published_at: '2026-10-27T00:00:00Z', upvotes: 0, downvotes: 0, my_vote: 0, mine: true, can_edit: true, state: 'published' }], next: '' } }));
  await page.route('**/api/v1/reviews/compose**', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('term_id') !== 'spring') return route.fallback();
    return route.fulfill({ json: { allowed: true, state: 'ready', requirements: [{ key: 'login', state: 'satisfied' }], terms: [{ id: 'spring', name: 'Spring semester', term_order_key: 2, enrolled: true }, { id: 'fall', name: 'Fall semester', term_order_key: 1, enrolled: true }], teachers: [{ id: 'teacher-a', enrolled: true }, { id: 'teacher-b', enrolled: true }], identity: 'choice', rule_version: 'fixture' } });
  });
  await page.goto(`http://127.0.0.1:18787/courses?lang=${locale}`);
  // The entry sits in the sub-navigation on wide screens and floats above the tab bar on phones.
  const entry = page.locator('header, .launcher-phone').getByRole('button', { name: a.subject.writeCourse, exact: true });

  // Without school data authorization no enrollment is read, and the way to turn it on is offered.
  await entry.click();
  let dialog = page.getByRole('dialog', { name: l.title, exact: true });
  await expect(dialog.getByText(l.needSchoolData, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: l.enable, exact: true })).toHaveAttribute('href', '/me/verification/school-data');
  await expect(dialog.getByRole('heading', { name: l.mine, exact: true })).toHaveCount(0);
  expect(enrollmentReads).toEqual([]);
  // Typing goes straight into the search.
  await expect(dialog.getByRole('searchbox', { name: l.search, exact: true })).toBeFocused();
  await page.keyboard.type('Test');
  await expect(dialog.getByRole('button', { name: /Test Course/ })).toBeVisible();
  await page.keyboard.press('Escape');

  authorization = { state: 'active', verified_at: '2026-11-26T00:00:00Z', authorized_through: { id: 'spring', year: 2026, season: 'spring' } };
  await entry.click();
  dialog = page.getByRole('dialog', { name: l.title, exact: true });
  await expect(dialog.getByRole('heading', { name: l.mine, exact: true })).toBeVisible();
  const rows = dialog.locator('.launcher-row');
  // Newest term first; the reviewed course carries its mark and opens the review.
  await expect(rows.nth(0)).toContainText('Teacher A');
  await expect(rows.nth(0)).toContainText('Teacher B');
  await expect(rows.nth(1)).toContainText(l.reviewed);
  await rows.nth(0).click();
  await expect(page).toHaveURL(/\/courses\/course(\?|$)/);
  const editor = page.locator('form').filter({ has: page.getByRole('heading', { name: a.editor.heading.course, exact: true }) });
  await expect(editor.locator('input[value="spring"]')).toBeChecked();
  await expect(editor.locator('input[value="teacher-a"]')).toBeChecked();
  await expect(editor.locator('input[value="teacher-b"]')).toBeChecked();
  // The launch parameters are dropped once the editor is open.
  await expect(page).not.toHaveURL(/write=/);
  expect(enrollmentReads.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
