import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
const isolate = (value) => `⁦${value}⁩`;
const named = (n, name) => fill(n.namedContent, { name: isolate(name) });
const note = (box, values) => ({
  box,
  notification: { type: 'business', source_module: 'reviews', created_at: '2026-11-01T00:00:00Z', read_at: null, target_status: 'accessible', count: 1, ...values },
});
const content = (id, name, state = 'available') => ({ content_id: id, content_name: name, content_name_state: state });
const boxes = ['interaction', 'review', 'verification', 'system'];
const types = ['interaction', 'business', 'security', 'account'];
const readAt = '2026-11-08T00:00:00Z';

// Delay the HTTP response after the fixture has applied the write or computed the count.
function delayedResponse() {
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  return {
    wait(request) { started.resolve(request); return gate.promise; },
    request: started.promise,
    release: gate.resolve,
  };
}

const unreadPair = () => [
  note('interaction', {
    id: 'i1', type: 'interaction', target: { kind: 'comment', id: 'comment-1' }, title_key: 'notifications.interaction.reply',
    title_params: { ...content('comment-1', 'Calculus review'), context_id: 'root-review-1' },
  }),
  note('verification', {
    id: 'v1', target: { kind: 'teacher_application', id: 'ta-1' }, title_key: 'notifications.teacher_verification.approved',
    title_params: { application_id: 'ta-1' },
  }),
];

// Notifications server following the notifications contract. Reads and writes are recorded.
async function server(page, items, pageSize = 30) {
  const state = { preferences: { reply_enabled: true, like_enabled: true }, lists: [], summary: undefined, writes: [] };
  await page.route('**/api/v1/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/notifications', '');
    const method = request.method();
    const box = url.searchParams.get('box');
    const inBox = ({ box: itemBox }) => !box || itemBox === box;
    if (method === 'GET') {
      if (path === '') {
        const cursor = url.searchParams.get('cursor');
        state.lists.push({ box, cursor });
        const selected = items.filter(inBox);
        const offset = cursor ? Number(cursor) : 0;
        const end = offset + pageSize;
        return route.fulfill({ json: {
          items: selected.slice(offset, end).map(({ notification }) => notification),
          next_cursor: end < selected.length ? String(end) : '',
        } });
      }
      if (path === '/unread-count') {
        const unread = items.filter(({ notification }) => !notification.read_at);
        const summary = {
          count: unread.length,
          by_box: Object.fromEntries(boxes.map((key) => [key, unread.filter((item) => item.box === key).length])),
          by_type: Object.fromEntries(types.map((key) => [key, unread.filter(({ notification }) => notification.type === key).length])),
        };
        state.summary = summary;
        await state.beforeSummaryResponse?.(request);
        return route.fulfill({ json: summary });
      }
      if (path === '/preferences') return route.fulfill({ json: state.preferences });
    }
    const body = request.postData() ? request.postDataJSON() : undefined;
    state.writes.push({ method, path, box, body });
    if (method === 'PUT' && path === '/preferences') {
      state.preferences = { ...state.preferences, ...body };
      return route.fulfill({ json: state.preferences });
    }
    const read = /^\/([^/]+)\/read$/.exec(path);
    if (method === 'POST' && read) {
      const item = items.find(({ notification }) => notification.id === read[1]);
      if (item) {
        item.notification.read_at ??= readAt;
        return route.fulfill({ status: 204 });
      }
    }
    if (method === 'POST' && path === '/read-all') {
      for (const { notification } of items.filter(inBox)) notification.read_at ??= readAt;
      await state.beforeReadAllResponse?.(request);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return state;
}

test('notifications show localized reasons and open a comment’s root review', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const state = await server(page, [
    note('interaction', {
      id: 'n2', type: 'interaction', target: { kind: 'comment', id: 'comment-1' }, title_key: 'notifications.interaction.reply',
      title_params: { ...content('comment-1', 'Calculus review'), context_id: 'root-review-1' }, count: 3,
    }),
    note('review', {
      id: 'n1', target: { kind: 'resource', id: 'res-9' }, title_key: 'notifications.content.removed',
      title_params: { ...content('res-9', '', 'inaccessible'), reason_code: 'community_guidelines' },
      target_status: 'inaccessible', read_at: '2026-11-02T00:00:00Z',
    }),
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
  const removed = page.getByRole('button', { name: fill(n.titles.content.removed, { content_id: n.contentUnavailable }) });
  await expect(removed.getByText(n.status.inaccessible, { exact: true })).toBeVisible();
  await expect(removed.getByText(fill(n.reason, { reason: n.reasons.community_guidelines }), { exact: true })).toBeVisible();

  // An inaccessible target is marked read already and stays on this page.
  await removed.click();
  await expect(page).toHaveURL(/\/notifications\?box=review$/);
  expect(state.writes).toEqual([]);

  await page.goto(`${base}/notifications?box=interaction&lang=${lang}`);
  await expect(page.getByText(fill(n.count, { count: number(info, 3) }), { exact: true })).toBeVisible();
  await expect(removed).toHaveCount(0);
  expect(state.lists).toEqual([{ box: 'system', cursor: null }, { box: 'review', cursor: null }, { box: 'interaction', cursor: null }]);
  await page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: named(n, 'Calculus review') }) }).click();
  await expect(page).toHaveURL(/\/reviews\/root-review-1$/);
  expect(state.writes).toEqual([{ method: 'POST', path: '/n2/read', box: null, body: undefined }]);
});

