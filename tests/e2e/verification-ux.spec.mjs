import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const school = { id: 'school', name: 'Test University', enabled: true, methods: ['real_name_identity_check', 'school_sso'], profile_schema: 'buaa.imported.v1', notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'example.edu', material_types: [], revision: 1 };
const credential = { id: 'credential', school_id: 'school', method: 'real_name_identity_check', stage: 'bachelor', kind: 'student', state: 'active', student_display: '2026****01', revision: 1, verified_at: '2026-11-14T04:00:00Z', expires_at: null };
const application = { id: 'application', school_id: 'school', method: 'real_name_identity_check', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', expires_at: '2030-01-01T00:00:00Z', credential_id: '', result_code: '' };
async function fixture(page, options = {}) {
  const state = { writes: [], profile: { school_id: 'school', data_status: 'partial', schema: 'buaa.imported.v1', revision: 1, collected_at: '2020-01-01T00:00:00Z', source_revision: '1', fields: { student_id: '20260001', name: 'Synthetic Student', college_name: 'Test College', major_name: null }, field_sources: { student_id: 'unknown', name: 'future_source', college_name: 'academic_profile' } } };
  await page.route('**/api/v1/catalog/objects**', route => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.route('**/api/v1/verification/**', route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.split('/verification/')[1];
    if (request.method() === 'POST') {
      state.writes.push(request.postDataJSON());
      if (endpoint === 'applications') return route.fulfill({ json: application });
      return route.fulfill({ status: 422, json: { code: 'verification_information_mismatch' } });
    }
    if (endpoint === 'summary') return route.fulfill({ json: { campus_eligibility: true, teacher_verified: false, identity_verified: false, evaluated_at: '2026-11-14T00:00:00Z', revision: 1, next_evaluation_at: null } });
    if (options.loadFailure && endpoint === 'schools') return route.fulfill({ status: 503, json: { code: 'unavailable' } });
    if (endpoint.endsWith('/profile')) return route.fulfill({ json: state.profile });
    return route.fulfill({ json: endpoint === 'schools' ? [school] : endpoint === 'credentials' ? [credential, { ...credential, id: 'second', verified_at: '2025-05-01T00:00:00Z' }] : [] });
  });
  return state;
}
const messages = info => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
async function open(page, info) {
  await page.goto(`${base}/me/verification?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('combobox').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, info, name, target = page) {
  if (!process.env.VERIFICATION_SCREENSHOTS) return;
  fs.mkdirSync(process.env.VERIFICATION_SCREENSHOTS, { recursive: true });
  await target.screenshot({ path: path.join(process.env.VERIFICATION_SCREENSHOTS, `${info.project.name}-${name}.png`), ...(target === page ? { fullPage: name === 'dropdowns' } : {}) });
}

test('verification dropdowns have zero layout displacement when opened and closed', async ({ page, headless }, info) => {
  await fixture(page); await open(page, info);
  // A real reserved gutter exercises the desktop scrollbar compensation even in headless Chromium.
  await page.addStyleTag({ content: 'html { overflow-y: scroll; scrollbar-width: auto; } ::-webkit-scrollbar { width: 16px; }' });
  if (!headless && !info.project.name.startsWith('mobile')) expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
  const controls = page.locator('form').first().getByRole('combobox');
  for (let index = 0; index < 3; index++) {
    const control = controls.nth(index);
    // Center the target before measuring so Playwright's click auto-scroll is outside the observation.
    await control.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const measure = () => page.evaluate(() => [...document.querySelectorAll('h1, form:first-of-type, .app-select')].map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    const before = await measure();
    if (info.project.name.startsWith('mobile')) await control.tap();
    else await control.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await measure()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(control).toBeFocused();
    expect(await measure()).toEqual(before);
  }
  // Keyboard selection updates the value and restores focus without submitting the form.
  const stage = controls.nth(1);
  await stage.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: messages(info).verification.stages.bachelor, exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: messages(info).verification.stages.master, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage).toBeFocused();
  await expect(stage).toContainText(messages(info).verification.stages.master);
  await shot(page, info, 'dropdowns');
  await controls.first().click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await shot(page, info, 'dropdown-open');
});

test('verification failure stays beside submit with focus and retained input', async ({ page }, info) => {
  const state = await fixture(page); await open(page, info);
  const m = messages(info), v = m.verification;
  await page.getByLabel(v.consent).check();
  await page.locator('form').first().getByRole('button', { name: v.continue, exact: true }).click();
  await page.getByLabel(v.studentId, { exact: true }).fill('20260001');
  await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
  await page.getByLabel(v.document, { exact: true }).fill('TEST0001');
  await page.getByRole('button', { name: v.submit, exact: true }).click();
  const error = page.locator('form').first().getByRole('alert');
  await expect(error).toContainText(m.errors.information_mismatch);
  await expect(error).toBeFocused();
  await expect(error).toHaveAttribute('aria-live', 'assertive');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByLabel(v.studentId, { exact: true })).toHaveValue('20260001');
  await expect(page.getByLabel(v.name, { exact: true })).toHaveValue('Synthetic Student');
  await expect(page.getByLabel(v.document, { exact: true })).toHaveValue('TEST0001');
  const a = await error.boundingBox(), b = await page.getByRole('button', { name: v.submit, exact: true }).boundingBox();
  expect(Math.abs(b.y - (a.y + a.height))).toBeLessThan(40);
  expect(state.writes).toHaveLength(2);
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  await shot(page, info, 'inline-error');
});

test('profile hides unknown sources and binds authentication time to the selected credential', async ({ page }, info) => {
  const state = await fixture(page); await open(page, info);
  const m = messages(info), v = m.verification;
  await page.getByRole('button', { name: v.viewProfile }).first().click();
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: v.profileTitle, exact: true }) });
  await expect(card).not.toContainText(m.common.unknown);
  await expect(card).toContainText(v.profileSources.academic_profile);
  await expect(card).not.toContainText(v.profileStatus.partial);
  await expect(card.locator('time')).toHaveAttribute('datetime', credential.verified_at);
  await expect(card).toContainText(v.profileFields.major_name);
  await expect(card).toContainText(m.common.notProvided);
  await shot(page, info, 'profile', card);
  state.profile.fields.major_name = 'Test Major';
  await page.getByRole('button', { name: v.viewProfile }).nth(1).click();
  await expect(card.locator('time')).toHaveAttribute('datetime', '2025-05-01T00:00:00Z');
  await expect(card).not.toContainText(v.profileStatus.partial);
  await expect(card).not.toContainText(m.common.notProvided);
});

test('verification page banner is reserved for loading failures', async ({ page }, info) => {
  await fixture(page, { loadFailure: true }); await open(page, info);
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.locator('form').first().getByRole('alert')).toHaveCount(0);
});
