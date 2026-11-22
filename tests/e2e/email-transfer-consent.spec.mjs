import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const outbound = 'student_email_outbound_otp';
const inbound = 'student_email_inbound_challenge';
const methods = [outbound, inbound];
const school = {
  id: 'school', name: 'Test University', enabled: true, methods,
  method_capabilities: { [outbound]: { study_stage_required: false }, [inbound]: { study_stage_required: false } },
  notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30,
  email_domain: 'example.edu', material_types: [], revision: 1,
};
const now = '2026-11-22T06:00:00Z';
const student = { student_id: '20260001', name: 'Synthetic Student' };
const document = (version, digest) => ({
  document_id: 'email-transfer', version, digest,
  url: `https://legal.example.invalid/email-transfer/${version}?digest=${digest}`,
});
const first = document('v1', 'a'.repeat(64));
const updated = document('v2', 'b'.repeat(64));
const acceptance = ({ document_id, version, digest }) => ({ document_id, version, digest, accepted: true });
const catalogue = ({ project }) => JSON.parse(fs.readFileSync(`src/locales/${project.metadata.locale}.json`, 'utf8'));
const notice = (page, v) => page.getByRole('region', { name: v.transfer.title, exact: true });
const button = (parent, name) => parent.getByRole('button', { name, exact: true });

test.use({ reducedMotion: 'reduce' });

