import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { fixture as academicFixture } from './academic-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);

test('my-reviews covers own entries, withdrawn countdown, uncertain draft delete retry and moderation appeals', async ({ page }, info) => {
  const all = catalogue(info);
  const locale = info.project.metadata.locale;
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
  await academicFixture(page);

  const pendingEntry = {
    id: 'own-pending',
    root_id: 'own-pending',
    kind: 'course',
    school_id: 'school',
    target_id: 'course',
    term_id: 'fall',
    title: 'Pending own review',
    body: 'Waiting for moderation.',
    ratings: [4, 4, 3, 3, 4],
    author: { anonymous: true, handle: 'author' },
    revision: 1,
    published_at: '2026-11-18T11:00:00Z',
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    mine: true,
    state: 'pending',
    can_edit: false,
  };
  let drafts = [
    {
      id: 'draft-withdrawn',
      revision: 2,
      input: { kind: 'course', target_id: 'course', term_id: 'fall', teacher_id: 'teacher-a', title: 'Withdrawn draft', body: 'Rewriting within 24h', ratings: [4, 4, 3, 3, 4], signed: false },
      expires_at: '2026-11-18T14:30:00Z',
      withdrawn: true,
      reference_ids: ['course'],
      reference_state: 'verified',
    },
    {
      id: 'draft-normal',
      revision: 1,
      input: { kind: 'course', target_id: 'course', term_id: 'fall', teacher_id: 'teacher-a', title: 'Normal draft', body: 'Scratch notes', ratings: [3, 3, 3, 3, 3], signed: false },
      withdrawn: false,
      reference_ids: ['course'],
      reference_state: 'verified',
    },
  ];
  const task = {
    id: 'task-1',
    school_id: 'school',
    content_kind: 'review',
    submission: { object_id: 'own-pending', kind: 'edit_request', reason: 'Fix typo', evidence: [] },
    object_revision: 1,
    revision: 2,
    state: 'rejected',
    can_appeal: true,
    decision: { id: 'dec-1', object_id: 'own-pending', revision: 1, action: 'dismiss', reason: 'Need clearer reason' },
    created_at: '2026-11-18T09:00:00Z',
    updated_at: '2026-11-18T10:00:00Z',
  };
  const writes = [];
  let dropDeleteOnce = true;

  await page.route('**/api/v1/reviews/me/references**', (route) => route.fulfill({ json: { items: [{ id: 'course', kind: 'course', name: 'Test Course' }, { id: 'fall', kind: 'term', name: 'Fall semester' }], missing_ids: [] } }));
  await page.route('**/api/v1/reviews/me/entries**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/own-pending')) return route.fulfill({ json: pendingEntry });
    return route.fulfill({ json: { items: [pendingEntry], next: '' } });
  });
  await page.route('**/api/v1/reviews/me/drafts**', (route) => {
    if (route.request().method() === 'DELETE') {
      writes.push({ method: 'DELETE', key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      if (dropDeleteOnce) {
        dropDeleteOnce = false;
        return route.abort('failed');
      }
      drafts = drafts.filter((d) => d.id !== 'draft-normal');
      return route.fulfill({ json: { id: 'draft-normal', state: 'deleted', revision: 2 } });
    }
    return route.fulfill({ json: drafts });
  });
  await page.route('**/api/v1/moderation/tasks**', (route) => {
    if (route.request().method() === 'POST') {
      writes.push({ method: 'POST', key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      return route.fulfill({ json: { ...task, id: 'task-appeal', state: 'waiting', can_appeal: false } });
    }
    return route.fulfill({ json: [task] });
  });

  await page.goto(`${base}/me/reviews?lang=${locale}`);
  await expect(page.getByText('Pending own review', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Pending own review', exact: true }).click();
  await expect(page).toHaveURL(/\/me\/reviews\/entries\/own-pending/);
  await expect(page.getByRole('heading', { name: all.me.ownEntry, exact: true })).toBeVisible();
  await page.getByRole('link', { name: all.me.backToReviews, exact: true }).click();

  await page.getByRole('tab', { name: all.me.reviewTabs.drafts, exact: true }).click();
  const fmt = new Intl.NumberFormat(locale);
  await expect(page.getByText(fill(all.academic.editor.remaining, { hours: fmt.format(2), minutes: fmt.format(30) }), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: all.me.deleteDraft, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: all.common.confirm, exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('alert')).toContainText(all.common.uncertain);
  await expect(confirmation.getByRole('button', { name: all.common.cancel, exact: true })).toBeDisabled();
  await confirmation.getByRole('button', { name: all.common.retryOriginal, exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText('Normal draft', { exact: true })).toHaveCount(0);
  const deletes = writes.filter((w) => w.method === 'DELETE');
  expect(deletes).toHaveLength(2);
  expect(deletes[0].key).toBe(deletes[1].key);

  await page.getByRole('tab', { name: all.me.reviewTabs.requests, exact: true }).click();
  await expect(page.getByText(fill(all.me.decisionReason, { reason: 'Need clearer reason' }), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: all.me.appeal, exact: true }).click();
  await page.getByRole('dialog').getByLabel(all.academic.review.reason, { exact: true }).fill('Clarified semester details');
  await page.getByRole('dialog').getByRole('button', { name: all.common.submit, exact: true }).click();
  await expect(page.getByText(all.academic.review.requestSent, { exact: true })).toBeVisible();
  expect(writes.find((w) => w.method === 'POST')?.body).toEqual({
    object_id: 'own-pending',
    previous_task_id: 'task-1',
    kind: 'appeal',
    reason: 'Clarified semester details',
    evidence: [],
  });
});

test('discussion view redirects reply deep links, targets a reply and posts a response', async ({ page }, info) => {
  const all = catalogue(info);
  const locale = info.project.metadata.locale;
  await academicFixture(page);

  const rootReview = {
    id: 'root-rev',
    root_id: 'root-rev',
    kind: 'course',
    school_id: 'school',
    target_id: 'course',
    term_id: 'fall',
    title: 'Root discussion review',
    body: 'Detailed course walkthrough.',
    ratings: [5, 4, 3, 3, 4],
    author: { anonymous: true, handle: 'author' },
    revision: 1,
    published_at: '2026-11-10T00:00:00Z',
    upvotes: 2,
    downvotes: 0,
    my_vote: 0,
    mine: false,
    state: 'published',
    can_edit: false,
  };
  const replies = [
    {
      id: 'reply-1',
      root_id: 'root-rev',
      parent_id: 'root-rev',
      kind: 'reply',
      school_id: 'school',
      target_id: 'course',
      title: '',
      body: 'First student reply.',
      ratings: [0, 0, 0, 0, 0],
      author: { anonymous: true, handle: 'peer123456' },
      revision: 1,
      published_at: '2026-11-11T00:00:00Z',
      upvotes: 0,
      downvotes: 0,
      my_vote: 0,
      mine: false,
      state: 'published',
      can_edit: false,
    },
  ];
  const posted = [];

  await page.route('**/api/v1/reviews/reply-1', (route) => route.fulfill({ json: replies[0] }));
  await page.route('**/api/v1/reviews/root-rev', (route) => route.fulfill({ json: rootReview }));
  await page.route('**/api/v1/reviews?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('kind') === 'reply') return route.fulfill({ json: { items: replies, next: '' } });
    return route.fulfill({ json: { items: [rootReview], next: '' } });
  });
  await page.route('**/api/v1/reviews/*/replies', (route) => {
    const parentId = new URL(route.request().url()).pathname.split('/').at(-2);
    const body = route.request().postDataJSON();
    posted.push({ parentId, body, key: route.request().headers()['idempotency-key'] });
    replies.push({ ...replies[0], id: 'reply-2', parent_id: parentId, body: body.body });
    return route.fulfill({ json: { id: 'reply-2', state: 'published', revision: 1 } });
  });

  await page.goto(`${base}/reviews/reply-1?lang=${locale}`);
  await expect(page).toHaveURL(/\/reviews\/root-rev.*#review-reply-1/);
  await expect(page.getByText('First student reply.', { exact: true })).toBeVisible();

  await page.locator('li').filter({ hasText: 'First student reply.' }).getByRole('button', { name: all.academic.review.reply, exact: true }).click();
  await expect(page.getByRole('button', { name: all.academic.replies.cancelTarget, exact: true })).toBeVisible();
  await page.getByLabel(all.academic.editor.body, { exact: true }).fill('Follow-up to first reply.');
  await page.getByRole('button', { name: all.academic.editor.publish, exact: true }).click();
  await expect(page.getByText('Follow-up to first reply.', { exact: true })).toBeVisible();
  expect(posted[0]).toMatchObject({ parentId: 'reply-1', body: { kind: 'reply', target_id: 'course', body: 'Follow-up to first reply.' } });
});

test('lapsed campus eligibility keeps personal center pages accessible while gating public content', async ({ page }, info) => {
  const all = catalogue(info);
  const locale = info.project.metadata.locale;

  await page.route('**/api/v1/verification/summary', (route) => route.fulfill({ json: { campus_eligibility: false, teacher_verified: false, identity_verified: true, evaluated_at: '2026-11-18T00:00:00Z', revision: 1, next_evaluation_at: null } }));
  await page.route('**/api/v1/verification/applications*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/verification/credentials*', (route) => route.fulfill({ json: [{ id: 'c1', school_id: 'school', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'expired', student_display: '2022****01', revision: 1, verified_at: '2025-09-01T00:00:00Z', expires_at: '2026-09-01T00:00:00Z' }] }));
  await page.route('**/api/v1/reviews/me/overview', (route) => route.fulfill({ json: { review_count: 1, draft_count: 0, pending_courses: { state: 'unavailable', count: 0, items: [] } } }));
  await page.route('**/api/v1/resources/me/summary', (route) => route.fulfill({ json: { resource_count: 1 } }));
  await page.route('**/api/v1/resources/me**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/summary')) return route.fallback();
    return route.fulfill({ json: { items: [], next_cursor: '' } });
  });
  await page.route('**/api/v1/favorites/folders**', (route) => route.fulfill({ json: { items: [{ id: 'default', name: '', is_default: true, item_count: 0, revision: 1 }], next: '' } }));
  await page.route('**/api/v1/favorites/items**', (route) => route.fulfill({ json: { items: [], next: '' } }));
  await page.route('**/api/v1/search/my-votes**', (route) => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.route('**/api/v1/billing/wallet', (route) => route.fulfill({ json: { points: 0, ivory_minor: 0, frozen_ivory_minor: 0, debt_points: 0, frozen: false } }));
  await page.route('**/api/v1/notifications**', (route) => route.fulfill({ json: { items: [], next_cursor: '', unread_count: 0 } }));
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { items: [] } }));

  await page.goto(`${base}/courses?lang=${locale}`);
  await expect(page.getByRole('heading', { level: 1, name: all.gate.expired.title })).toBeVisible();

  for (const [path, heading] of [
    ['/me/resources', all.me.resources],
    ['/me/favorites', all.favorites.title],
    ['/me/votes', all.search.votes.title],
  ]) {
    await page.goto(`${base}${path}?lang=${locale}`);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  }
});

test('compare view handles missing catalog names and wallet orders render non-succeeded states', async ({ page }, info) => {
  const all = catalogue(info);
  const locale = info.project.metadata.locale;
  await academicFixture(page);

  await page.addInitScript(() => {
    localStorage.setItem('stuhelper.compare', JSON.stringify({ course: ['course', 'removed-course'], teacher: [] }));
  });
  await page.goto(`${base}/compare?lang=${locale}`);
  await expect(page.getByRole('link', { name: 'Test Course', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: all.common.unknown, exact: true })).toBeVisible();

  await page.route('**/api/v1/billing/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/billing', '');
    if (path === '/wallet') return route.fulfill({ json: { points: 50, ivory_minor: 0, frozen_ivory_minor: 0, debt_points: 0, frozen: false } });
    if (path === '/lots' || path === '/ledger') return route.fulfill({ json: { items: [], next: '' } });
    if (path === '/channels' || path === '/offers') return route.fulfill({ json: { items: [] } });
    if (path === '/orders') {
      return route.fulfill({
        json: {
          items: [
            { id: 'ord-fail', kind: 'membership', state: 'failed', amount_minor: 0, points: 300, reference: '', channel: '', reason: '', created_at: '2026-11-10T00:00:00Z', allocations: [], original_points: 300, original_amount_minor: 0, receipt_reference: '', failure_code: 'expired', account: 'points', plan_id: 'semester' },
            { id: 'ord-ref', kind: 'resource_unlock', state: 'refunded', amount_minor: 0, points: 80, reference: '', channel: '', reason: '', created_at: '2026-11-09T00:00:00Z', allocations: [], original_points: 80, original_amount_minor: 0, receipt_reference: '', failure_code: '', account: 'points', resource_id: 'res-1' },
          ],
          next: '',
        },
      });
    }
    return route.fallback();
  });
  await page.goto(`${base}/me/wallet?lang=${locale}`);
  await page.getByRole('tab', { name: all.wallet.tabs.orders, exact: true }).click();
  await expect(page.getByText(all.wallet.state.failed, { exact: true })).toBeVisible();
  await expect(page.getByText(all.wallet.state.refunded, { exact: true })).toBeVisible();
});
