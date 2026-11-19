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

memberTest('the results page filters by type and keeps the query out of the address', async ({ page }, info) => {
  const s = catalogue(info).search;
  await academicFixture(page);
  const seen = await searchServer(page, { '/api/v1/search': (q) => (q.get('cursor') ? { items: [item('teacher', 'teacher-b', 'Teacher B')], next_cursor: '' } : { items: [item('teacher', 'teacher-a', 'Teacher A')], next_cursor: 'c2' }) });
  await page.goto(`${base}/search?q=Teacher&lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: /Teacher A/ })).toBeVisible();
  await page.getByRole('button', { name: catalogue(info).common.loadMore }).click();
  await expect(page.getByRole('link', { name: /Teacher B/ })).toBeVisible();
  await page.getByRole('tab', { name: s.kinds.teacher, exact: true }).click();
  await expect.poll(() => seen.at(-1)).toBe('/api/v1/search?q=Teacher&kind=teacher&limit=20');
  expect(new URL(page.url()).searchParams.has('kind')).toBe(false);
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

memberTest('comparison page adds courses from in-page search, shows summary facts without class queries, and clears in one click', async ({ page }, info) => {
  const all = catalogue(info), c = all.search.compare, seenKinds = [];
  await academicFixture(page, { course: { credits: 3 } });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/catalog/objects') seenKinds.push(url.searchParams.get('kind'));
  });
  await page.goto(`${base}/compare?lang=${info.project.metadata.locale}`);
  const picker = page.getByRole('region', { name: c.addCourse, exact: true });
  await picker.getByRole('searchbox').fill('Test');
  await picker.getByRole('button', { name: c.add, exact: true }).click();

  await expect(page.getByRole('columnheader', { name: /Test Course/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Test College', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: number(info, 3), exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Test Seminar/ })).toBeVisible();
  await expect(page.getByRole('cell').getByRole('link', { name: 'Teacher A', exact: true })).toBeVisible();
  expect(seenKinds.filter((k) => ['term_course', 'class', 'schedule', 'assignment'].includes(k ?? ''))).toEqual([]);

  await page.getByRole('button', { name: c.clear, exact: true }).click();
  await expect(page.getByRole('heading', { name: c.emptyTitle, exact: true })).toBeVisible();
});

memberTest('a member without campus access withdraws a selected review vote on the personal votes page', async ({ page }, info) => {
  const all = catalogue(info);
  await academicFixture(page);
  await page.route('**/api/v1/verification/summary', route => route.fulfill({ json: {
    campus_eligibility: false, teacher_verified: false, identity_verified: false,
    evaluated_at: '2026-11-01T00:00:00Z', revision: 1, next_evaluation_at: null,
  } }));
  let votes = ['keep', 'withdraw'].map(id => ({ target: { source: 'reviews', id, kind: 'review' }, choice: 'up' }));
  const writes = [];
  await searchServer(page, { '/api/v1/search/my-votes': () => ({ items: votes, next_cursor: '' }) });
  await page.route('**/api/v1/reviews/me/references?**', route => route.fulfill({ json: {
    items: votes.map(({ target }) => ({ id: target.id, kind: 'review', name: target.id })), missing_ids: [],
  } }));
  await page.route('**/api/v1/reviews/withdraw/actions', route => {
    const req = route.request();
    writes.push({ key: req.headers()['idempotency-key'], body: req.postDataJSON() });
    if (writes.length === 1) {
      votes = votes.filter(vote => vote.target.id !== 'withdraw');
      return route.abort();
    }
    return route.fulfill({ json: { id: 'withdraw', state: 'published', revision: 2 } });
  });
  await page.goto(`${base}/me/votes?lang=${info.project.metadata.locale}`);
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /withdraw/ }) });
  await row.getByRole('button', { name: all.search.votes.cancel }).click();
  await page.getByRole('button', { name: all.common.retryOriginal }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('link', { name: /keep/ })).toBeVisible();
  expect(votes.map(vote => vote.target.id)).toEqual(['keep']);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ key: expect.any(String), body: { action: 'vote', vote: 0 } });
});
