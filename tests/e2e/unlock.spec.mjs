import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const wallet = { points: 120, ivory_minor: 500, frozen_ivory_minor: 0, debt_points: 0, frozen: false };
const order = (state, extra = {}) => ({ id: 'order-1', kind: 'resource_unlock', state, amount_minor: 0, points: 80, reference: '', channel: '', reason: '', created_at: '2026-11-10T00:00:00Z', allocations: [], original_points: 80, original_amount_minor: 0, receipt_reference: '', failure_code: '', account: 'points', resource_id: 'resource', ...extra });

// A restricted resource the member can buy, and a billing server following billing 0.3.0.
// `states` lists what successive order reads return after the payment.
async function setup(page, info, options = {}) {
  const s = fixture();
  Object.assign(s.resource, { owned: false, download_allowed: false, access_reason: 'requirements_missing', available_methods: ['purchase'], unlock_reason: 'eligible' });
  await routes(page, s);
  const billing = { unlocks: [], reads: 0 };
  await page.route('**/api/v1/billing/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/billing/resource-prices/resource') return route.fulfill({ json: { resource_id: 'resource', points: 80, ivory_minor: options.ivory ?? null } });
    if (path === '/api/v1/billing/wallet') return route.fulfill({ json: options.wallet ?? wallet });
    if (path === '/api/v1/billing/resource-unlocks') {
      billing.unlocks.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (options.unlockStatus) return route.fulfill({ status: options.unlockStatus, json: { code: options.unlockCode } });
      return route.fulfill({ json: order('paid') });
    }
    if (path === '/api/v1/billing/orders/order-1') {
      const states = options.states ?? ['fulfilled'];
      const state = states[Math.min(billing.reads++, states.length - 1)];
      if (state === 'fulfilled') Object.assign(s.resource, { download_allowed: true, access_reason: 'allowed', available_methods: ['download'] });
      return route.fulfill({ json: order(state) });
    }
    return route.fallback();
  });
  await page.goto(`${base}/resources/items/resource?lang=${info.project.metadata.locale}`);
  return { all: catalogue(info), billing };
}

test('buying access waits for the grant before offering the download', async ({ page }, info) => {
  const { all, billing } = await setup(page, info, { states: ['paid', 'fulfilled'] });
  const u = all.resources.unlock;
  const price = fill(all.wallet.pointsAmount, { amount: new Intl.NumberFormat(info.project.metadata.locale).format(80) });
  await page.getByRole('button', { name: fill(u.buy, { price }), exact: true }).click();
  await expect(page.getByText(u.done, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: all.resources.detail.download, exact: true })).toBeVisible();
  expect(billing.unlocks).toEqual([{ body: { resource_id: 'resource', account: 'points' }, key: expect.any(String) }]);
});

test('a resource that cannot be delivered after payment reports the refund, not success', async ({ page }, info) => {
  const { all } = await setup(page, info, { states: ['refunded'] });
  const u = all.resources.unlock;
  await page.getByRole('button', { name: new RegExp(u.buy.replace('{price}', '.+')) }).click();
  await expect(page.getByText(u.refunded, { exact: true })).toBeVisible();
  await expect(page.getByText(u.done, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: all.resources.detail.download, exact: true })).toHaveCount(0);
});

test('an insufficient balance names the missing amount and links to the wallet', async ({ page }, info) => {
  const { all } = await setup(page, info, { unlockStatus: 409, unlockCode: 'billing_insufficient_funds', wallet: { ...wallet, points: 50 } });
  const u = all.resources.unlock;
  await page.getByRole('button', { name: new RegExp(u.buy.replace('{price}', '.+')) }).click();
  const missing = fill(all.wallet.pointsAmount, { amount: new Intl.NumberFormat(info.project.metadata.locale).format(30) });
  await expect(page.getByText(fill(u.short, { amount: missing }), { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: u.toWallet, exact: true })).toHaveAttribute('href', '/me/wallet');
});

test('either account can be chosen when both prices are set', async ({ page }, info) => {
  const { billing } = await setup(page, info, { ivory: 250 });
  await page.getByRole('radio', { name: '2.50 Ivory', exact: true }).check();
  await page.getByRole('button', { name: /2\.50 Ivory/ }).click();
  await expect.poll(() => billing.unlocks.length).toBe(1);
  expect(billing.unlocks[0].body).toEqual({ resource_id: 'resource', account: 'ivory' });
});