test('an approved teacher homepage notification opens the teacher’s own request receipt', async ({ page }, info) => {
  const { notifications: n, teacherHomepage: h } = catalogue(info);
  const notificationId = '00000000-0000-4000-8000-000000000002';
  const receipt = {
    id: '00000000-0000-4000-8000-000000000003', teacher_id: 'teacher-a', kind: 'correction', status: 'approved', revision: 2,
    field: { field: 'biography' }, value: { text: 'Updated faculty biography.' }, message: 'My faculty biography has changed.',
    created_at: '2026-11-01T00:00:00Z', resolved_at: '2026-11-02T00:00:00Z', resolution_note: 'We published the corrected biography.',
  };
  const state = await server(page, [note('review', {
    id: notificationId, source_module: 'catalog', target: { kind: 'teacher_homepage_request', id: receipt.id },
    title_key: 'notifications.teacher_homepage_request.approved', title_params: { request_id: receipt.id },
  })]);
  await page.route('**/api/v1/catalog/objects?kind=school&**', route => route.fulfill({ json: {
    items: [{ id: 'school', kind: 'school', name: 'Test University', school_id: 'school', credits: null, aliases: [], revision: 1, updated_at: receipt.created_at }], next: '',
  } }));
  const receiptApi = `/api/v1/catalog/me/teacher-homepage/requests/${receipt.id}`;
  const receiptReads = [];
  await page.route('**/api/v1/catalog/me/teacher-homepage/requests/*', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    receiptReads.push({ method: request.method(), path });
    return path === receiptApi ? route.fulfill({ json: receipt }) : route.fulfill({ status: 404, json: { code: 'not_found' } });
  });

  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  const entries = page.getByRole('navigation', { name: n.boxesLabel, exact: true });
  await entries.getByRole('link', { name: n.boxes.review }).click();
  await page.getByRole('button', { name: n.titles.teacher_homepage_request.approved }).click();
  await expect(page).toHaveURL(`${base}/me/teacher-homepage/requests/${receipt.id}`);
  await expect(page.getByRole('heading', { level: 1, name: h.receipt.title, exact: true })).toBeVisible();
  const detail = page.getByRole('article');
  await expect(detail.getByText(h.request.status.approved, { exact: true })).toBeVisible();
  await expect(detail.getByText(receipt.value.text, { exact: true })).toBeVisible();
  await expect(detail.getByText(receipt.message, { exact: true })).toBeVisible();
  await expect(detail.getByText(receipt.resolution_note, { exact: true })).toBeVisible();
  expect(receiptReads).toEqual([{ method: 'GET', path: receiptApi }]);
  expect(state.writes).toEqual([{ method: 'POST', path: `/${notificationId}/read`, box: null, body: undefined }]);
});

