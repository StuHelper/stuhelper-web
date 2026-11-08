import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const ivory = (info, minor) => new Intl.NumberFormat(info.project.metadata.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
const cny = (info, minor) => new Intl.NumberFormat(info.project.metadata.locale, { style: 'currency', currency: 'CNY' }).format(minor / 100);
const order = (values) => ({ points: 0, reference: '', channel: '', reason: '', created_at: '2026-11-01T00:00:00Z', allocations: [], original_points: 0, original_amount_minor: 0, receipt_reference: '', failure_code: '', ...values });

// Billing server following the billing contract. Writes are recorded with their idempotency keys.
async function billing(page, options = {}) {
  const state = {
    wallet: { points: 133, ivory_minor: 2000, frozen_ivory_minor: 0, debt_points: 0, frozen: false, ...options.wallet },
    channels: options.channels ?? [{ id: 'demo-pay', enabled: true, amounts_minor: [1000, 3000], original_refunds: true }],
    offers: options.offers ?? [{ id: 'points-120', enabled: true, amount_minor: 1000, points: 120, valid_seconds: 30 * 86400, version: 3 }, { id: 'points-400', enabled: true, amount_minor: 3000, points: 400, valid_seconds: 0, version: 1 }],
    orders: options.orders ?? [order({ id: 'paid', kind: 'topup', state: 'succeeded', amount_minor: 3000, channel: 'demo-pay' })],
    writes: [],
    topupFailures: options.topupFailures ?? 0,
  };
  await page.route('**/api/v1/billing/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/billing', '');
    if (request.method() === 'GET') {
      if (path === '/wallet') return route.fulfill({ json: state.wallet });
      if (path === '/lots') return route.fulfill({ json: { items: [{ id: 'lot', asset: 'points', original: 8, remaining: 8, held: 0, expired: 0, consumed: 0, expires_at: '2026-11-20T00:00:00Z', created_at: '2026-11-01T00:00:00Z' }], next: '' } });
      if (path === '/ledger') return route.fulfill({ json: { items: [{ id: 'e1', asset: 'points', kind: 'reward', amount: 8, reference: 'r', created_at: '2026-11-02T00:00:00Z' }, { id: 'e2', asset: 'ivory', kind: 'topup', amount: 3000, reference: 'paid', created_at: '2026-11-01T00:00:00Z' }], next: '' } });
      if (path === '/orders') return route.fulfill({ json: { items: state.orders, next: '' } });
      if (path === '/channels') return route.fulfill({ json: { items: state.channels } });
      if (path === '/offers') return route.fulfill({ json: { items: state.offers } });
    }
    const body = request.postData() ? request.postDataJSON() : undefined;
    state.writes.push({ path, body, key: request.headers()['idempotency-key'] });
    if (path === '/topups') {
      if (state.topupFailures-- > 0) return route.abort('failed');
      const created = order({ id: 'new-topup', kind: 'topup', state: 'awaiting_payment', amount_minor: body.amount_minor, channel: body.channel, payment_instruction: { type: 'qr_code', content: 'https://pay.example.invalid/new-topup', expires_at: '2030-01-01T00:00:00Z' } });
      state.orders = [created, ...state.orders];
      return route.fulfill({ json: created });
    }
    if (path === '/orders/new-topup/refresh') {
      state.wallet = { ...state.wallet, ivory_minor: state.wallet.ivory_minor + 3000 };
      return route.fulfill({ json: order({ ...state.orders[0], state: 'succeeded' }) });
    }
    if (path === '/purchases') {
      const offer = state.offers.find((item) => item.id === body.offer_id);
      state.wallet = { ...state.wallet, ivory_minor: state.wallet.ivory_minor - offer.amount_minor, points: state.wallet.points + offer.points };
      return route.fulfill({ json: order({ id: 'purchase', kind: 'purchase', state: 'succeeded', amount_minor: offer.amount_minor, points: offer.points, reference: offer.id }) });
    }
    if (path === '/refunds') {
      const created = order({ id: 'refund', kind: 'refund', state: 'awaiting_details', amount_minor: body.amount_minor, reference: body.topup_id, reason: body.reason });
      state.orders = [created, ...state.orders];
      return route.fulfill({ json: created });
    }
    if (path === '/refunds/refund/receipt') {
      state.orders = state.orders.map((item) => (item.id === 'refund' ? { ...item, state: 'awaiting_manual', receipt_reference: body.receipt_reference } : item));
      return route.fulfill({ json: state.orders[0] });
    }
    return route.fulfill({ status: 404, json: { code: 'billing_not_found' } });
  });
  return state;
}

