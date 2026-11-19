import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);

const school = { id: 'school', name: 'Demo University', enabled: true, methods: ['manual_material_review'], notice_version: 'v3', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'demo.edu', material_types: ['staff_card', 'contract'], revision: 1 };
const secondSchool = { id: 'school-2', name: 'Second University', enabled: true, methods: ['manual_material_review'], notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'second.edu', material_types: ['staff_card'], revision: 1 };
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const application = (values) => ({ id: 'ta', school_id: 'school', method: 'manual_material_review', stage: 'unknown', kind: 'teacher', state: 'in_progress', revision: 1, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z', credential_id: '', result_code: '', ...values });
const credential = (values) => ({ id: 'tc', school_id: 'school', teacher_ids: ['p1', 'p2'], state: 'active', revision: 3, verified_at: '2026-11-01T00:00:00Z', expires_at: null, source: 'manual_material_review', note: '', disclosures: ['teacher'], ...values });
const teacher = (id, name) => ({ id, kind: 'teacher', name, school_id: 'school', credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z' });

// Verification server following the teacher part of the verification contract.
async function server(page, options = {}) {
  const state = { schools: options.schools ?? [school], applications: options.applications ?? [], credentials: options.credentials ?? [], materials: options.materials ?? [], writes: [] };
  await page.route('**/api/v1/catalog/objects/lookup**', (route) => route.fulfill({ json: { items: [teacher('p1', 'Prof. Lin'), teacher('p2', 'Dr. Zhao')], missing_ids: [] } }));
  await page.route('**/api/v1/verification/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/verification', '');
    if (path === '/summary') return route.fallback();
    if (request.method() === 'GET') {
      if (path === '/schools') return route.fulfill({ json: state.schools });
      if (path === '/applications') return route.fulfill({ json: state.applications });
      if (path === '/teacher-credentials') return route.fulfill({ json: state.credentials });
      if (/^\/applications\/[^/]+\/materials$/.test(path)) return route.fulfill({ json: state.materials });
      if (/^\/applications\/[^/]+\/teacher-form$/.test(path)) return options.form ? route.fulfill({ json: options.form }) : route.fulfill({ status: 404, json: { code: 'not_found' } });
      if (path.startsWith('/materials/')) return route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng });
    }
    const body = request.postData() ? request.postDataJSON() : undefined;
    state.writes.push({ method: request.method(), path, body, key: request.headers()['idempotency-key'] });
    if (path === '/teacher-applications') {
      const nextId = state.applications.length ? 'aa-new' : 'ta';
      const created = application({ id: nextId, school_id: body.school_id, created_at: '2026-11-18T00:00:00Z' });
      state.applications = [...state.applications, created].sort((a, b) => a.id.localeCompare(b.id));
      return route.fulfill({ status: 201, json: created });
    }
    if (/^\/applications\/[^/]+\/capture$/.test(path)) {
      return route.fulfill({ json: { token: 'B'.repeat(43), expires_at: '2030-01-01T00:05:00Z' } });
    }
    if (path === '/applications/ta/teacher-form') {
      state.applications = [application({ state: 'pending_review', revision: 2 })];
      return route.fulfill({ json: state.applications[0] });
    }
    if (path === '/teacher-credentials/tc/disclosures') {
      if (body.revision !== 3) return route.fulfill({ status: 409, json: { code: 'conflict' } });
      state.credentials = [credential({ disclosures: body.disclosures, revision: 4 })];
      return route.fulfill({ json: state.credentials[0] });
    }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return state;
}

test('a teacher starts an application, fills the form and submits it for review', async ({ page }, info) => {
  const m = catalogue(info); const t = m.teacher;
  const state = await server(page, { materials: [{ id: 'mat1', application_id: 'ta', content_type: 'image/jpeg', size: 1000, created_at: '2026-11-01T00:00:00Z' }] });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  const apply = page.getByRole('button', { name: t.apply, exact: true });
  await expect(apply).toBeDisabled();
  await page.getByLabel(school.name, { exact: true }).check();
  await page.getByLabel(t.consent, { exact: true }).check();
  await apply.click();
  await expect(page.getByText(t.applicationState.in_progress, { exact: true })).toBeVisible();
  expect(state.writes[0]).toEqual({ method: 'POST', path: '/teacher-applications', body: { school_id: 'school', notice_version: 'v3', consent: true }, key: expect.any(String) });

  await expect(page.getByText(fill(t.materials, { count: number(info, 1) }), { exact: true })).toBeVisible();
  const submit = page.getByRole('button', { name: t.submit, exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('textbox', { name: t.name, exact: true }).fill('Lin Wei');
  await page.getByRole('textbox', { name: t.organization, exact: true }).fill('School of Computing');
  await page.getByRole('textbox', { name: t.email, exact: true }).fill('lin@demo.edu');
  await page.getByLabel(m.verification.materialTypes.contract, { exact: true }).check();
  await page.getByRole('checkbox', { name: t.disclosure.real_name, exact: true }).check();
  await submit.click();
  await expect(page.getByText(t.submitted, { exact: true })).toBeVisible();
  await expect(page.getByText(t.waiting, { exact: true })).toBeVisible();
  expect(state.writes[1]).toEqual({ method: 'PUT', path: '/applications/ta/teacher-form', key: expect.any(String), body: { name: 'Lin Wei', organization: 'School of Computing', email: 'lin@demo.edu', material_type: 'contract', material_ids: ['mat1'], disclosures: ['real_name', 'teacher'], revision: 1 } });
});

test('a returned application shows the review note and keeps the saved form', async ({ page }, info) => {
  const t = catalogue(info).teacher;
  await server(page, { applications: [application({ state: 'supplement_required', revision: 4, review_note: 'The staff card photo is blurry.' })], form: { name: 'Lin Wei', organization: 'School of Computing', email: 'lin@demo.edu', material_type: 'staff_card', material_ids: [], disclosures: ['teacher', 'organization'], revision: 4 } });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(t.reviewNote, { note: 'The staff card photo is blurry.' }), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.supplement, exact: true }).click();
  await expect(page.getByRole('textbox', { name: t.name, exact: true })).toHaveValue('Lin Wei');
  await expect(page.getByRole('checkbox', { name: t.disclosure.organization, exact: true })).toBeChecked();
  // Without any material the form cannot be submitted.
  await expect(page.getByRole('button', { name: t.submit, exact: true })).toBeDisabled();
});

test('an approved teacher sees linked profiles and changes the public details', async ({ page }, info) => {
  const t = catalogue(info).teacher;
  const state = await server(page, { credentials: [credential({})], applications: [application({ state: 'approved', revision: 3, credential_id: 'tc' })] });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(t.profiles, { names: new Intl.ListFormat(info.project.metadata.locale, { style: 'long', type: 'conjunction' }).format(['Prof. Lin', 'Dr. Zhao']) }), { exact: true })).toBeVisible();
  await expect(page.getByText(t.noExpiry, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: t.history, exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.changeDisclosures, exact: true }).click();
  await page.getByRole('checkbox', { name: t.disclosure.teacher, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: t.disclosure.gender, exact: true }).check();
  await page.getByRole('button', { name: catalogue(info).common.save, exact: true }).click();
  await expect(page.getByText(t.disclosuresSaved, { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ method: 'PUT', path: '/teacher-credentials/tc/disclosures', body: { revision: 3, disclosures: ['gender'] }, key: expect.any(String) }]);
  await expect(page.getByText(t.disclosure.gender, { exact: true })).toBeVisible();
});