test('reply and like preferences are saved independently', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const state = await server(page, []);
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  const reply = page.getByRole('checkbox', { name: n.preferences.reply_enabled.label, exact: true });
  const like = page.getByRole('checkbox', { name: n.preferences.like_enabled.label, exact: true });
  await reply.uncheck();
  await expect(page.getByText(n.preferences.reply_enabled.off, { exact: true })).toBeVisible();
  await expect(reply).not.toBeChecked();
  await expect(like).toBeChecked();
  await like.uncheck();
  await expect(page.getByText(n.preferences.like_enabled.off, { exact: true })).toBeVisible();
  await expect(reply).not.toBeChecked();
  await expect(like).not.toBeChecked();
  expect(state.preferences).toEqual({ reply_enabled: false, like_enabled: false });
  expect(state.writes).toEqual([
    { method: 'PUT', path: '/preferences', box: null, body: { reply_enabled: false } },
    { method: 'PUT', path: '/preferences', box: null, body: { like_enabled: false } },
  ]);
});

test('an empty list explains that there are no notifications', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  await server(page, []);
  await page.goto(`${base}/notifications?box=review&lang=${info.project.metadata.locale}`);
  await expect(page.getByText(n.empty, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: n.readAll, exact: true })).toBeDisabled();
});

test('system notices form a conversation with a preview and an unread count', async ({ page }, info) => {
  const n = catalogue(info).notifications, lang = info.project.metadata.locale;
  await server(page, [
    note('system', { id: 's2', type: 'security', source_module: 'platform', target: { kind: 'verification_operation', id: 'op-2' }, title_key: 'notifications.system.security', title_params: { reference_id: 'op-2' } }),
    note('system', { id: 's1', source_module: 'platform', target: { kind: 'verification_operation', id: 'op-1' }, title_key: 'notifications.system.notice', title_params: { reference_id: 'op-1' }, created_at: '2026-10-30T00:00:00Z' }),
    note('verification', { id: 'v1', target: { kind: 'verification_application', id: 'app-1' }, title_key: 'notifications.student_verification.approved', title_params: { application_id: 'app-1' }, read_at: '2026-11-02T00:00:00Z' }),
  ]);
  await page.goto(`${base}/notifications?lang=${lang}`);
  const thread = page.getByRole('region', { name: n.threads, exact: true }).getByRole('link', { name: n.boxes.system });
  // The newest notice is the preview, and both unread notices are counted.
  await expect(thread).toContainText(n.titles.systemPlain.security);
  await expect(thread).toContainText(fill(n.unreadCount, { count: number(info, 2) }));
  await thread.click();
  await expect(page).toHaveURL(/box=system/);
  await expect(page.getByRole('button', { name: n.titles.systemPlain.notice })).toBeVisible();
  // A verification result belongs to its own box.
  await expect(page.getByRole('button', { name: fill(n.titles.student_verification.approved, { application_id: isolate('app-1') }) })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a box loads its own pages and marks only that box as read', async ({ page }, info) => {
  const { notifications: n, common } = catalogue(info);
  const items = [
    note('interaction', { id: 'i2', type: 'interaction', target: { kind: 'review', id: 'rev-2' }, title_key: 'notifications.interaction.reply', title_params: content('rev-2', 'Calculus review') }),
    note('verification', { id: 'v1', target: { kind: 'teacher_application', id: 'ta-1' }, title_key: 'notifications.teacher_verification.approved', title_params: { application_id: 'ta-1' } }),
    note('interaction', { id: 'i1', type: 'interaction', target: { kind: 'review', id: 'rev-1' }, title_key: 'notifications.interaction.like', title_params: content('rev-1', 'Physics review') }),
  ];
  const state = await server(page, items, 1);
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  const entries = page.getByRole('navigation', { name: n.boxesLabel, exact: true });
  const interaction = entries.getByRole('link', { name: n.boxes.interaction });
  await expect(interaction).toContainText(fill(n.unreadCount, { count: number(info, 2) }));
  await interaction.click();

  const first = page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: named(n, 'Calculus review') }) });
  const second = page.getByRole('button', { name: fill(n.titles.interaction.like, { content_id: named(n, 'Physics review') }) });
  const more = page.getByRole('button', { name: common.loadMore, exact: true });
  await expect(first).toBeVisible();
  await expect(second).toHaveCount(0);
  await more.click();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(state.lists).toEqual([{ box: 'system', cursor: null }, { box: 'interaction', cursor: null }, { box: 'interaction', cursor: '1' }]);

  const readAll = page.getByRole('button', { name: n.readAll, exact: true });
  await readAll.click();
  await expect(page.getByText(n.allRead, { exact: true })).toBeVisible();
  await expect(readAll).toBeDisabled();
  expect(state.writes).toEqual([{ method: 'POST', path: '/read-all', box: 'interaction', body: undefined }]);
  expect(items.map(({ notification }) => notification.read_at)).toEqual([readAt, null, readAt]);
  expect(state.summary).toEqual({
    count: 1,
    by_box: { interaction: 0, review: 0, verification: 1, system: 0 },
    by_type: { interaction: 0, business: 1, security: 0, account: 0 },
  });
  await expect(page.locator('header a[href="/notifications"] .d-unread')).toHaveText(number(info, 1));
});

