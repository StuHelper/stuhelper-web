import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const order = { id: 'order-m', kind: 'membership', state: 'succeeded', amount_minor: 0, points: 300, reference: '', channel: '', reason: '', created_at: '2026-11-10T00:00:00Z', allocations: [], original_points: 300, original_amount_minor: 0, receipt_reference: '', failure_code: '', account: 'points', plan_id: 'semester' };
const plans = [
  { id: 'semester', name: 'Semester pass', valid_seconds: 120 * 86400, points: 300, ivory_minor: 1500 },
  { id: 'draft', name: 'Draft plan', valid_seconds: 30 * 86400, points: 100, ivory_minor: null },
];

// Billing 0.3.1 and resources 0.5.0 servers; purchases are recorded.
async function setup(page, info, options = {}) {
  const state = { buys: [], mine: options.mine ?? [] };
  await page.route('**/api/v1/billing/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/billing/membership-plans') return route.fulfill({ json: plans });
    if (path === '/api/v1/billing/wallet') return route.fulfill({ json: { points: options.points ?? 500, ivory_minor: 0, frozen_ivory_minor: 0, debt_points: 0, frozen: false } });
    if (path === '/api/v1/billing/memberships' && request.method() === 'POST') {
      state.buys.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (options.buyCode) return route.fulfill({ status: 409, json: { code: options.buyCode } });
      state.mine = [{ plan_id: 'semester', plan_name: 'Semester pass', valid_from: '2026-11-10T00:00:00Z', valid_until: '2027-03-10T00:00:00Z', revision: 1, source: 'purchase' }];
      return route.fulfill({ json: order });
    }
    if (path === '/api/v1/billing/memberships') return route.fulfill({ json: state.mine });
    return route.fallback();
  });
  await page.route('**/api/v1/resources/coverage/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    if (id === 'semester') return route.fulfill({ json: { plan_id: 'semester', revision: 1, rules: [{ school_id: 'school' }, { school_id: 'school', category_id: 'exams' }] } });
    return route.fulfill({ status: 404, json: { code: 'resources_not_found' } });
  });
  await page.route('**/api/v1/resources/categories**', (route) => route.fulfill({ json: { items: [{ id: 'exams', revision: 1, names: { 'zh-CN': '试卷', 'en-US': 'Exams' }, enabled: true, order: 1, group_by: '', fields: [] }], next_cursor: '' } }));
  await page.goto(`${base}/me/membership?lang=${info.project.metadata.locale}`);
  return { all: catalogue(info), state };
}

test('each plan shows what it covers, and a plan without coverage cannot be bought', async ({ page }, info) => {
  const { all } = await setup(page, info);
  const m = all.membership;
  const semester = page.getByRole('listitem').filter({ hasText: 'Semester pass' });
  await expect(semester.getByText(m.covers, { exact: true })).toBeVisible();
  await expect(semester.getByRole('listitem')).toHaveCount(2);
  await expect(semester.getByRole('button', { name: m.buy, exact: true })).toBeEnabled();
  const draft = page.getByRole('listitem').filter({ hasText: 'Draft plan' });
  await expect(draft.getByText(m.noCoverage, { exact: true })).toBeVisible();
  await expect(draft.getByRole('button', { name: m.buy, exact: true })).toBeDisabled();
  await expect(page.getByText(m.none, { exact: true })).toBeVisible();
});

test('buying a plan pays from the chosen account and lists the membership', async ({ page }, info) => {
  const { all, state } = await setup(page, info);
  const m = all.membership;
  await page.getByRole('listitem').filter({ hasText: 'Semester pass' }).getByRole('button', { name: m.buy, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: '15.00 Ivory', exact: true }).check();
  await dialog.getByRole('radio', { name: fill(all.wallet.pointsAmount, { amount: new Intl.NumberFormat(info.project.metadata.locale).format(300) }), exact: true }).check();
  await dialog.getByRole('button', { name: new RegExp(m.confirm.replace('{price}', '.+')) }).click();
  await expect(page.getByText(m.bought, { exact: true })).toBeVisible();
  await expect(page.getByText(m.active, { exact: true })).toBeVisible();
  expect(state.buys).toEqual([{ body: { plan_id: 'semester', account: 'points' }, key: expect.any(String) }]);
  // Holding the plan turns its action into a renewal.
  await expect(page.getByRole('listitem').filter({ hasText: 'Semester pass' }).getByRole('button', { name: m.renew, exact: true })).toBeVisible();
});

test('an insufficient balance names the missing points in the purchase dialog', async ({ page }, info) => {
  const { all } = await setup(page, info, { points: 120, buyCode: 'billing_insufficient_funds' });
  const m = all.membership;
  await page.getByRole('listitem').filter({ hasText: 'Semester pass' }).getByRole('button', { name: m.buy, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(m.confirm.replace('{price}', '.+')) }).click();
  const missing = fill(all.wallet.pointsAmount, { amount: new Intl.NumberFormat(info.project.metadata.locale).format(180) });
  await expect(page.getByText(fill(all.resources.unlock.short, { amount: missing }), { exact: true })).toBeVisible();
});
