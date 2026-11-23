import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, memberTest as test } from '../session-fixture.mjs';
// The popover can open partly outside a short viewport (long Russian labels push the trigger
// down). Navigation buttons are dispatched directly so the helper exercises month logic,
// not Playwright's scroll-into-view heuristics against a repositioning popover.
async function pickDate(page, month, day) {
  await page.locator('.app-datetime-trigger').click();
  const head = page.locator('.app-calendar-head');
  while ((await head.getAttribute('data-month')).slice(0, 4) < month.slice(0, 4)) await head.locator('button').nth(3).dispatchEvent('click');
  while (await head.getAttribute('data-month') !== month) await head.locator('button').nth((await head.getAttribute('data-month')) < month ? 2 : 1).dispatchEvent('click');
  await page.locator('.app-calendar-day').nth(day - 1).dispatchEvent('click');
  await page.locator('.app-calendar-time .btn-primary').dispatchEvent('click');
}
const example = JSON.parse(fs.readFileSync('contracts/contribution.example.json', 'utf8'));
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
async function setup(page, info, empty = false, initial = example.page.items[0]) {
  const all = catalogue(info), m = all.contribution, c = all.common, state = { item: structuredClone(initial), empty, reject: 0, failNext: false, requests: [], seen: new Map() };
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
      state.requests.push({ body, key, path: url.pathname });
      // The provider rejects a nickname on renew and reopen; only create and configure carry one.
      if (body.display_label !== undefined && (body.action === 'renew' || body.action === 'reopen')) return route.fulfill({ status: 400, json: { code: 'invalid' } });
      if (!state.seen.has(key)) {
        state.empty = false;
        const desired = { pause: 'paused', resume: 'active', reopen: 'active', exit: 'exiting', revoke: 'revoked' }[body.action] ?? state.item.desired_state;
        state.item = { ...state.item, revision: state.item.revision + 1, state: 'pending', desired_state: desired, conditions: body.conditions ?? state.item.conditions, ...(body.display_label === undefined ? {} : body.display_label ? { display_label: body.display_label } : { display_label: undefined }) };
        state.seen.set(key, structuredClone(state.item));
      }
      if (state.failNext) { state.failNext = false; return route.abort(); }
      return route.fulfill({ status: 202, json: state.seen.get(key) });
    }
    if (endpoint === 'options') return route.fulfill({ json: example.options });
    return route.fulfill({ json: { ...example.page, items: state.empty ? [] : [state.item] } });
  });
  await page.goto(`http://127.0.0.1:18787/me/storage?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { name: m.mine, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return { m, c, all, state, errors };
}
test('consent, creation, quota adjustment and renewal retain distinct request state', async ({ page }, info) => {
  const { m, c, state, errors } = await setup(page, info, true);
  await page.getByRole('button', { name: m.create, exact: true }).click();
  await page.getByRole('combobox', { name: m.storage, exact: true }).click();
  await page.getByRole('option').last().click();
  await page.getByLabel(m.limit, { exact: true }).fill('10'); await page.getByLabel(m.reserve, { exact: true }).fill('1');
  await pickDate(page, '2030-01', 2);
  await page.getByRole('button', { name: m.review, exact: true }).click();
  expect(state.requests).toHaveLength(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.pending);
  expect(state.requests[0].body.consent).toEqual({ accepted: true, version: example.policy.terms.version, digest: example.policy.terms.digest });
  expect(state.requests[0].body.conditions.limit_bytes).toBe(10 * 1024 ** 3);
  const until = state.item.conditions.until;
  await page.getByRole('button', { name: m.actions.configure, exact: true }).click();
  await page.getByLabel(m.limit, { exact: true }).fill('12');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[1].body.conditions.until).toBe(until); expect(state.requests[1].body.consent).toBeUndefined();
  await page.getByRole('button', { name: m.actions.renew, exact: true }).click();
  await pickDate(page, '2030-02', 1); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[2].body.action).toBe('renew'); expect(state.requests[2].body.consent.accepted).toBe(true); expect(errors).toEqual([]);
});
test('lost response retries original mutation, paginates and clears revoked data', async ({ page }, info) => {
  const { m, c, all, state, errors } = await setup(page, info); state.failNext = true;
  await page.getByRole('button', { name: m.actions.pause, exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(c.uncertain);
  await expect(page.getByRole('dialog').getByRole('button', { name: c.cancel, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: c.retryOriginal, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(state.requests[1]).toEqual(state.requests[0]);
  await expect(page.locator('article')).toContainText(m.states.pending);
  await page.route('**/api/v1/storage-contributions?*', route => route.fulfill({ json: { ...example.page, next_cursor: 'fixture-next' } }), { times: 1 });
  await page.getByRole('button', { name: c.refresh, exact: true }).first().click();
  const next = page.waitForRequest(r => r.method() === 'GET' && new URL(r.url()).searchParams.get('after') === 'fixture-next');
  await page.getByRole('button', { name: c.next, exact: true }).click(); await next;
  await expect(page.locator('article')).toHaveCount(1); expect(errors).toEqual([]);
  if (process.env.CONTRIBUTION_SCREENSHOTS) { fs.mkdirSync(process.env.CONTRIBUTION_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.CONTRIBUTION_SCREENSHOTS, `web-${info.project.name}.png`), fullPage: true }); }
  state.reject = 403; await page.getByRole('button', { name: c.refresh, exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText(all.errors.forbidden); await expect(page.locator('article')).toHaveCount(0); await expect(page.locator('form')).toHaveCount(0);
});
test('exit remains pending while replicas remain', async ({ page }, info) => {
  const { m, c, state } = await setup(page, info);
  await page.getByRole('button', { name: m.actions.exit, exact: true }).click(); await expect(page.getByRole('dialog')).toContainText(m.exitHint);
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.locator('article')).toContainText(m.states.pending); await expect(page.locator('article')).toContainText(m.actions.exit);
  expect(state.item.observation.remaining_replicas).toBe(3); await expect(page.locator('article')).not.toContainText(m.states.exited);
});
test('login boundary keeps public statistics and recovers to empty contributions', async ({ page }, info) => {
  const { m, c, state } = await setup(page, info);
  state.reject = 401;
  await page.getByRole('button', { name: c.refresh, exact: true }).first().click();
  await expect(page.getByText(m.signInHint, { exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: m.summary, exact: true })).toBeVisible();
  state.reject = 0; state.empty = true;
  await page.getByRole('button', { name: c.refresh, exact: true }).first().click();
  await expect(page.getByText(m.empty, { exact: true })).toBeVisible();
});

test('an exited contribution reactivates its original ID with fresh consent and retries the same command', async ({page},info)=>{
  const original = { ...example.page.items[0], state: 'exited', desired_state: 'exiting' };
  const {m,c,state}=await setup(page, info, false, original);
  await page.getByRole('button',{name:m.actions.reopen,exact:true}).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await pickDate(page, '2030-02', 1);
  await page.getByRole('button',{name:m.review,exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests).toHaveLength(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:m.review,exact:true}).click();
  state.failNext = true;
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:c.confirm,exact:true}).click();
  await dialog.getByRole('button',{name:c.retryOriginal,exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests).toHaveLength(2);
  expect(state.requests[1]).toEqual(state.requests[0]);
  expect(state.requests[0].path).toContain('/'+original.id+'/');
  expect(state.requests[0].body).toMatchObject({
    action:'reopen', revision:original.revision,
    conditions:{limit_bytes:original.conditions.limit_bytes,personal_reserve:original.conditions.personal_reserve},
    consent:{accepted:true,version:example.policy.terms.version,digest:example.policy.terms.digest},
  });
  expect(state.seen.size).toBe(1);
  await expect(page.locator('article')).toContainText(m.states.pending);
  await expect(page.getByRole('button',{name:m.actions.reopen,exact:true})).toHaveCount(0);
});
test('records stay distinguishable by masked account and an optional nickname', async ({ page }, info) => {
  const { m, c, state, errors } = await setup(page, info, false, { ...example.page.items[0], adapter: 'bhpan', account_hint: '21****89' });
  const card = page.locator('article').first();
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('BHpan · 21****89');
  await page.getByRole('button', { name: m.actions.configure, exact: true }).click();
  await page.getByLabel(m.displayLabel, { exact: true }).fill('  主力云盘  ');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[0].body.display_label).toBe('主力云盘');
  // Renaming alone keeps the saved conditions, so none are sent or re-checked.
  expect(state.requests[0].body.conditions).toBeUndefined();
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('主力云盘');
  await expect(card).toContainText('BHpan · 21****89');
  await page.getByRole('button', { name: m.actions.configure, exact: true }).click();
  await page.getByLabel(m.limit, { exact: true }).fill('12');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[1].body.display_label).toBeUndefined();
  await page.getByRole('button', { name: m.actions.configure, exact: true }).click();
  await page.getByLabel(m.displayLabel, { exact: true }).fill('');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[2].body.display_label).toBe('');
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('BHpan · 21****89');
  expect(errors).toEqual([]);
});

test('a nickname never rides along on renewal, and accounts with the same mask stay apart', async ({ page }, info) => {
  const labelled = { ...example.page.items[0], adapter: 'bhpan', account_hint: '21****89', display_label: '主力云盘' };
  const { m, c, state, errors } = await setup(page, info, false, labelled);
  await page.getByRole('button', { name: m.actions.renew, exact: true }).click();
  await expect(page.getByLabel(m.displayLabel, { exact: true })).toHaveCount(0);
  await pickDate(page, '2030-02', 1); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[0].body.action).toBe('renew');
  expect(state.requests[0].body.display_label).toBeUndefined();
  // Two accounts whose masks collide each get their record tail.
  const second = { ...labelled, id: `${labelled.id.slice(0, -4)}beef`, display_label: undefined };
  await page.route('**/api/v1/storage-contributions?**', (route) => route.fulfill({ json: { ...example.page, items: [{ ...state.item, display_label: undefined }, second] } }));
  await page.reload();
  const headings = page.locator('article h3');
  await expect(headings).toHaveCount(2);
  const [a, b] = await headings.allTextContents();
  expect(a).not.toBe(b);
  expect(b).toContain('#beef');
  expect(errors).toEqual([]);
});
const before = (template) => template.split('{')[0].trim();
test('the owner sees the drive total, used and remaining space, and an unreadable drive says why', async ({ page }, info) => {
  const failed = { ...structuredClone(example.page.items[0]), reason: 'capacity_read_failed', provider_capacity: { total_bytes: null, used_bytes: null, remaining_bytes: null, observed_at: null, status: 'read_failed', recovery: 'credentials_required' } };
  const { m, state, errors } = await setup(page, info);
  const drive = page.locator('article').getByLabel(m.provider.title, { exact: true });
  for (const name of [m.provider.total, m.provider.used, m.provider.remaining]) await expect(drive.getByText(name, { exact: true })).toBeVisible();
  const shown = await page.evaluate(() => [...document.querySelectorAll('article dl[aria-label] dd')].map((node) => node.textContent?.trim()));
  expect(shown).toHaveLength(3);
  expect(new Set(shown).size).toBe(3);
  await expect(page.locator('article')).not.toContainText(m.neverObserved);
  state.item = failed;
  await page.reload();
  await expect(page.locator('article')).toContainText(m.provider.recovery.credentials_required);
  await expect(page.locator('article').getByLabel(m.provider.title, { exact: true })).toHaveCount(0);
  await expect(page.locator('article')).toContainText(m.neverObserved);
  expect(errors).toEqual([]);
});
test('the contribution form shows the drive space and stops a quota above what is left', async ({ page }, info) => {
  const { m, c, state, errors } = await setup(page, info, true);
  await page.getByRole('button', { name: m.create, exact: true }).click();
  await page.getByRole('combobox', { name: m.storage, exact: true }).click();
  await page.getByRole('option').last().click();
  await expect(page.getByRole('group', { name: m.provider.title })).toBeVisible();
  // The time shown is the last successful read of the drive, so the owner can judge how fresh it is.
  await expect(page.getByRole('group', { name: m.provider.title })).toContainText(before(m.observed));
  const hint = page.getByText(before(m.provider.max));
  await expect(hint).toBeVisible();
  const full = await hint.textContent();
  await page.getByLabel(m.reserve, { exact: true }).fill('20');
  await expect(hint).not.toHaveText(full ?? '');
  // 170,000,000,000 bytes (about 158.3 GB of 1024³ bytes) remain on the drive; with 20 GB kept
  // back, at most about 138.3 GB can be contributed.
  await page.getByLabel(m.limit, { exact: true }).fill('140');
  await expect(page.getByRole('alert').filter({ hasText: before(m.provider.over) }).first()).toBeVisible();
  await pickDate(page, '2030-01', 2);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests).toHaveLength(0);
  await page.getByLabel(m.limit, { exact: true }).fill('130');
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests[0].body.conditions).toMatchObject({ limit_bytes: 130 * 1024 ** 3, personal_reserve: 20 * 1024 ** 3 });
  expect(errors).toEqual([]);
});
test('a quota the server finds above the drive space names that reason and can be read again', async ({ page }, info) => {
  const { m, c, state, errors } = await setup(page, info, true);
  await page.route('**/api/v1/storage-contributions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, json: { code: 'invalid', detail_code: 'limit_exceeds_provider_capacity' } });
  });
  await page.getByRole('button', { name: m.create, exact: true }).click();
  await page.getByRole('combobox', { name: m.storage, exact: true }).click();
  await page.getByRole('option').last().click();
  await page.getByLabel(m.limit, { exact: true }).fill('100');
  await pickDate(page, '2030-01', 2);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: m.review, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: c.confirm, exact: true }).click();
  const notice = page.getByRole('alert').filter({ hasText: m.provider.errors.limit_exceeds_provider_capacity });
  await expect(notice).toBeVisible();
  expect(state.requests).toHaveLength(1);
  await notice.getByRole('button', { name: c.retry, exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect(errors).toEqual([]);
});
