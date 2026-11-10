import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const group = (id, name, extra = {}) => ({ id, name, school: 'school', number: '****4821', joined: true, state: 'grace', deadline: null, requires_password: false, eligibility: 'eligible', missing_conditions: [], unknown_conditions: [], next_actions: [], ...extra });

// Groups server following the groups 0.4.0 contract for the caller's own groups; queries are recorded.
async function server(page, respond) {
  const seen = [];
  await page.route('**/api/v1/groups/me**', (route) => {
    const url = new URL(route.request().url());
    seen.push(url.search);
    return respond(route, url.searchParams);
  });
  return seen;
}

test('an application missing a QQ binding links to the binding and shows the deadline', async ({ page }, info) => {
  const g = catalogue(info).groups;
  await server(page, (route) => route.fulfill({ json: { items: [group('g1', 'Algorithms Q&A', { joined: false, state: 'awaiting_verification', deadline: '2026-11-12T04:00:00Z', eligibility: 'ineligible', missing_conditions: ['qq_binding', 'password'], next_actions: ['bind_qq', 'submit_password'] })], next_cursor: '' } }));
  await page.goto(`${base}/me/groups?lang=${info.project.metadata.locale}`);
  const card = page.getByRole('listitem').filter({ hasText: 'Algorithms Q&A' });
  await expect(card.getByText(g.eligibility.ineligible, { exact: true })).toBeVisible();
  await expect(card.getByText(g.condition.qq_binding, { exact: true })).toBeVisible();
  await expect(card.getByText(g.hint.submit_password, { exact: true })).toBeVisible();
  await expect(card.locator('time')).toHaveAttribute('datetime', '2026-11-12T04:00:00Z');
  await card.getByRole('link', { name: g.action.bind_qq, exact: true }).click();
  await expect(page).toHaveURL(/\/me\/account#qq-title$/);
});

test('facts that cannot be confirmed are named and the list refreshes on request', async ({ page }, info) => {
  const g = catalogue(info).groups;
  let eligibility = 'unknown';
  const seen = await server(page, (route) => route.fulfill({ json: { items: [group('g1', 'Physics', { eligibility, unknown_conditions: eligibility === 'unknown' ? ['student_stage'] : [], next_actions: eligibility === 'unknown' ? ['refresh'] : [] })], next_cursor: '' } }));
  await page.goto(`${base}/me/groups?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(g.unknown, { facts: g.fact.student_stage }), { exact: true })).toBeVisible();
  eligibility = 'eligible';
  await page.getByRole('button', { name: g.refresh, exact: true }).click();
  await expect(page.getByText(g.eligibility.eligible, { exact: true })).toBeVisible();
  await expect(page.getByText(fill(g.unknown, { facts: g.fact.student_stage }), { exact: true })).toHaveCount(0);
  expect(seen).toEqual(['?limit=50', '?limit=50']);
});

test('later pages load on request and the empty list explains itself', async ({ page }, info) => {
  const all = catalogue(info);
  const seen = await server(page, (route, query) => route.fulfill({ json: query.get('cursor') ? { items: [group('g2', 'Second group')], next_cursor: '' } : { items: [group('g1', 'First group')], next_cursor: 'g1' } }));
  await page.goto(`${base}/me/groups?lang=${info.project.metadata.locale}`);
  await expect(page.getByText('First group', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: all.common.loadMore, exact: true }).click();
  await expect(page.getByText('Second group', { exact: true })).toBeVisible();
  expect(seen).toEqual(['?limit=50', '?cursor=g1&limit=50']);
});

test('an empty list and a failed load each say so', async ({ page }, info) => {
  const all = catalogue(info);
  let fail = true;
  await server(page, (route) => (fail ? route.fulfill({ status: 503, json: { code: 'groups_unavailable' } }) : route.fulfill({ json: { items: [], next_cursor: '' } })));
  await page.goto(`${base}/me/groups?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(all.errors.unavailable, { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: all.common.retry, exact: true }).click();
  await expect(page.getByText(all.groups.empty, { exact: true })).toBeVisible();
});