test('school selection sends codes names and aliases to the server and handles empty results', async ({ page }, info) => {
  const m = catalogue(info);
  await server(page);
  const queries = [];
  await page.route('**/api/v1/verification/schools?**', route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q) queries.push(q);
    return route.fulfill({ json: q === '99999' ? [] : [school] });
  });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  const picker = page.getByRole('group', { name: m.verification.school, exact: true });
  for (const q of ['4111010006', '10006', '北京航空航天大学', '北航', '99999']) {
    await picker.getByRole('searchbox').fill(q);
    await picker.getByRole('button', { name: m.common.search, exact: true }).click();
    await expect.poll(() => queries.at(-1)).toBe(q);
    if (q === '99999') await expect(picker.getByRole('radio')).toHaveCount(0);
    else await expect(picker.getByRole('radio', { name: school.name, exact: true })).toBeVisible();
  }
});

test('an in-progress teacher draft can switch school and syncs phone-captured material thumbnails automatically', async ({ page }, info) => {
  const m = catalogue(info), t = m.teacher, v = m.verification;
  const state = await server(page, {
    schools: [school, secondSchool],
    applications: [application({ id: 'ta', school_id: 'school', state: 'in_progress' })],
  });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: v.changeSchool, exact: true }).click();
  await page.getByLabel(secondSchool.name, { exact: true }).check();
  await page.getByLabel(t.consent, { exact: true }).check();
  await page.getByRole('button', { name: t.apply, exact: true }).click();
  await expect(page.getByRole('region', { name: t.application, exact: true }).getByText(secondSchool.name, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: v.capture.phone, exact: true }).click();
  await expect(page.getByRole('img', { name: v.capture.scan, exact: true })).toBeVisible();
  state.materials = [{ id: 'mat-phone', application_id: 'aa-new', content_type: 'image/png', size: 68, created_at: '2026-11-18T00:00:00Z' }];
  await page.getByRole('button', { name: v.capture.sync, exact: true }).click();

  await expect(page.getByRole('img', { name: v.capture.scan, exact: true })).toHaveCount(0);
  await expect(page.getByText(fill(t.materials, { count: number(info, 1) }), { exact: true })).toBeVisible();
  await expect(page.locator('img.material-thumb')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: t.application, exact: true }).getByText(secondSchool.name, { exact: true })).toBeVisible();
});