async function fixture(page, accepted = false) {
  const csrf = randomUUID();
  const state = {
    document: first, accepted, reads: [], sends: [], deliveries: [], withdrawals: [],
    readUnavailable: false, sendUnavailable: false,
  };
  const applications = new Map();
  const challenges = new Map();
  const receipts = new Map();
  state.revoke = () => {
    state.accepted = false;
    receipts.clear();
  };
  await page.clock.install({ time: new Date(now) });
  await page.context().addCookies([{ url: base, name: 'stuhelper_csrf', value: csrf }]);
  await page.route('**/api/v1/catalog/objects**', route => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.route('**/api/v1/verification/**', async route => {
    const request = route.request();
    const method = request.method();
    const endpoint = new URL(request.url()).pathname.split('/verification/')[1];
    const ok = (json) => route.fulfill({ json });
    const reject = (status, code) => route.fulfill({ status, json: { code } });
    const unavailable = () => reject(503, 'dependency_unavailable');
    if (method === 'GET' && endpoint === 'summary') return ok({
      campus_eligibility: false, teacher_verified: false, identity_verified: false,
      evaluated_at: now, revision: 1, next_evaluation_at: null,
    });
    if (method === 'GET' && endpoint === 'schools') return ok([school]);
    if (method === 'GET' && (['credentials', 'requests'].includes(endpoint) || endpoint.endsWith('/materials'))) return ok([]);
    if (endpoint === 'applications') {
      if (method === 'GET') return ok([...applications.values()]);
      const body = request.postDataJSON();
      const application = {
        id: `application-${applications.size + 1}`, school_id: body.school_id,
        method: body.method, stage: body.stage, kind: body.kind, state: 'in_progress', revision: 1,
        created_at: now, updated_at: now, expires_at: '2026-11-23T06:00:00Z', credential_id: '', result_code: '',
      };
      applications.set(application.id, application);
      return ok(application);
    }
    if (endpoint === 'email-transfer-consent') {
      if (method === 'GET') {
        state.reads.push(state.document.version);
        if (state.readUnavailable) return unavailable();
        return ok({ document: state.document, accepted: state.accepted, ...(state.accepted ? { accepted_at: now } : {}) });
      }
      if (method === 'DELETE') {
        const headers = await request.allHeaders();
        state.withdrawals.push({ key: headers['idempotency-key'], csrf: headers['x-csrf-token'] === csrf, body: request.postData() });
        state.revoke();
        return ok({ withdrawn: true });
      }
    }
    const [, id] = /^applications\/([^/]+)\/email$/.exec(endpoint) ?? [];
    const application = applications.get(id);
    if (!application) return reject(404, 'not_found');
    if (method === 'GET') return challenges.has(id) ? ok(challenges.get(id)) : reject(404, 'not_found');

    const body = request.postDataJSON();
    state.sends.push({ id, body, key: request.headers()['idempotency-key'] });
    const isOutbound = application.method === outbound;
    if (isOutbound) {
      if (state.sendUnavailable) return unavailable();
      const expected = acceptance(state.document);
      const submitted = body.email_transfer_consent;
      const receipt = receipts.get(id);
      if (submitted) {
        if (submitted.accepted !== true) return reject(403, 'email_transfer_consent_required');
        if (submitted.document_id !== expected.document_id) return reject(400, 'invalid_input');
        if (submitted.version !== expected.version || submitted.digest !== expected.digest) return reject(409, 'email_transfer_consent_changed');
        receipts.set(id, { studentId: body.student_id, version: expected.version, digest: expected.digest });
        state.accepted = true;
      } else if (receipt?.studentId !== body.student_id || receipt?.version !== expected.version || receipt?.digest !== expected.digest) {
        return reject(403, 'email_transfer_consent_required');
      }
      state.deliveries.push({ id, studentId: body.student_id, version: expected.version });
    }
    const challenge = {
      id: `email-${state.sends.length}`, application_id: id, expires_at: '2026-11-22T06:10:00Z',
      masked_email: '20****01@example.edu', state: isOutbound ? 'queued' : 'waiting',
      target_address: isOutbound ? '' : 'verify-7f3a@example.edu',
    };
    challenges.set(id, isOutbound ? { ...challenge, state: 'delivered' } : challenge);
    return ok(challenge);
  });
  return state;
}

async function start(page, info, v, method = outbound) {
  const choose = page.getByRole('region', { name: v.start, exact: true });
  if (!(await choose.isVisible())) await page.goto(`${base}/me/verification?lang=${info.project.metadata.locale}`);
  await choose.getByText(v.methods[method], { exact: true }).click();
  await expect(choose.getByRole('radio', { name: v.methods[method] })).toBeChecked();
  await choose.getByRole('checkbox', { name: v.consent }).check();
  await button(choose, v.continue).click();
  await fillStudent(page, v, student.student_id);
}

async function fillStudent(page, v, id) {
  await page.getByLabel(v.studentId, { exact: true }).fill(id);
  await page.getByLabel(v.name, { exact: true }).fill(student.name);
}

async function expectNotice(page, v, reference) {
  const card = notice(page, v);
  await expect(card).toBeVisible();
  await expect(card.getByRole('link')).toHaveAttribute('href', reference.url);
  await expect(card.getByRole('link')).toHaveText(v.transfer.read.replace('{version}', `\u2066${reference.version}\u2069`));
  return card;
}

async function shot(locator, info, name) {
  const folder = process.env.EMAIL_TRANSFER_SCREENSHOTS;
  if (!folder) return;
  fs.mkdirSync(folder, { recursive: true });
  // The mobile tab bar is fixed to the viewport. Keep it outside an isolated card capture.
  await locator.screenshot({
    animations: 'disabled', path: path.join(folder, `${info.project.name}-${name}.png`),
    style: name === 'withdraw' ? undefined : '.tabbar { visibility: hidden !important; }',
  });
  if (info.project.name === 'mobile-ar-EG' && name === 'notice') {
    await locator.getByRole('button').last().scrollIntoViewIfNeeded();
    await locator.page().screenshot({ animations: 'disabled', path: path.join(folder, `${info.project.name}-viewport.png`) });
  }
}

test('outbound email waits for explicit consent and sends the versioned document reference', async ({ page }, info) => {
  const v = catalogue(info).verification;
  // An account receipt from another application cannot authorize this application's first send.
  const state = await fixture(page, true);
  await start(page, info, v);
  await button(page, v.createChallenge).click();
  const card = await expectNotice(page, v, first);
  expect(state.reads).toEqual([first.version]);
  expect(state.sends).toEqual([]);
  await expect(card.getByRole('checkbox')).toHaveCount(0);
  await expect(card.getByText(v.transfer.intro, { exact: true })).toBeVisible();
  for (const { label, text } of Object.values(v.transfer.facts)) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
    await expect(card.getByText(text, { exact: true })).toBeVisible();
  }
  const locale = info.project.metadata.locale;
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(card).toHaveCSS('direction', direction);
  for (const control of [card, button(card, v.transfer.agree), button(card, v.transfer.back)]) {
    expect(await control.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth + 1;
    })).toBe(true);
  }
  await shot(card, info, 'notice');
  await page.getByLabel(v.name, { exact: true }).press('Enter');
  await button(card, v.transfer.back).click();
  await expect(page.getByRole('region', { name: v.start, exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(state.sends).toEqual([]);

  await start(page, info, v);
  await button(page, v.createChallenge).click();
  await expectNotice(page, v, first);
  await button(card, v.transfer.agree).click();
  await expect(page.getByLabel(v.emailCode, { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].body).toMatchObject(student);
  expect(state.sends[0].body.email_transfer_consent).toEqual(acceptance(first));
  expect(state.deliveries).toHaveLength(1);
});

test('resend reuses consent for the same recipient and asks again for a changed student ID', async ({ page }, info) => {
  const v = catalogue(info).verification, state = await fixture(page);
  await start(page, info, v);
  await button(page, v.createChallenge).click();
  await button(notice(page, v), v.transfer.agree).click();
  await expect(page.getByLabel(v.emailCode, { exact: true })).toBeEnabled();
  await page.clock.fastForward(61_000);
  await button(page, v.emailStep.resend).click();
  await expect.poll(() => state.deliveries.length).toBe(2);
  expect(state.sends[1].body).toMatchObject(student);
  expect(state.sends[1].body).not.toHaveProperty('email_transfer_consent');
  expect(state.sends[1].id).toBe(state.sends[0].id);
  expect(state.reads).toEqual([first.version]);

  await button(page, v.back).click();
  const applications = page.getByRole('region', { name: v.applications, exact: true });
  await button(applications, v.continue).click();
  await button(page, v.emailStep.resend).click();
  const changedId = '20260002';
  await fillStudent(page, v, changedId);
  await button(page, v.createChallenge).click();
  const card = await expectNotice(page, v, first);
  expect(state.sends).toHaveLength(2);
  await button(card, v.transfer.agree).click();
  await expect(page.getByLabel(v.emailCode, { exact: true })).toBeEnabled();
  expect(state.sends[2].id).toBe(state.sends[0].id);
  expect(state.sends[2].body).toMatchObject({ student_id: changedId, email_transfer_consent: acceptance(first) });
});

test('a changed publication shows its update and waits for consent to the new version', async ({ page }, info) => {
  const v = catalogue(info).verification, state = await fixture(page);
  await start(page, info, v);
  await button(page, v.createChallenge).click();
  const card = await expectNotice(page, v, first);
  state.document = updated;
  await button(card, v.transfer.agree).click();
  await expectNotice(page, v, updated);
  await expect(card.getByRole('alert')).toHaveText(v.transfer.changed);
  expect(state.reads).toEqual([first.version, updated.version]);
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].body.email_transfer_consent).toEqual(acceptance(first));
  expect(state.deliveries).toEqual([]);
  if (['desktop-zh-CN', 'mobile-ar-EG'].includes(info.project.name)) await shot(card, info, 'updated');
  await button(card, v.transfer.agree).click();
  await expect(page.getByLabel(v.emailCode, { exact: true })).toBeEnabled();
  expect(state.sends[1].body.email_transfer_consent).toEqual(acceptance(updated));
  expect(state.deliveries).toEqual([{ id: state.sends[0].id, studentId: student.student_id, version: updated.version }]);
});

