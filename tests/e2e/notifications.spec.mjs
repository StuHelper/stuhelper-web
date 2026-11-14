import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
const isolate = (value) => `⁦${value}⁩`;
const note = (values) => ({ type: 'business', source_module: 'reviews', created_at: '2026-11-01T00:00:00Z', read_at: null, target_status: 'accessible', count: 1, ...values });

// Notifications server following the notifications contract. Reads and writes are recorded.
async function server(page, items) {
  const state = { items, preferences: { interaction_enabled: true }, writes: [] };
  await page.route('**/api/v1/notifications**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/notifications', '');
    if (request.method() === 'GET') {
      if (path === '') return route.fulfill({ json: { items: state.items, next_cursor: '' } });
      if (path === '/unread-count') return route.fulfill({ json: { count: state.items.filter((item) => !item.read_at).length } });
      if (path === '/preferences') return route.fulfill({ json: state.preferences });
    }
    state.writes.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : undefined });
    if (path === '/preferences') {
      state.preferences = request.postDataJSON();
      return route.fulfill({ json: state.preferences });
    }
    const read = /^\/([^/]+)\/read$/.exec(path);
    if (read) state.items = state.items.map((item) => (item.id === read[1] ? { ...item, read_at: '2026-11-08T00:00:00Z' } : item));
    if (path === '/read-all') state.items = state.items.map((item) => ({ ...item, read_at: item.read_at ?? '2026-11-08T00:00:00Z' }));
    return route.fulfill({ status: 204 });
  });
  return state;
}

test('notifications show catalog titles, mark one as read and open its page', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const state = await server(page, [
    note({ id: 'n2', type: 'interaction', target: { kind: 'review', id: 'rev-1' }, title_key: 'notifications.interaction.reply', title_params: { content_id: 'rev-1' }, count: 3 }),
    note({ id: 'n1', target: { kind: 'resource', id: 'res-9' }, title_key: 'notifications.content.removed', title_params: { content_id: 'res-9' }, target_status: 'inaccessible', read_at: '2026-11-02T00:00:00Z' }),
  ]);
  await page.route('**/api/v1/reviews/**', (route) => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  const lang = info.project.metadata.locale;
  await page.goto(`${base}/notifications?lang=${lang}`);
  await expect(page.getByText(fill(n.unread, { count: number(info, 1) }), { exact: true })).toBeVisible();
  // The center files notifications into boxes; the unread one shows on its box.
  const entries = page.getByRole('navigation', { name: n.boxesLabel, exact: true });
  await expect(entries.getByRole('link')).toHaveCount(3);
  await expect(entries.getByRole('link', { name: n.boxes.interaction })).toContainText(fill(n.unreadCount, { count: number(info, 1) }));
  await expect(entries.getByRole('link', { name: n.boxes.review })).not.toContainText(fill(n.unreadCount, { count: number(info, 1) }));

  await entries.getByRole('link', { name: n.boxes.review }).click();
  await expect(page).toHaveURL(/box=review/);
  await expect(page.getByRole('heading', { level: 1, name: n.boxes.review, exact: true })).toBeVisible();
  await expect(page.getByText(n.status.inaccessible, { exact: true })).toBeVisible();

  // An inaccessible target is marked read already and stays on this page.
  await page.getByRole('button', { name: fill(n.titles.content.removed, { content_id: isolate('res-9') }) }).click();
  await expect(page).toHaveURL(/\/notifications/);
  expect(state.writes).toEqual([]);

  await page.goto(`${base}/notifications?box=interaction&lang=${lang}`);
  await expect(page.getByText(fill(n.count, { count: number(info, 3) }), { exact: true })).toBeVisible();
  // Another box's notification is not listed here.
  await expect(page.getByRole('button', { name: fill(n.titles.content.removed, { content_id: isolate('res-9') }) })).toHaveCount(0);
  await page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: isolate('rev-1') }) }).click();
  await expect(page).toHaveURL(/\/reviews\/rev-1/);
  expect(state.writes).toEqual([{ method: 'POST', path: '/n2/read', body: undefined }]);
});

