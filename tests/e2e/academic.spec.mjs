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
    if (url.pathname === '/api/v1/catalog/objects' && url.searchParams.get('kind') === 'course') listCalls.push(url.searchParams.get('department_id'));
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
    if (url.pathname === '/api/v1/catalog/objects') kinds.push(url.searchParams.get('kind'));
  });
  await page.goto(`http://127.0.0.1:18787/teachers?lang=${info.project.metadata.locale}`);
  await expect(page).toHaveURL(/\/teachers(\?|$)/);
  await expect(page.getByRole('link', { name: /Teacher A/ }).first()).toBeVisible();
  expect(kinds).toContain('teacher');
});

test('course and teacher directories keep filters independent across navigation', async ({ page }, info) => {
  await academicFixture(page);
  const messages = catalogue(info), calls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/catalog/objects' && ['course', 'teacher'].includes(url.searchParams.get('kind'))) {
      calls.push({ kind: url.searchParams.get('kind'), q: url.searchParams.get('q'), department: url.searchParams.get('department_id') });
    }
  });
  const form = page.getByRole('search');
  const search = form.getByRole('searchbox');
  const submit = () => form.getByRole('button', { name: messages.common.search, exact: true }).click();
  const navigate = (route) => page.locator(`a[href="${route}"]:visible`).first().click();
  await page.goto(`http://127.0.0.1:18787/courses?lang=${info.project.metadata.locale}#q=Course&department=dept`);
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: 'Course', department: 'dept' });
  await navigate('/teachers');
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: null, department: null });
  await search.fill('Teacher');
  await submit();
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher', department: null });
  const department = form.getByRole('combobox').first();
  if (!await department.isVisible()) await form.getByRole('button', { name: messages.common.filters, exact: true }).click();
  await department.click();
  await page.getByRole('option', { name: 'Test College', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher', department: 'dept' });
  await form.getByRole('button', { name: messages.common.clearFilters, exact: true }).click();
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: null, department: null });
  await search.fill('Teacher retained');
  await submit();
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'teacher', q: 'Teacher retained', department: null });
  await navigate('/courses');
  await expect(search).toHaveValue('');
  await expect.poll(() => calls.at(-1)).toEqual({ kind: 'course', q: null, department: null });
  await search.fill('Fresh course');
  await submit();
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
