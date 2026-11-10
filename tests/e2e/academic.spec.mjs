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