test('top-up shows the price before paying, retries an unknown result once and credits after confirmation', async ({ page }, info) => {
  const all = catalogue(info), w = all.wallet, state = await billing(page, { topupFailures: 1 });
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(ivory(info, 2000), { exact: true })).toBeVisible();
  await expect(page.getByText(number(info, 133), { exact: true })).toBeVisible();
  await expect(page.getByText(fill(w.entryKind.reward, {}), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: w.topup.action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(cny(info, 3000), { exact: true }).click();
  await expect(dialog.getByText(fill(w.topup.confirm, { price: cny(info, 3000), amount: ivory(info, 3000), channel: 'demo-pay' }), { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: fill(w.topup.pay, { price: cny(info, 3000) }), exact: true }).click();
  await expect(dialog.getByText(all.common.uncertain, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: all.common.retryOriginal, exact: true }).click();
  await expect(dialog.getByRole('img', { name: fill(w.topup.qrAlt, { channel: 'demo-pay' }) })).toBeVisible();
  const topups = state.writes.filter((write) => write.path === '/topups');
  expect(topups).toHaveLength(2);
  expect(topups[1]).toEqual(topups[0]);
  expect(topups[0].body).toEqual({ channel: 'demo-pay', amount_minor: 3000 });
  await dialog.getByRole('button', { name: w.topup.check, exact: true }).click();
  await expect(page.getByText(fill(w.topup.credited, { amount: ivory(info, 3000) }), { exact: true })).toBeVisible();
  await expect(page.getByText(ivory(info, 5000), { exact: true })).toBeVisible();
});

test('points redemption confirms Ivory, points and validity, and offers beyond the balance stay unavailable', async ({ page }, info) => {
  const w = catalogue(info).wallet, state = await billing(page);
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: w.buy.action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: new RegExp(number(info, 400)) })).toBeDisabled();
  await expect(dialog.getByText(new RegExp(fill(w.buy.validUntil, { date: '.+' })))).toBeVisible();
  await dialog.getByRole('button', { name: w.buy.submit, exact: true }).click();
  await expect(page.getByText(fill(w.buy.done, { points: number(info, 120) }), { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/purchases', body: { offer_id: 'points-120', version: 3 }, key: expect.any(String) }]);
});

test('without an enabled channel the page offers no top-up', async ({ page }, info) => {
  const w = catalogue(info).wallet;
  await billing(page, { channels: [{ id: 'demo-pay', enabled: false, amounts_minor: [1000], original_refunds: true }], orders: [] });
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(w.topup.unavailable, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: w.topup.action, exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: w.tabs.orders, exact: true }).click();
  await expect(page.getByText(w.emptyOrders, { exact: true })).toBeVisible();
});

test('refund checks the amount, then asks for payout details when review requires them', async ({ page }, info) => {
  const all = catalogue(info), w = all.wallet, state = await billing(page);
  await page.goto(`${base}/me/wallet?lang=${info.project.metadata.locale}`);
  await page.getByRole('tab', { name: w.tabs.orders, exact: true }).click();
  await page.getByRole('button', { name: w.refund.action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const amount = dialog.getByLabel(w.refund.amount, { exact: true });
  await amount.fill('31');
  await expect(dialog.getByText(fill(w.refund.tooMuch, { amount: ivory(info, 3000) }), { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: w.refund.submit, exact: true })).toBeDisabled();
  await amount.fill('12.5');
  await dialog.getByLabel(w.refund.reason, { exact: true }).fill('Charged for the wrong amount.');
  await dialog.getByRole('button', { name: w.refund.submit, exact: true }).click();
  await expect(page.getByText(w.refund.submitted, { exact: true })).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/refunds', body: { topup_id: 'paid', amount_minor: 1250, reason: 'Charged for the wrong amount.' } });
  await expect(page.getByText(w.state.awaiting_details, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: w.receipt.action, exact: true }).click();
  await page.getByRole('dialog').getByLabel(w.receipt.label, { exact: true }).fill('Synthetic account 01');
  await page.getByRole('dialog').getByRole('button', { name: all.common.submit, exact: true }).click();
  await expect(page.getByText(w.state.awaiting_manual, { exact: true })).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/refunds/refund/receipt', body: { receipt_reference: 'Synthetic account 01' } });
});