test('a failed teacher evidence read can be retried before editing', async ({ page }, info) => {
  const m = catalogue(info);
  const state = await server(page, { applications: [application({})] });
  let reads = 0;
  await page.route('**/applications/ta/materials?**', route => {
    reads++;
    return reads === 1 ? route.fulfill({ status: 503, json: { code: 'unavailable' } }) : route.fallback();
  });
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  const edit = page.getByRole('button', { name: m.teacher.fillForm, exact: true });
  await edit.click();
  await expect(page.getByRole('alert')).toContainText(m.errors.unavailable);
  await edit.click();
  await expect(page.locator('#teacher-email')).toBeEditable();
  expect(reads).toBe(2);
  expect(state.writes).toEqual([]);
});

test('the current teacher application and its school can both follow a full first page', async ({ page }, info) => {
  const t = catalogue(info).teacher;
  const state = await server(page);
  const calls = { schools: [], applications: [] };
  const ids = Array.from({ length: 100 }, (_, index) => String(index).padStart(3, '0'));
  for (const kind of ['schools', 'applications']) {
    await page.route(`**/api/v1/verification/${kind}?**`, route => {
      const after = new URL(route.request().url()).searchParams.get('after') ?? '';
      calls[kind].push(after);
      const first = ids.map(id => kind === 'schools' ? { ...school, id, name: id } : application({ id, state: 'approved' }));
      const last = kind === 'schools' ? secondSchool : application({ school_id: secondSchool.id });
      return route.fulfill({ json: after === '099' ? [last] : first });
    });
  }
  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  const active = page.getByRole('region', { name: t.application, exact: true });
  await expect(active.getByText(secondSchool.name, { exact: true })).toBeVisible();
  await active.getByRole('button', { name: t.fillForm, exact: true }).click();
  await expect(page.locator('#teacher-email')).toBeEditable();
  expect(calls).toEqual({ schools: ['', '099'], applications: ['', '099'] });
  expect(state.writes).toEqual([]);
});