test('the navigation bell shows the unread count on every page and follows the message center', async ({ page }, info) => {
  const n = catalogue(info).notifications, locale = info.project.metadata.locale;
  const state = await server(page, [
    note('interaction', { id: 'n2', type: 'interaction', target: { kind: 'review', id: 'rev-1' }, title_key: 'notifications.interaction.reply', title_params: content('rev-1', 'Calculus review') }),
    note('review', { id: 'n1', target: { kind: 'resource', id: 'res-9' }, title_key: 'notifications.content.removed', title_params: content('res-9', '', 'inaccessible'), target_status: 'inaccessible' }),
  ]);
  const counts = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.endsWith('/notifications/unread-count')) counts.push(request.url()); });
  // The bell is part of the navigation, so a personal page outside the message center shows it too.
  await page.goto(`${base}/me/account?lang=${locale}`);
  const bell = page.getByRole('link', { name: fill(n.unread, { count: number(info, 2) }), exact: true });
  await expect(bell).toHaveAttribute('href', '/notifications');
  await expect(bell).toContainText(number(info, 2));
  expect(counts).toHaveLength(1);
  await bell.click();
  await expect(page).toHaveURL(/\/notifications/);
  await page.getByRole('button', { name: n.readAll, exact: true }).click();
  // With nothing unread the bell keeps its plain name and shows no number.
  await expect(page.locator('header a[href="/notifications"]')).toHaveAccessibleName(n.link);
  await expect(page.locator('header a[href="/notifications"] .d-unread')).toHaveCount(0);
  expect(state.writes).toEqual([{ method: 'POST', path: '/read-all', box: null, body: undefined }]);
});

test('opening a comment updates the bell before the unread count returns', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const items = unreadPair();
  const state = await server(page, items);
  await page.route('**/api/v1/reviews/**', route => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.goto(`${base}/notifications?box=interaction&lang=${info.project.metadata.locale}`);
  const badge = page.locator('header a[href="/notifications"] .d-unread');
  await expect(badge).toHaveText(number(info, 2));
  await expect(page.getByRole('button', { name: n.readAll, exact: true })).toBeEnabled();
  const summary = delayedResponse();
  state.beforeSummaryResponse = summary.wait;
  try {
    await page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: named(n, 'Calculus review') }) }).click();
    await summary.request;
    await expect(page).toHaveURL(/\/reviews\/root-review-1$/);
    await expect(badge).toHaveText(number(info, 1));
    expect(state.writes).toEqual([{ method: 'POST', path: '/i1/read', box: null, body: undefined }]);
    expect(items.map(({ notification }) => notification.read_at)).toEqual([readAt, null]);
    expect(state.summary.count).toBe(1);
  } finally {
    summary.release();
  }
});

test('opening a comment uses the known bell count while the first inbox summary is pending', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const items = unreadPair();
  const state = await server(page, items);
  await page.route('**/api/v1/reviews/**', route => route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const bell = page.getByRole('link', { name: fill(n.unread, { count: number(info, 2) }), exact: true });
  await expect(bell).toBeVisible();
  const summary = delayedResponse();
  state.beforeSummaryResponse = summary.wait;
  try {
    await bell.click();
    await summary.request;
    await page.getByRole('navigation', { name: n.boxesLabel }).getByRole('link', { name: n.boxes.interaction }).click();
    await page.getByRole('button', { name: fill(n.titles.interaction.reply, { content_id: named(n, 'Calculus review') }) }).click();
    await expect(page).toHaveURL(/\/reviews\/root-review-1$/);
    await expect(page.locator('header a[href="/notifications"] .d-unread')).toHaveText(number(info, 1));
    expect(items.map(({ notification }) => notification.read_at)).toEqual([readAt, null]);
  } finally {
    summary.release();
  }
});