test('a revoked receipt makes resend ask again and keeps the already sent code usable', async ({ page }, info) => {
  const v = catalogue(info).verification, state = await fixture(page);
  await start(page, info, v);
  await button(page, v.createChallenge).click();
  await button(notice(page, v), v.transfer.agree).click();
  const code = page.getByLabel(v.emailCode, { exact: true });
  await expect(code).toBeEnabled();
  state.revoke();
  await page.clock.fastForward(61_000);
  await button(page, v.emailStep.resend).click();
  const card = await expectNotice(page, v, first);
  expect(state.reads).toEqual([first.version, first.version]);
  expect(state.sends).toHaveLength(2);
  expect(state.sends[1].body).not.toHaveProperty('email_transfer_consent');
  expect(state.deliveries).toHaveLength(1);
  await expect(code).toBeVisible();
  await expect(code).toBeEnabled();
  await button(card, v.transfer.agree).click();
  await expect(card).toHaveCount(0);
  expect(state.sends[2].body.email_transfer_consent).toEqual(acceptance(first));
  expect(state.deliveries).toHaveLength(2);
});

test('an unavailable transfer check offers retry and a return to other methods', async ({ page }, info) => {
  const { verification: v, common, errors } = catalogue(info), state = await fixture(page);
  await start(page, info, v);
  state.readUnavailable = true;
  await button(page, v.createChallenge).click();
  await expect(page.getByRole('alert')).toHaveText(errors.unavailable);
  const retry = button(page, common.retry);
  const back = button(page, v.transfer.back).or(button(page, v.back));
  await expect(retry).toBeEnabled();
  await back.click();
  await expect(page.getByRole('region', { name: v.start, exact: true })).toBeVisible();
  expect(state.sends).toEqual([]);

  await start(page, info, v);
  await button(page, v.createChallenge).click();
  await expect(retry).toBeEnabled();
  state.readUnavailable = false;
  await retry.click();
  const card = await expectNotice(page, v, first);
  state.sendUnavailable = true;
  await button(card, v.transfer.agree).click();
  await expect(page.getByRole('alert')).toHaveText(errors.unavailable);
  await expect(retry).toBeEnabled();
  await expect(back).toBeEnabled();
  expect(state.sends).toHaveLength(1);
  expect(state.deliveries).toEqual([]);

  state.sendUnavailable = false;
  await retry.click();
  await expectNotice(page, v, first);
  expect(state.sends).toHaveLength(1);
  await button(card, v.transfer.agree).click();
  await expect(page.getByLabel(v.emailCode, { exact: true })).toBeEnabled();
  expect(state.sends).toHaveLength(2);
  expect(state.sends[1].body).toEqual(state.sends[0].body);
  expect(state.sends[0].key).toBeTruthy();
  expect(state.sends[1].key).toBe(state.sends[0].key);
  expect(state.deliveries).toHaveLength(1);
});