test('marking all as read and switching interaction notifications off', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const state = await server(page, [note({ id: 'n1', target: { kind: 'teacher_application', id: 'ta-1' }, title_key: 'notifications.teacher_verification.approved', title_params: { application_id: 'ta-1' } })]);
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: n.readAll, exact: true }).click();
  await expect(page.getByText(n.allRead, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: n.readAll, exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: n.interaction, exact: true }).uncheck();
  await expect(page.getByText(n.interactionOff, { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ method: 'POST', path: '/read-all', body: undefined }, { method: 'PUT', path: '/preferences', body: { interaction_enabled: false } }]);
});

test('an empty list explains that there are no notifications', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  await server(page, []);
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(n.empty, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: n.readAll, exact: true })).toBeDisabled();
});

test('system notices form a conversation with a preview and an unread count', async ({ page }, info) => {
  const n = catalogue(info).notifications, lang = info.project.metadata.locale;
  await server(page, [
    note({ id: 's2', type: 'security', source_module: 'platform', target: { kind: 'verification_operation', id: 'op-2' }, title_key: 'notifications.system.security', title_params: { reference_id: 'op-2' } }),
    note({ id: 's1', source_module: 'platform', target: { kind: 'verification_operation', id: 'op-1' }, title_key: 'notifications.system.notice', title_params: { reference_id: 'op-1' }, created_at: '2026-10-30T00:00:00Z' }),
    note({ id: 'v1', target: { kind: 'verification_application', id: 'app-1' }, title_key: 'notifications.student_verification.approved', title_params: { application_id: 'app-1' }, read_at: '2026-11-02T00:00:00Z' }),
  ]);
  await page.goto(`${base}/notifications?lang=${lang}`);
  const thread = page.getByRole('region', { name: n.threads, exact: true }).getByRole('link', { name: n.boxes.system });
  // The newest notice is the preview, and both unread notices are counted.
  await expect(thread).toContainText(fill(n.titles.system.security, { reference_id: isolate('op-2') }));
  await expect(thread).toContainText(fill(n.unreadCount, { count: number(info, 2) }));
  await thread.click();
  await expect(page).toHaveURL(/box=system/);
  await expect(page.getByRole('button', { name: fill(n.titles.system.notice, { reference_id: isolate('op-1') }) })).toBeVisible();
  // A verification result belongs to its own box.
  await expect(page.getByRole('button', { name: fill(n.titles.student_verification.approved, { application_id: isolate('app-1') }) })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an empty box keeps loading later pages that hold its notifications', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const common = catalogue(info).common;
  const first = [note({ id: 's1', target: { kind: 'teacher_application', id: 'ta-1' }, title_key: 'notifications.teacher_verification.approved', title_params: { application_id: 'ta-1' } })];
  const second = [note({ id: 'i1', type: 'interaction', target: { kind: 'review', id: 'rev-2' }, title_key: 'notifications.interaction.reply', title_params: { content_id: 'rev-2' } })];
  await page.route('**/api/v1/notifications**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1/notifications', '');
    if (path === '/unread-count') return route.fulfill({ json: { count: 2 } });
    if (path === '/preferences') return route.fulfill({ json: { interaction_enabled: true } });
    if (url.searchParams.get('cursor') === 'p2') return route.fulfill({ json: { items: second, next_cursor: '' } });
    return route.fulfill({ json: { items: first, next_cursor: 'p2' } });
  });
  await page.goto(`${base}/notifications?box=interaction&lang=${info.project.metadata.locale}`);
  // The first page has nothing for this box, but a later page does.
  await expect(page.getByText(n.empty, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: common.loadMore, exact: true }).click();
  await expect(page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: isolate('rev-2') }) })).toBeVisible();
  await expect(page.getByRole('button', { name: common.loadMore, exact: true })).toHaveCount(0);
});
