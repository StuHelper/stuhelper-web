import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { expect, memberTest } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
const item = (kind, id, title, source = 'catalog') => ({ target: { source, id, kind }, title, school_id: 'school' });

// Search server following the search contract; every query string is recorded.
async function searchServer(page, pages) {
  const seen = [];
  await page.route('**/api/v1/search**', (route) => {
    const url = new URL(route.request().url());
    seen.push(`${url.pathname}${url.search}`);
    const respond = pages[url.pathname] ?? (() => ({ items: [], next_cursor: '' }));
    return route.fulfill({ json: respond(url.searchParams) });
  });
  return seen;
}

memberTest('the search palette finds a course and opens it with the keyboard', async ({ page }, info) => {
  const s = catalogue(info).search;
  await academicFixture(page);
  const seen = await searchServer(page, { '/api/v1/search': (q) => ({ items: q.get('q') === 'Test' ? [item('course', 'course', 'Test Course'), item('review', 'review', 'A student review', 'reviews')] : [], next_cursor: '' }) });
  await page.goto(`${base}/campus?lang=${info.project.metadata.locale}`);
  // The shortcut is registered when the layout mounts, after the language catalog loads.
  await expect(page.getByRole('button', { name: s.open, exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: s.title });
  await input.fill('Test');
  await expect(page.getByRole('option', { name: /Test Course/ })).toBeVisible();
  // Typing is debounced into a single request.
  expect(seen.filter((entry) => entry.startsWith('/api/v1/search?'))).toEqual(['/api/v1/search?q=Test&limit=8']);
  await input.press('Enter');
  await expect(page).toHaveURL(/\/courses\/course(\?|$)/);
});

memberTest('the results page keeps the query in the address and filters by type', async ({ page }, info) => {
  const s = catalogue(info).search;
  await academicFixture(page);
  const seen = await searchServer(page, { '/api/v1/search': (q) => (q.get('cursor') ? { items: [item('teacher', 'teacher-b', 'Teacher B')], next_cursor: '' } : { items: [item('teacher', 'teacher-a', 'Teacher A')], next_cursor: 'c2' }) });
  await page.goto(`${base}/search?q=Teacher&lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: /Teacher A/ })).toBeVisible();
  await page.getByRole('button', { name: catalogue(info).common.loadMore }).click();
  await expect(page.getByRole('link', { name: /Teacher B/ })).toBeVisible();
  await page.getByRole('tab', { name: s.kinds.teacher, exact: true }).click();
  await expect(page).toHaveURL(/kind=teacher/);
  await expect.poll(() => seen.at(-1)).toBe('/api/v1/search?q=Teacher&kind=teacher&limit=20');
});

memberTest('popular lists switch between courses and teachers', async ({ page }, info) => {
  const s = catalogue(info).search;
  await academicFixture(page);
  const seen = await searchServer(page, { '/api/v1/search/popular': (q) => ({ items: q.get('kind') === 'teacher' ? [item('teacher', 'teacher-a', 'Teacher A')] : [item('course', 'course', 'Test Course')], next_cursor: '' }) });
  await page.goto(`${base}/popular?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: /Test Course/ })).toBeVisible();
  await page.getByRole('tab', { name: s.popular.teachers, exact: true }).click();
  await expect(page.getByRole('link', { name: /Teacher A/ })).toHaveAttribute('href', '/teachers/teacher-a');
  expect(seen).toEqual(['/api/v1/search/popular?kind=course&limit=20', '/api/v1/search/popular?kind=teacher&limit=20']);
});

memberTest('my votes show each choice and lead back to the review', async ({ page }, info) => {
  const s = catalogue(info).search;
  await page.route('**/api/v1/reviews/me/references**', (route) => route.fulfill({ json: { items: [{ id: 'rev-1', kind: 'review', name: 'Great lab course' }], missing_ids: ['rev-2'] } }));
  await searchServer(page, { '/api/v1/search/my-votes': () => ({ items: [{ target: { source: 'reviews', id: 'rev-1', kind: 'review' }, choice: 'up' }, { target: { source: 'reviews', id: 'rev-2', kind: 'review' }, choice: 'down' }], next_cursor: '' }) });
  await page.goto(`${base}/me/votes?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: new RegExp(`Great lab course.*${s.votes.up}`) })).toHaveAttribute('href', '/reviews/rev-1');
  await expect(page.getByRole('link', { name: new RegExp(`${s.votes.review}.*${s.votes.down}`) })).toHaveAttribute('href', '/reviews/rev-2');
});

memberTest('two teachers added from their pages are compared over one time range', async ({ page }, info) => {
  const all = catalogue(info); const c = all.search.compare;
  await academicFixture(page);
  const stats = [];
  page.on('request', (request) => { if (request.url().includes('/api/v1/reviews/statistics')) stats.push(new URL(request.url()).searchParams); });
  await page.goto(`${base}/teachers/teacher-a?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: c.add, exact: true }).click();
  await expect(page.getByRole('region', { name: c.tray })).toContainText(c.pickMore);
  await page.goto(`${base}/teachers/teacher-b?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: c.add, exact: true }).click();
  await expect(page.getByRole('button', { name: c.added, exact: true })).toHaveAttribute('aria-pressed', 'true');
  // The campus sub-navigation also links to the comparison page; the button in the tray is meant here.
  await page.getByRole('region', { name: c.tray }).getByRole('link', { name: c.start, exact: true }).click();
  await expect(page).toHaveURL(/\/compare\?kind=teacher/);
  await expect(page.getByRole('columnheader', { name: /Teacher A/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Teacher B/ })).toBeVisible();
  await expect.poll(() => stats.filter((query) => query.get('kind') === 'teacher').map((query) => query.get('target_id')).slice(-2).sort()).toEqual(['teacher-a', 'teacher-b']);
  await expect(page.getByRole('cell', { name: fill(all.academic.ratings.samplesOnly, { samples: number(info, 2) }) })).toHaveCount(2);

  await page.getByRole('button', { name: fill(c.remove, { name: 'Teacher A' }) }).click();
  await expect(page.getByRole('columnheader', { name: /Teacher A/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: fill(c.teachers, { count: number(info, 1) }), exact: true })).toBeVisible();
});