test('account security withdraws consent only after confirmation and refreshes the status', async ({ page }, info) => {
  const { verification: v, common } = catalogue(info), state = await fixture(page, true);
  await page.goto(`${base}/me/account?lang=${info.project.metadata.locale}`);
  const section = notice(page, v);
  const withdraw = button(section, v.transfer.withdraw);
  const dialog = page.getByRole('dialog', { name: v.transfer.withdraw, exact: true });
  await withdraw.click();
  await expect(dialog).toHaveAccessibleDescription(v.transfer.withdrawConfirm);
  expect(state.withdrawals).toEqual([]);
  await button(dialog, common.cancel).click();
  await expect(dialog).toHaveCount(0);
  await expect(withdraw).toBeEnabled();
  expect(state.withdrawals).toEqual([]);
  await withdraw.click();
  if (['desktop-zh-CN', 'mobile-ar-EG'].includes(info.project.name)) await shot(dialog, info, 'withdraw');
  await button(dialog, v.transfer.withdraw).click();
  await expect(page.getByText(v.transfer.withdrawn, { exact: true })).toBeVisible();
  await expect(section).toHaveCount(0);
  expect(state.withdrawals).toEqual([{ key: expect.any(String), csrf: true, body: null }]);
  expect(state.withdrawals[0].key).toBeTruthy();
  expect(state.reads).toEqual([first.version, first.version]);
});

test('inbound school email creates its proof without requesting outbound consent', async ({ page }, info) => {
  const v = catalogue(info).verification, state = await fixture(page);
  await start(page, info, v, inbound);
  await button(page, v.createChallenge).click();
  await expect(page.getByText('verify-7f3a@example.edu', { exact: true })).toBeVisible();
  expect(state.reads).toEqual([]);
  expect(state.deliveries).toEqual([]);
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].body).not.toHaveProperty('email_transfer_consent');
});