test('a late mark-all response keeps the new box unread', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const items = unreadPair();
  const state = await server(page, items);
  await page.goto(`${base}/notifications?box=interaction&lang=${info.project.metadata.locale}`);
  const bulk = delayedResponse();
  state.beforeReadAllResponse = bulk.wait;
  const readAll = page.getByRole('button', { name: n.readAll, exact: true });
  const verification = page.getByRole('button', { name: fill(n.titles.teacher_verification.approved, { application_id: isolate('ta-1') }) });
  const unreadMark = verification.getByText(n.unreadMark, { exact: true });
  try {
    await readAll.click();
    const request = await bulk.request;
    expect(new URL(request.url()).searchParams.get('box')).toBe('interaction');
    expect(items.map(({ notification }) => notification.read_at)).toEqual([readAt, null]);
    await page.locator('.page-back').getByText(n.title, { exact: true }).click();
    await page.getByRole('navigation', { name: n.boxesLabel }).getByRole('link', { name: n.boxes.verification }).click();
    await expect(verification).toBeVisible();
    await expect(unreadMark).toHaveCount(1);
  } finally {
    bulk.release();
  }
  await expect(page.getByText(n.allRead, { exact: true })).toBeVisible();
  await expect(unreadMark).toHaveCount(1);
  await expect(readAll).toBeEnabled();
  expect(state.summary.by_box.verification).toBe(1);
  expect(state.writes).toEqual([{ method: 'POST', path: '/read-all', box: 'interaction', body: undefined }]);
  expect(items.map(({ notification }) => notification.read_at)).toEqual([readAt, null]);
});

test('a failed unread count leaves the bell without a number and breaks nothing', async ({ page }, info) => {
  const n = catalogue(info).notifications, errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/notifications/unread-count', (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  await expect(page.locator('header a[href="/notifications"]')).toHaveAccessibleName(n.link);
  await expect(page.locator('header a[href="/notifications"] .d-unread')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a rejected preference change restores the saved switch state', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const state = await server(page, []);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const attempts = [];
  await page.route('**/api/v1/notifications/preferences', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    attempts.push(route.request().postDataJSON());
    await pending;
    return route.fulfill({ status: 503, json: { code: 'unavailable' } });
  });
  await page.goto(`${base}/notifications?lang=${info.project.metadata.locale}`);
  const toggle = page.getByRole('checkbox', { name: n.preferences.reply_enabled.label, exact: true });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).toBeDisabled();
  await expect.poll(() => attempts).toEqual([{ reply_enabled: false }]);
  release();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('checkbox', { name: n.preferences.like_enabled.label, exact: true })).toBeChecked();
  expect(state.preferences).toEqual({ reply_enabled: true, like_enabled: true });
});

test('opening an unread notification twice changes the count only once', async ({ page }, info) => {
  const n = catalogue(info).notifications;
  const entries = ['one', 'two'].map(id => note('review', { id, target: { kind: 'resource', id }, title_key: 'notifications.content.removed', title_params: content(id, '', 'inaccessible'), target_status: 'inaccessible' }));
  const state = await server(page, entries);
  let release, requests = 0;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/notifications/one/read', async route => {
    requests++;
    await pending;
    return route.fallback();
  });
  await page.goto(`${base}/notifications?box=review&lang=${info.project.metadata.locale}`);
  const row = page.getByRole('button', { name: fill(n.titles.content.removed, { content_id: n.contentUnavailable }) }).first();
  await row.dispatchEvent('click');
  await row.dispatchEvent('click');
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page.locator('header a[href="/notifications"] .d-unread')).toHaveText(number(info, 1));
  expect(entries.map(({ notification }) => notification.read_at)).toEqual([readAt, null]);
  await expect.poll(() => state.summary?.count).toBe(1);
  expect(requests).toBe(1);
});
