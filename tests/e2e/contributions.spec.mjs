import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
const example = JSON.parse(fs.readFileSync('contracts/contribution.example.json', 'utf8'));
function messages(info) { return JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8')).contribution; }
async function setup(page, info, empty = false) {
  const m = messages(info), state = { item: structuredClone(example.page.items[0]), empty, reject: 0, failNext: false, requests: [], seen: new Map() };
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (/\[intlify\].*(Not found|Fall back)/i.test(e.text())) errors.push(e.text()); });
  await page.clock.install({ time: new Date('2029-12-26T00:00:00Z') });
  await page.route('**/api/v1/storage-contributions**', async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split('/').pop();
    if (endpoint === 'policy' || endpoint === 'statistics') return route.fulfill({ json: example[endpoint] });
    if (state.reject) return route.fulfill({ status: state.reject, json: { code: 'denied' } });
    if (request.method() === 'POST') {
      const body = request.postDataJSON(), key = request.headers()['idempotency-key'];
      state.requests.push({ body, key });
      if (!state.seen.has(key)) {
        state.empty = false;
        const desired = { pause: 'paused', resume: 'active', exit: 'exiting', revoke: 'revoked' }[body.action] ?? state.item.desired_state;
        state.item = { ...state.item, revision: state.item.revision + 1, state: 'pending', desired_state: desired, conditions: body.conditions ?? state.item.conditions };
        state.seen.set(key, structuredClone(state.item));
      }
      if (state.failNext) { state.failNext = false; return route.abort(); }
      return route.fulfill({ status: 202, json: state.seen.get(key) });
    }
    if (endpoint === 'options') return route.fulfill({ json: example.options });
    return route.fulfill({ json: { ...example.page, items: state.empty ? [] : [state.item] } });
  });
  await page.goto(`http://127.0.0.1:18787/contributions?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { name: m.mine, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return { m, state, errors };
}
test('consent, creation, quota adjustment and renewal retain distinct request state', async ({ page }, info) => {
  const { m, state, errors } = await setup(page, info, true);
  await page.getByLabel(m.storage, { exact: true }).selectOption('fixture-storage');
  await page.getByLabel(m.limit, { exact: true }).fill('10'); await page.getByLabel(m.reserve, { exact: true }).fill('1');
  await page.locator('input[type=datetime-local]').fill('2030-01-02T00:00');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  expect(state.requests).toHaveLength(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: m.confirmButton, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.pending);
  expect(state.requests[0].body.consent).toEqual({ accepted: true, version: example.policy.terms.version, digest: example.policy.terms.digest });
  expect(state.requests[0].body.conditions.limit_bytes).toBe(10_000_000_000);
  const until = state.item.conditions.until;
  await page.getByRole('button', { name: m.actions.configure, exact: true }).click();
  await page.getByLabel(m.limit, { exact: true }).fill('12');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('button', { name: m.confirmButton, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[1].body.conditions.until).toBe(until); expect(state.requests[1].body.consent).toBeUndefined();
  await page.getByRole('button', { name: m.actions.renew, exact: true }).click();
  await page.locator('input[type=datetime-local]').fill('2030-02-01T00:00'); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).click(); await page.getByRole('button', { name: m.confirmButton, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[2].body.action).toBe('renew'); expect(state.requests[2].body.consent.accepted).toBe(true); expect(errors).toEqual([]);
});
test('lost response retries original mutation, paginates and clears revoked data', async ({ page }, info) => {
  const { m, state, errors } = await setup(page, info); state.failNext = true;
  await page.getByRole('button', { name: m.actions.pause, exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: m.confirmButton, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(m.uncertain);
  await expect(page.getByRole('button', { name: m.cancel, exact: true }).last()).toBeDisabled();
  await page.getByRole('button', { name: m.retryOriginal, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(state.requests[1]).toEqual(state.requests[0]);
  await expect(page.locator('article')).toContainText(m.states.pending);
  const next = page.waitForRequest(r => r.method() === 'GET' && new URL(r.url()).searchParams.get('after') === 'fixture-next');
  await page.getByRole('button', { name: m.next, exact: true }).click(); await next;
  await expect(page.locator('article')).toHaveCount(1); expect(errors).toEqual([]);
  if (process.env.CONTRIBUTION_SCREENSHOTS) { fs.mkdirSync(process.env.CONTRIBUTION_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.CONTRIBUTION_SCREENSHOTS, `web-${info.project.name}.png`), fullPage: true }); }
  state.reject = 403; await page.getByRole('button', { name: m.refresh, exact: true }).click();
  await expect(page.getByRole('status')).toContainText(m.errors.forbidden); await expect(page.locator('article')).toHaveCount(0); await expect(page.locator('form')).toHaveCount(0);
});
test('exit remains pending while replicas remain', async ({ page }, info) => {
  const { m, state } = await setup(page, info);
  await page.getByRole('button', { name: m.actions.exit, exact: true }).click(); await expect(page.getByRole('dialog')).toContainText(m.exitHint);
  await page.getByRole('button', { name: m.confirmButton, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.pending); await expect(page.locator('article')).toContainText(m.actions.exit);
  expect(state.item.observation.remaining_replicas).toBe(3); await expect(page.locator('article')).not.toContainText(m.states.exited);
});

test('login boundary keeps public statistics and recovers to empty contributions', async ({ page }, info) => {
  const { m, state } = await setup(page, info);
  state.reject = 401;
  await page.getByRole('button', { name: m.refresh, exact: true }).click();
  await expect(page.getByRole('status')).toContainText(m.errors.unauthenticated);
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: m.summary, exact: true })).toBeVisible();
  state.reject = 0; state.empty = true;
  await page.getByRole('button', { name: m.refresh, exact: true }).click();
  await expect(page.getByText(m.empty, { exact: true })).toBeVisible();
});
