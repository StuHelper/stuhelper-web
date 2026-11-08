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
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(n.unread, { count: number(info, 1) }), { exact: true })).toBeVisible();
  await expect(page.getByText(fill(n.count, { count: number(info, 3) }), { exact: true })).toBeVisible();
  await expect(page.getByText(n.status.inaccessible, { exact: true })).toBeVisible();

  // An inaccessible target is marked read already and stays on this page.
  await page.getByRole('button', { name: fill(n.titles.content.removed, { content_id: isolate('res-9') }) }).click();
  await expect(page).toHaveURL(/\/notifications/);
  expect(state.writes).toEqual([]);

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
