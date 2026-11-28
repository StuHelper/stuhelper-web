import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const school = { id: 'school', name: 'Test University', enabled: true, methods: ['real_name_identity_check', 'school_sso'], profile_schema: 'buaa.imported.v1', notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'example.edu', material_types: [], revision: 1 };
const credential = { id: 'credential', school_id: 'school', method: 'real_name_identity_check', stage: 'bachelor', kind: 'student', state: 'active', student_display: '2026****01', revision: 1, verified_at: '2026-11-14T04:00:00Z', expires_at: null };
const application = { id: 'application', school_id: 'school', method: 'real_name_identity_check', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', expires_at: '2030-01-01T00:00:00Z', credential_id: '', result_code: '' };
const transferPublication = { document_id: 'email-transfer', version: 'v1', digest: 'a'.repeat(64) };
const transferStatus = { document: { ...transferPublication, url: 'https://example.com/legal/email-transfer/v1' }, accepted: false };
async function fixture(page, options = {}) {
  const state = { writes: [], schoolData: { state: 'inactive' }, schoolDataWrites: [], profile: { school_id: 'school', data_status: 'partial', schema: 'buaa.imported.v1', revision: 1, collected_at: '2020-01-01T00:00:00Z', source_revision: '1', fields: { student_id: '20260001', name: 'Synthetic Student', college_name: 'Test College', major_name: null, department: 'Test Department', contact_email: 'synthetic@example.edu' }, field_sources: { student_id: 'oracle_students', name: 'unknown', college_name: 'academic_profile', department: 'oracle_departments', contact_email: 'future_source' } } };
  await page.route('**/api/v1/catalog/objects**', route => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.route('**/api/v1/verification/**', route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.split('/verification/')[1];
    if (endpoint === 'me/school-data') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        state.schoolDataWrites.push({ ...body, password: body.password ? '[set]' : '' });
        if (body.password === 'wrong') return route.fulfill({ status: 422, json: { code: 'school_credentials_rejected' } });
        state.schoolData = { state: 'active', verified_at: '2026-11-26T00:00:00Z', authorized_through: { id: 'autumn-2026', year: 2026, season: 'autumn' } };
      } else if (request.method() === 'DELETE') state.schoolData = { ...state.schoolData, state: 'historical' };
      return route.fulfill({ json: state.schoolData });
    }
    if (endpoint === 'me/school-data/history-consent') {
      state.schoolDataWrites.push(request.postDataJSON());
      state.schoolData = { ...state.schoolData, history_consent_required: false };
      return route.fulfill({ json: state.schoolData });
    }
    if (request.method() === 'POST') {
      state.writes.push(request.postDataJSON());
      if (endpoint === 'applications') return route.fulfill({ json: options.school ? { ...application, ...request.postDataJSON() } : application });
      return route.fulfill({ status: 422, json: { code: options.errorCode ?? 'verification_information_mismatch' } });
    }
    if (endpoint === 'summary') return route.fulfill({ json: { campus_eligibility: true, teacher_verified: false, identity_verified: false, evaluated_at: '2026-11-14T00:00:00Z', revision: 1, next_evaluation_at: null } });
    if (endpoint === 'email-transfer-consent' && request.method() === 'GET') return route.fulfill({ json: transferStatus });
    if (options.loadFailure && endpoint === 'schools') return route.fulfill({ status: 503, json: { code: 'unavailable' } });
    if (endpoint.endsWith('/profile')) return options.profileFailure?.(endpoint) ? route.fulfill({ status: 503, json: { code: 'unavailable' } }) : route.fulfill({ json: state.profile });
    if (endpoint === 'applications' && options.applications) return route.fulfill({ json: options.applications });
    if (endpoint === 'requests' && options.requests) return route.fulfill({ json: options.requests });
    return route.fulfill({ json: endpoint === 'schools' ? [options.school ?? school] : endpoint === 'credentials' ? [credential, { ...credential, id: 'second', verified_at: '2025-05-01T00:00:00Z' }] : [] });
  });
  return state;
}
const messages = info => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
function transferAgreeButton(page, verification) {
  return page.getByRole('region', { name: verification.transfer.title, exact: true })
    .getByRole('button', { name: verification.transfer.agree, exact: true });
}
// Opens the page and waits until loading has settled. With `steps`, the verification steps are
// opened as well: someone already verified sees the status first and starts a new verification on request.
async function open(page, info, { steps = false } = {}) {
  await page.goto(`${base}/me/verification?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  if (steps) {
    const start = page.getByRole('button', { name: messages(info).verification.status.startAnother, exact: true });
    if (await start.isVisible()) await start.click();
    await expect(page.getByRole('region', { name: messages(info).verification.start, exact: true })).toBeVisible();
    // Opening the steps scrolls them into view smoothly; layout measurements start once the scroll has stopped.
    await page.waitForFunction(() => new Promise(resolve => {
      let y = scrollY, still = 0;
      const tick = () => { still = scrollY === y ? still + 1 : 0; y = scrollY; if (still >= 10) resolve(document.getAnimations().every(animation => animation.playState !== 'running')); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
  }
  await page.evaluate(() => document.fonts.ready);
}
const verificationSteps = page => page.locator('section[aria-labelledby="verification-step-title"]');
const experiences = (page, info) => page.getByRole('region', { name: messages(info).verification.experiences, exact: true });
const profileCard = (page, info) => page.getByRole('region', { name: messages(info).verification.profileTitle, exact: true });
async function shot(page, info, name, target = page) {
  if (!process.env.VERIFICATION_SCREENSHOTS) return;
  fs.mkdirSync(process.env.VERIFICATION_SCREENSHOTS, { recursive: true });
  await target.screenshot({ path: path.join(process.env.VERIFICATION_SCREENSHOTS, `${info.project.name}-${name}.png`), ...(target === page ? { fullPage: name === 'dropdowns' } : {}) });
}

test('verification dropdowns have zero layout displacement when opened and closed', async ({ page, headless }, info) => {
  await fixture(page); await open(page, info, { steps: true });
  // A real reserved gutter exercises the desktop scrollbar compensation even in headless Chromium.
  await page.addStyleTag({ content: 'html { overflow-y: scroll; scrollbar-width: auto; } ::-webkit-scrollbar { width: 16px; }' });
  if (!headless && !info.project.name.startsWith('mobile')) expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
  // One school needs no picker and identities are radio buttons, so the study stage is the one dropdown left in step one.
  const controls = verificationSteps(page).getByRole('combobox');
  await expect(controls).toHaveCount(1);
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    // Center the target before measuring so Playwright's click auto-scroll is outside the observation.
    await control.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const measure = () => page.evaluate(() => [...document.querySelectorAll('h1, form:first-of-type, .app-select')].map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    // The final centering scroll can also start the step entrance animation. Take the baseline
    // after both scrolling and the form geometry are stationary, retaining exact rectangle checks.
    await page.waitForFunction(() => new Promise(resolve => {
      let previous = '', stable = 0;
      function frame() {
        const next = JSON.stringify([scrollY, ...[...document.querySelectorAll('h1, form:first-of-type, .app-select')].map(node => node.getBoundingClientRect().toJSON())]);
        stable = next === previous ? stable + 1 : 0;
        previous = next;
        if (stable >= 5) resolve(true);
        else requestAnimationFrame(frame);
      }
      frame();
    }));
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
  const stage = controls.first();
  await stage.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: messages(info).verification.stages.bachelor, exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: messages(info).verification.stages.master, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage).toBeFocused();
  await expect(stage).toContainText(messages(info).verification.stages.master);
  await shot(page, info, 'dropdowns');
  await stage.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await shot(page, info, 'dropdown-open');
});

test('verification failure stays beside submit with focus and retained input', async ({ page }, info) => {
  const state = await fixture(page); await open(page, info, { steps: true });
  const m = messages(info), v = m.verification;
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
  await page.getByLabel(v.document, { exact: true }).fill('TEST0001');
  await page.getByRole('button', { name: v.submit, exact: true }).click();
  const error = verificationSteps(page).getByRole('alert');
  await expect(error).toContainText(m.errors.information_mismatch);
  await expect(error).toBeFocused();
  await expect(error).toHaveAttribute('aria-live', 'assertive');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(verificationSteps(page).getByLabel(v.studentId, { exact: true })).toHaveValue('20260001');
  await expect(page.getByLabel(v.name, { exact: true })).toHaveValue('Synthetic Student');
  await expect(page.getByLabel(v.document, { exact: true })).toHaveValue('TEST0001');
  const a = await error.boundingBox(), b = await page.getByRole('button', { name: v.submit, exact: true }).boundingBox();
  expect(Math.abs(b.y - (a.y + a.height))).toBeLessThan(40);
  expect(state.writes).toHaveLength(2);
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  await shot(page, info, 'inline-error');
});

test('a check shows its wait, and repeated failures show a countdown that keeps submit closed', async ({ page }, info) => {
  await fixture(page); await open(page, info, { steps: true });
  const m = messages(info), v = m.verification;
  let release, checks = 0;
  await page.route('**/api/v1/verification/applications/*/verify', async (route) => {
    checks += 1;
    await new Promise((resolve) => { release = resolve; });
    return route.fulfill({ status: 429, headers: { 'Retry-After': '65' }, json: { code: 'rate_limited', retry_after_seconds: 65 } });
  });
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
  await page.getByLabel(v.document, { exact: true }).fill('TEST0001');
  const submit = page.getByRole('button', { name: v.submit, exact: true });
  await submit.click();
  await expect(page.getByRole('status').filter({ hasText: v.checking })).toBeVisible();
  await expect.poll(() => typeof release).toBe('function');
  release();
  const countdown = page.getByRole('status').filter({ hasText: v.cooldown.split('{time}')[0].trim() });
  await expect(countdown).toContainText(/01:0[0-5]/);
  // The countdown replaces the generic message, and the form stays filled but closed.
  await expect(page.getByText(m.errors.rate_limited)).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await expect(verificationSteps(page).getByLabel(v.studentId, { exact: true })).toHaveValue('20260001');
  expect(checks).toBe(1);
});

test('profile shows plain field labels and binds authentication time to the selected credential', async ({ page }, info) => {
  const state = await fixture(page); await open(page, info);
  const m = messages(info), v = m.verification;
  state.profile.fields.identity_valid_until = '2028-09-01';
  // The status card opens the profile of the active credential, under that credential.
  await page.getByRole('region', { name: v.statusTitle, exact: true }).getByRole('button', { name: v.viewProfile }).click();
  const card = profileCard(page, info);
  await expect(card).toHaveCount(1);
  await expect(experiences(page, info).getByRole('listitem').first().getByRole('region', { name: v.profileTitle, exact: true })).toBeVisible();
  await expect(card).not.toContainText(m.common.unknown);
  // Field labels stand alone; no data-source annotation is shown.
  await expect(card).not.toContainText(v.profileSources.academic_profile);
  for (const field of ['student_id', 'college_name']) await expect(card.locator('dt').filter({ hasText: v.profileFields[field] })).toHaveText(v.profileFields[field]);
  await expect(card.locator('dt').filter({ hasText: v.profileFields.name })).toHaveText(v.profileFields.name);
  expect(await card.locator('[data-profile-field]').evaluateAll(nodes => nodes.map(node => node.dataset.profileField))).toEqual(['student_id', 'name', 'college_name']);
  await expect(card).not.toContainText(state.profile.fields.contact_email);
  await expect(card).not.toContainText(v.profileStatus.partial);
  await expect(card.locator('time')).toHaveAttribute('datetime', credential.verified_at);
  await expect(card).not.toContainText(v.profileFields.major_name);
  await shot(page, info, 'profile', card);
  state.profile.fields.major_name = 'Test Major';
  await experiences(page, info).getByRole('button', { name: v.viewProfile }).nth(1).click();
  await expect(card).toHaveCount(1);
  await expect(experiences(page, info).getByRole('listitem').nth(1).getByRole('region', { name: v.profileTitle, exact: true })).toBeVisible();
  await expect(card.locator('time')).toHaveAttribute('datetime', '2025-05-01T00:00:00Z');
  await expect(card).not.toContainText(v.profileStatus.partial);
  await expect(card).not.toContainText(m.common.notProvided);
});

test('verification page banner is reserved for loading failures', async ({ page }, info) => {
  const options = { loadFailure: true };
  await fixture(page, options); await open(page, info);
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.locator('form').getByRole('alert')).toHaveCount(0);
  // Retrying after the service recovers replaces the banner with the status.
  options.loadFailure = false;
  await page.getByRole('alert').getByRole('button', { name: messages(info).common.retry, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('region', { name: messages(info).verification.statusTitle, exact: true })).toContainText(messages(info).verification.status.verified.title);
});

test('verification status leads the page and opens the steps on request', async ({ page }, info) => {
  await fixture(page); await open(page, info);
  const m = messages(info), v = m.verification;
  const status = page.getByRole('region', { name: v.statusTitle, exact: true });
  await expect(status.getByRole('heading', { level: 2 })).toHaveText(v.status.verified.title);
  await expect(status).toContainText(credential.student_display);
  // A verified person sees the outcome first; the steps stay closed until asked for.
  const steps = page.getByRole('region', { name: v.start, exact: true });
  await expect(steps).toHaveCount(0);
  await page.getByRole('button', { name: v.status.startAnother, exact: true }).click();
  await expect(steps).toBeVisible();
  await expect(steps.getByRole('heading', { name: v.start, exact: true })).toBeFocused();
  const current = page.getByRole('list', { name: v.steps.label, exact: true }).locator('[aria-current="step"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(new RegExp(v.steps.choose));
  await shot(page, info, 'status-and-steps');
  await steps.getByRole('button', { name: m.common.cancel, exact: true }).click();
  await expect(steps).toHaveCount(0);
  await expect(page.getByRole('button', { name: v.status.startAnother, exact: true })).toBeVisible();
});

test('method cards keep methods an identity cannot use visible with the reason', async ({ page }, info) => {
  const configured = { ...school, method_capabilities: { real_name_identity_check: { study_stage_required: false, allowed_kinds: ['student', 'alumni'] }, school_sso: { study_stage_required: false, allowed_kinds: ['student'] } } };
  await fixture(page, { school: configured }); await open(page, info, { steps: true });
  const v = messages(info).verification;
  const realName = page.getByRole('radio', { name: v.methods.real_name_identity_check }), sso = page.getByRole('radio', { name: v.methods.school_sso });
  await expect(realName).toBeChecked();
  await expect(sso).toHaveAccessibleDescription(v.needs.school_sso);
  // The arrow keys move the choice between method cards, as in any radio group.
  await realName.focus();
  await page.keyboard.press('ArrowDown');
  await expect(sso).toBeChecked();
  await expect(sso).toBeFocused();
  await verificationSteps(page).getByLabel(v.consent).check();
  // An alumnus cannot use the school account: the card stays, says why, and the choice and the consent reset.
  await page.getByRole('radio', { name: v.kinds.student, exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: v.kinds.alumni, exact: true })).toBeChecked();
  await expect(sso).toBeDisabled();
  await expect(sso).toHaveAccessibleDescription(v.picker.unavailable);
  await expect(realName).toBeChecked();
  await expect(verificationSteps(page).getByLabel(v.consent)).not.toBeChecked();
  await expect(verificationSteps(page).getByRole('button', { name: v.continue, exact: true })).toBeDisabled();
  await shot(page, info, 'method-cards');
});

test('shared selects keep scroll locking by default outside verification', async ({ page }, info) => {
  await fixture(page); await open(page, info);
  const select = page.locator('header').getByRole('combobox');
  // The desktop language selector uses AppSelect without an override.
  if (await select.count()) {
    await select.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  } else {
    const footerSelect = page.locator('footer').getByRole('combobox');
    await footerSelect.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  }
});


test('school method capability removes stage and explains identity rejection', async ({ page }, info) => {
  const configured = { ...school, methods: ['school_sso'], method_capabilities: { school_sso: { study_stage_required: false, allowed_kinds: ['student'] } } };
  const state = await fixture(page, { school: configured, errorCode: 'method_identity_not_allowed' });
  await open(page, info, { steps: true });
  const m = messages(info), v = m.verification;
  await expect(page.getByRole('combobox', { name: v.stage, exact: true })).toHaveCount(0);
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  expect(state.writes[0].stage).toBe('unknown');
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await verificationSteps(page).getByLabel(v.password, { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: v.submit, exact: true }).click();
  await expect(verificationSteps(page).getByRole('alert')).toContainText(m.errors.method_identity_not_allowed);
  await shot(page, info, 'method-capability');
});

test('manual method keeps identity selection and advertises configured graduate materials', async ({ page }, info) => {
  const configured = { ...school, methods: ['manual_material_review'], material_types: ['student_card', 'enrollment_certificate', 'graduation_certificate'], method_capabilities: { manual_material_review: { study_stage_required: false, allowed_kinds: ['student', 'alumni'] } } };
  await fixture(page, { school: configured });
  await open(page, info, { steps: true });
  const v = messages(info).verification;
  await expect(page.getByRole('combobox', { name: v.stage, exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: v.kind, exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: v.kinds.student, exact: true })).toBeChecked();
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  const materials = page.getByRole('combobox', { name: v.materialType, exact: true });
  await materials.click();
  await expect(page.getByRole('option', { name: v.materialTypes.graduation_certificate, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: v.materialTypes.admission_letter, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

for (const [method, codes] of Object.entries({ real_name_identity_check: ['real_name_mismatch', 'real_name_no_record'], student_email_outbound_otp: ['email_identity_mismatch', 'email_identity_no_record'], school_sso: ['school_credentials_rejected', 'school_account_locked', 'school_account_disabled', 'school_account_unavailable'] })) {
  for (const code of codes) test(`method-specific verification failure ${code}`, async ({ page }, info) => {
    await fixture(page, { errorCode: code, school: { ...school, methods: [method], method_capabilities: { [method]: { study_stage_required: false } }, method_description_keys: { real_name_identity_check: 'verification.methodDescriptions.real_name_identity_check' } } });
    await open(page, info, { steps: true });
    const m = messages(info), v = m.verification;
    await expect(page.getByLabel(v.stage, { exact: true })).toHaveCount(0);
    if (method === 'real_name_identity_check') await expect(page.getByText(v.methodDescriptions.real_name_identity_check, { exact: true })).toBeVisible();
    await verificationSteps(page).getByLabel(v.consent).check();
    await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
    await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('ZY2306123');
    if (method === 'school_sso') await verificationSteps(page).getByLabel(v.password, { exact: true }).fill('synthetic-password');
    else await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
    if (method === 'real_name_identity_check') await page.getByLabel(v.document, { exact: true }).fill('TEST0001');
    const outbound = method === 'student_email_outbound_otp';
    await page.getByRole('button', { name: outbound ? v.createChallenge : v.submit, exact: true }).click();
    if (outbound) await transferAgreeButton(page, v).click();
    const error = verificationSteps(page).getByRole('alert');
    await expect(error).toHaveText(m.errors[code]);
    await expect(verificationSteps(page).getByLabel(v.studentId, { exact: true })).toHaveValue('ZY2306123');
    if (outbound) await expect(page.getByLabel(v.document, { exact: true })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  });
}
test('school email step shows live sending state, verifies six digits and allows going back', async ({ page }, info) => {
  const v = messages(info).verification;
  const mailSchool = { ...school, methods: ['student_email_outbound_otp'] };
  const mailApplication = { ...application, method: 'student_email_outbound_otp' };
  let mail = { id: 'mail', application_id: 'application', expires_at: '2030-01-01T00:05:00Z', state: 'queued', masked_email: '20****01@example.edu', target_address: '' };
  const writes = [];
  await page.route('**/api/v1/catalog/objects**', route => route.fulfill({ json: { items: [], next_cursor: '' } }));
  await page.route('**/api/v1/verification/**', route => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname.endsWith('/me/school-data')) return route.fulfill({ json: { state: 'inactive' } });
    const request = route.request(), endpoint = new URL(request.url()).pathname.split('/verification/')[1];
    if (request.method() === 'POST') writes.push(endpoint);
    if (request.method() === 'POST' && endpoint === 'applications') return route.fulfill({ json: mailApplication });
    if (request.method() === 'POST' && endpoint === 'applications/application/email') return route.fulfill({ json: mail });
    if (request.method() === 'POST' && endpoint === 'applications/application/email/confirm') return route.fulfill({ json: { ...mailApplication, state: 'approved' } });
    if (endpoint === 'email-transfer-consent' && request.method() === 'GET') return route.fulfill({ json: transferStatus });
    if (endpoint === 'applications/application/email') {
      mail = { ...mail, state: 'delivered' };
      return route.fulfill({ json: mail });
    }
    if (endpoint === 'summary') return route.fulfill({ json: { campus_eligibility: false, teacher_verified: false, identity_verified: false, evaluated_at: '2026-11-14T00:00:00Z', revision: 1, next_evaluation_at: null } });
    return route.fulfill({ json: endpoint === 'schools' ? [mailSchool] : [] });
  });
  await open(page, info, { steps: true });
  await verificationSteps(page).getByRole('checkbox', { name: v.consent, exact: true }).check();
  await page.getByRole('button', { name: v.continue }).click();

  // Going back re-enables the method selection without reloading the page.
  await page.getByRole('button', { name: v.back }).click();
  await expect(page.getByRole('radio', { name: v.methods.student_email_outbound_otp })).toBeEnabled();
  await expect(page.getByRole('radio', { name: v.methods.student_email_outbound_otp })).toBeChecked();
  await page.getByRole('button', { name: v.continue }).click();
  const current = page.getByRole('list', { name: v.steps.label, exact: true }).locator('[aria-current="step"]');
  await expect(current).toHaveText(new RegExp(v.steps.fill));

  await verificationSteps(page).getByLabel(v.studentId).fill('20260001');
  await page.getByLabel(v.name).fill('Synthetic Student');
  await page.getByRole('button', { name: v.createChallenge }).click();
  await transferAgreeButton(page, v).click();
  await expect(current).toHaveText(new RegExp(v.steps.finish));
  await expect(page.getByRole('status').filter({ hasText: v.emailStep.sending })).toBeVisible();
  await expect(page.getByText(v.emailStep.sent.replace('{email}', '20****01@example.edu'))).toBeVisible();
  // Resending waits for the one-minute server limit and shows the countdown.
  const resend = page.locator('.email-step .form-actions button').nth(1);
  await expect(resend).toBeDisabled();
  await expect(resend).not.toHaveText(v.emailStep.resend);

  const codeInput = page.getByLabel(v.emailCode, { exact: true });
  await codeInput.fill('482 916');
  await expect(codeInput).toHaveCount(0);
  expect(writes).toContain('applications/application/email/confirm');
});

// A delayed provider status must not permanently disable the explicit resend action.
test('queued email can be resent after the cooldown without a delivered status', async ({ page }, info) => {
  const v = messages(info).verification;
  await page.clock.install({ time: new Date('2026-11-15T01:00:00Z') });
  await fixture(page, { school: { ...school, methods: ['student_email_outbound_otp'] } });
  const mailApplication = { ...application, method: 'student_email_outbound_otp' };
  await page.route('**/api/v1/verification/applications**', route => {
    const req = route.request(), endpoint = new URL(req.url()).pathname.split('/verification/')[1];
    if (req.method() === 'POST' && endpoint === 'applications') return route.fulfill({ json: mailApplication });
    if (endpoint === 'applications/application/email') return route.fulfill({ json: { id: 'queued-mail', application_id: 'application', expires_at: '2026-11-15T01:05:00Z', state: 'queued', masked_email: '20****01@example.edu', target_address: '' } });
    return route.fulfill({ json: [] });
  });
  await open(page, info, { steps: true });
  await verificationSteps(page).getByRole('checkbox', { name: v.consent, exact: true }).check();
  await page.getByRole('button', { name: v.continue }).click();
  await verificationSteps(page).getByLabel(v.studentId).fill('20260001');
  await page.getByLabel(v.name).fill('Synthetic Student');
  await page.getByRole('button', { name: v.createChallenge }).click();
  await transferAgreeButton(page, v).click();
  const resend = page.locator('.email-step .form-actions button').nth(1);
  await expect(resend).toBeDisabled();
  await page.clock.fastForward(61_000);
  await expect(resend).toBeEnabled();
});

test('school profile renders exactly the three server-projected fields', async ({ page }, info) => {
  const state = await fixture(page);
  state.profile.fields = { student_id: '20260001', name: 'Synthetic Student', department: 'Test Department' };
  state.profile.field_sources = { student_id: 'oracle_students', name: 'oracle_students', department: 'oracle_departments' };
  await open(page, info);
  const v = messages(info).verification;
  await experiences(page, info).getByRole('button', { name: v.viewProfile }).first().click();
  const card = profileCard(page, info);
  await expect(card.locator('[data-profile-field]')).toHaveCount(3);
  expect(await card.locator('[data-profile-field]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-profile-field')).sort())).toEqual(['department', 'name', 'student_id']);
  await expect(card.locator('dd')).toHaveText(['20260001', 'Synthetic Student', 'Test Department']);
  await expect(card).not.toContainText(messages(info).common.unknown);
  await shot(page, info, 'projected-profile', card);
});

test('restored email resend collects identity again before submitting', async ({ page }, info) => {
  const v = messages(info).verification;
  await fixture(page, { school: { ...school, methods: ['student_email_outbound_otp'] } });
  const restored = { ...application, method: 'student_email_outbound_otp' };
  const writes = [];
  await page.route('**/api/v1/verification/applications**', route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.split('/verification/')[1];
    if (request.method() === 'POST') writes.push(request.postDataJSON());
    if (endpoint === 'applications') return route.fulfill({ json: [restored] });
    if (endpoint === 'applications/application/email') return route.fulfill({ json: { id: 'restored-mail', application_id: 'application', expires_at: '2020-01-01T00:00:00Z', state: 'delivered', masked_email: '20****01@example.edu', target_address: '' } });
    return route.fulfill({ json: [] });
  });
  await open(page, info);
  await page.getByRole('region', { name: v.applications, exact: true }).getByRole('button', { name: v.continue, exact: true }).click();
  await expect(page.locator('.email-step')).toBeVisible();
  await page.getByRole('button', { name: v.emailStep.resend, exact: true }).click();
  await expect(verificationSteps(page).getByLabel(v.studentId, { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
  await page.getByRole('button', { name: v.createChallenge, exact: true }).click();
  const agree = transferAgreeButton(page, v);
  await expect(agree).toBeVisible();
  expect(writes).toEqual([]);
  await agree.click();
  await expect.poll(() => writes).toEqual([{
    student_id: '20260001', name: 'Synthetic Student',
    email_transfer_consent: { ...transferPublication, accepted: true },
  }]);
});

test('a failed school profile is reported once, under the credential that asked for it', async ({ page }, info) => {
  await fixture(page, { profileFailure: endpoint => endpoint.startsWith('credentials/second/') });
  await open(page, info);
  const m = messages(info), v = m.verification;
  const cards = experiences(page, info).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  // The delete form of the same credential is open; the failure still shows under that credential.
  await cards.nth(1).getByRole('button', { name: v.requestDelete, exact: true }).click();
  await cards.nth(1).getByRole('button', { name: v.viewProfile, exact: true }).click();
  await expect(experiences(page, info).getByRole('alert')).toHaveCount(1);
  await expect(cards.nth(1).getByRole('alert')).toContainText(m.errors.unavailable);
  await expect(cards.nth(1).getByRole('alert')).toBeFocused();
  await expect(cards.nth(0).getByRole('alert')).toHaveCount(0);
  // A later success elsewhere clears it.
  await cards.nth(0).getByRole('button', { name: v.viewProfile, exact: true }).click();
  await expect(profileCard(page, info)).toBeVisible();
  await expect(experiences(page, info).getByRole('alert')).toHaveCount(0);
});

test('an inbound email challenge moves to the last step and shows its one-time address', async ({ page, context }, info) => {
  const v = messages(info).verification;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fixture(page, { school: { ...school, methods: ['student_email_inbound_challenge'] } });
  const challenge = { id: 'mail', application_id: 'application', expires_at: '2030-01-01T00:05:00Z', state: 'waiting', masked_email: '20****01@example.edu', target_address: 'verify-7f3a@example.edu' };
  await page.route('**/api/v1/verification/applications/application/email', route => route.request().method() === 'POST' ? route.fulfill({ json: challenge }) : route.fulfill({ status: 404, json: { code: 'not_found' } }));
  await open(page, info, { steps: true });
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await page.getByLabel(v.name, { exact: true }).fill('Synthetic Student');
  await page.getByRole('button', { name: v.createChallenge, exact: true }).click();
  await expect(page.getByRole('list', { name: v.steps.label, exact: true }).locator('[aria-current="step"]')).toHaveText(new RegExp(v.steps.finish));
  await expect(page.getByText(challenge.target_address, { exact: true })).toBeVisible();
  await expect(page.getByText(v.inboundHelp, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: v.copyInboundAddress, exact: true }).click();
  await expect(page.getByText(v.inboundAddressCopied, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(challenge.target_address);
});

test('a failed school login returns the open application to the form for another try', async ({ page }, info) => {
  const v = messages(info).verification;
  await fixture(page, { school: { ...school, methods: ['school_sso'], method_capabilities: { school_sso: { study_stage_required: false } } } });
  const verifies = [];
  await page.route('**/api/v1/verification/applications/application/verify', route => {
    verifies.push(route.request().postDataJSON());
    return route.fulfill({ json: { ...application, method: 'school_sso', stage: 'unknown', school_challenge: { id: 'challenge', state: 'failed', code: 'school_credentials_rejected', expires_at: '2030-01-01T00:00:00Z', masked_phone: '' } } });
  });
  await open(page, info, { steps: true });
  await verificationSteps(page).getByLabel(v.consent).check();
  await verificationSteps(page).getByRole('button', { name: v.continue, exact: true }).click();
  await verificationSteps(page).getByLabel(v.studentId, { exact: true }).fill('20260001');
  await verificationSteps(page).getByLabel(v.password, { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: v.submit, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: v.schoolStates.failed })).toBeVisible();
  await expect(page.getByRole('list', { name: v.steps.label, exact: true }).locator('[aria-current="step"]')).toHaveText(new RegExp(v.steps.fill));
  // The password is cleared after each attempt and can be entered again for the same application.
  await expect(verificationSteps(page).getByLabel(v.password, { exact: true })).toHaveValue('');
  await verificationSteps(page).getByLabel(v.password, { exact: true }).fill('synthetic-password-2');
  await page.getByRole('button', { name: v.submit, exact: true }).click();
  await expect.poll(() => verifies.length).toBe(2);
  expect(verifies[1]).toMatchObject({ student_id: '20260001', password: 'synthetic-password-2' });
});

test('school data authorization is granted by term, and stopping rechecks keeps the authorized terms', async ({ page }, info) => {
  const v = messages(info).verification, sd = v.schoolData, locale = info.project.metadata.locale;
  const term = sd.term.replace('{year}', new Intl.NumberFormat(locale, { useGrouping: false }).format(2026)).replace('{season}', sd.seasons.autumn);
  const state = await fixture(page); await open(page, info);
  // The verification page keeps one row for school data; its rules and form have their own page.
  const entry = page.getByRole('link', { name: new RegExp(sd.title) });
  await expect(entry).toContainText(sd.inactive);
  await expect(page.getByLabel(sd.consent, { exact: true })).toHaveCount(0);
  await entry.click();
  await expect(page).toHaveURL(/\/me\/verification\/school-data/);
  await expect(page.getByRole('heading', { level: 1, name: sd.title, exact: true })).toBeVisible();
  const card = page.getByRole('region', { name: sd.statusTitle, exact: true });
  await expect(card.getByText(sd.inactive, { exact: true })).toBeVisible();
  // The card no longer repeats the rules; it links to them in the privacy policy.
  await expect(card.getByRole('link', { name: sd.rules, exact: true })).toHaveAttribute('href', '/legal/privacy');
  // Without an authorization there is nothing to stop.
  await expect(card.getByRole('button', { name: sd.stop, exact: true })).toHaveCount(0);
  const submit = card.getByRole('button', { name: sd.submit, exact: true });
  await card.getByLabel(v.studentId, { exact: true }).fill('20260001');
  await card.getByLabel(sd.password, { exact: true }).fill('wrong');
  await expect(submit).toBeDisabled();
  await card.getByLabel(sd.consent, { exact: true }).check();
  await submit.click();
  await expect(card.getByRole('alert')).toBeVisible();
  // A rejected password is cleared; the student ID stays for the next try.
  await expect(card.getByLabel(sd.password, { exact: true })).toHaveValue('');
  await expect(card.getByLabel(v.studentId, { exact: true })).toHaveValue('20260001');
  await card.getByLabel(sd.password, { exact: true }).fill('secret');
  await submit.click();
  await expect(card.getByText(sd.active, { exact: true })).toBeVisible();
  await expect(card.getByText(term, { exact: true })).toBeVisible();
  await expect(card.getByText(sd.verifiedAt, { exact: true })).toBeVisible();
  // The consent covers the term rules, so their version is sent with it.
  expect(state.schoolDataWrites.at(-1)).toEqual({ student_id: '20260001', password: '[set]', accepted: true, history_notice_version: 'termscope-v1' });
  await card.getByRole('button', { name: sd.stop, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: sd.stopTitle, exact: true });
  await expect(dialog).toContainText(sd.stopMessage.replace('{term}', term));
  await dialog.getByRole('button', { name: sd.stop, exact: true }).click();
  // The authorized terms stay; the card offers to turn it on again to extend them.
  await expect(card.getByText(sd.historical, { exact: true })).toBeVisible();
  await expect(card.getByText(sd.historicalNote.replace('{term}', term), { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: sd.reopen, exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: sd.stop, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an earlier school data authorization keeps its past terms only after consenting to the term rules', async ({ page }, info) => {
  const sd = messages(info).verification.schoolData;
  const state = await fixture(page);
  state.schoolData = { state: 'historical', verified_at: '2026-11-26T00:00:00Z', authorized_through: { id: 'autumn-2026', year: 2026, season: 'autumn' }, history_consent_required: true };
  await page.goto(`${base}/me/verification/school-data?lang=${info.project.metadata.locale}`);
  const card = page.getByRole('region', { name: sd.statusTitle, exact: true });
  const keep = card.getByRole('button', { name: sd.historyConsent.submit, exact: true });
  await expect(card.getByText(sd.historyConsent.text, { exact: true })).toBeVisible();
  await expect(keep).toBeDisabled();
  await card.getByLabel(sd.historyConsent.check, { exact: true }).check();
  await keep.click();
  await expect(keep).toHaveCount(0);
  expect(state.schoolDataWrites.at(-1)).toEqual({ accepted: true, history_notice_version: 'termscope-v1' });
});

test('finished applications and requests are folded into the history, open ones stay in view', async ({ page }, info) => {
  const v = messages(info).verification;
  const done = (id, state, method) => ({ ...application, id, state, method, updated_at: '2026-11-15T00:00:00Z' });
  await fixture(page, {
    applications: [done('a1', 'approved', 'school_sso'), done('a2', 'expired', 'student_email_outbound_otp'), done('a3', 'pending_review', 'manual_material_review')],
    requests: [{ id: 'r1', credential_id: 'credential', school_id: 'school', kind: 'revoke', state: 'rejected', reason: 'moved', note: '', revision: 1, created_at: '2026-11-15T00:00:00Z' }],
  });
  await open(page, info);
  const current = page.getByRole('region', { name: v.applications, exact: true });
  await expect(current.getByRole('listitem')).toHaveCount(1);
  await expect(current).toContainText(v.states.pending_review);
  await expect(page.getByRole('region', { name: v.requests, exact: true })).toHaveCount(0);
  const toggle = page.getByRole('button', { name: v.history.replace('{count}', new Intl.NumberFormat(info.project.metadata.locale).format(3)), exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(v.methods.student_email_outbound_otp, { exact: true })).toBeHidden();
  await toggle.click();
  await expect(page.getByText(v.methods.student_email_outbound_otp, { exact: true })).toBeVisible();
  await expect(page.getByText(v.states.approved, { exact: true })).toBeVisible();
  await expect(page.getByText(v.states.rejected, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('independent identity requires separate market consent and allows withdrawal after a match', async ({ page }, info) => {
  await fixture(page);
  const locale = info.project.metadata.locale;
  const messagesForPage = messages(info);
  const state = { active: false, revision: 0 };
  const notice = { available: true, version: 'test-idv', locale, digest: 'a'.repeat(64), text: 'Synthetic seller · test notice', state };
  const summary = { campus_eligibility: false, teacher_verified: false, identity_verified: false, evaluated_at: '2026-11-28T00:00:00Z', revision: 1, next_evaluation_at: null };
  const submissions = [];
  await page.route('**/api/v1/verification/identity/market-consent*', async route => {
    if (route.request().method() === 'DELETE') {
      state.active = false;
      state.revision++;
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: notice });
  });
  await page.route('**/api/v1/verification/summary*', route => route.fulfill({ json: summary }));
  await page.route('**/api/v1/verification/identity', async route => {
    submissions.push(route.request().postDataJSON());
    state.active = true;
    state.revision++;
    summary.identity_verified = true;
    summary.identity_masked = { name: '*试', document_type: 'cn_resident_id_card', document_number: '0****************1' };
    return route.fulfill({ json: summary });
  });
  await page.goto(`${base}/me/account/identity?lang=${locale}`);
  await page.getByLabel(messagesForPage.verification.outsideRoster).check();
  await page.getByLabel(messagesForPage.verification.name, { exact: true }).fill('合成测试');
  await page.getByLabel(messagesForPage.verification.document, { exact: true }).fill('000000000000000001');
  const agree = page.getByLabel(messagesForPage.verification.agreeMarket);
  const submit = page.getByRole('button', { name: messagesForPage.verification.submit, exact: true });
  await expect(agree).not.toBeChecked();
  await expect(submit).toBeDisabled();
  expect(submissions).toHaveLength(0);
  await agree.check();
  await submit.click();
  const withdraw = page.getByRole('button', { name: messagesForPage.verification.withdrawMarket });
  await expect(withdraw).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0].market_consent).toEqual({ accepted: true, version: notice.version, digest: notice.digest, locale, revision: 0 });
  expect(submissions[0].student_id).toBeUndefined();
  await withdraw.click();
  await expect(withdraw).toHaveCount(0);
  expect(state.revision).toBe(2);
});

test('independent identity never offers a disabled market check', async ({ page }, info) => {
  const state = await fixture(page);
  const locale = info.project.metadata.locale;
  const msg = messages(info);
  await page.route('**/api/v1/verification/identity/market-consent*', route => route.fulfill({ json: {
    available: false, version: 'test-idv', locale, digest: 'b'.repeat(64), text: 'Synthetic notice', state: { active: false, revision: 0 },
  } }));
  await page.goto(`${base}/me/account/identity?lang=${locale}`);
  await page.getByLabel(msg.verification.outsideRoster).check();
  await expect(page.getByText(msg.errors.online_identity_unsupported)).toBeVisible();
  await expect(page.getByLabel(msg.verification.agreeMarket)).toHaveCount(0);
  await expect(page.getByRole('button', { name: msg.verification.submit, exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test('a roster miss offers a fresh unchecked notice and recovers from a failed notice load', async ({ page }, info) => {
  await fixture(page);
  const locale = info.project.metadata.locale;
  const msg = messages(info);
  const input = [];
  let noticeLoads = 0;
  await page.route('**/api/v1/verification/identity/market-consent*', route => {
    if (++noticeLoads <= 2) return route.fulfill({ status: 503, json: { code: 'dependency_unavailable' } });
    return route.fulfill({ json: { available: true, version: 'test-idv', locale, digest: 'b'.repeat(64), text: 'Synthetic notice', state: { active: false, revision: 0 } } });
  });
  await page.route('**/api/v1/verification/identity', route => {
    input.push(route.request().postDataJSON());
    return route.fulfill({ status: 403, json: { code: 'market_consent_required' } });
  });
  await page.goto(`${base}/me/account/identity?lang=${locale}`);
  await page.getByLabel(msg.verification.consent, { exact: true }).check();
  await page.getByLabel(msg.verification.studentId, { exact: true }).fill('synthetic-student');
  await page.getByLabel(msg.verification.name, { exact: true }).fill('合成测试');
  await page.getByLabel(msg.verification.document, { exact: true }).fill('000000000000000001');
  await page.getByRole('button', { name: msg.verification.submit, exact: true }).click();
  await page.getByRole('button', { name: msg.common.retry, exact: true }).click();
  await expect(page.getByLabel(msg.verification.agreeMarket)).not.toBeChecked();
  await expect(page.getByLabel(msg.verification.document, { exact: true })).toHaveValue('000000000000000001');
  expect(input).toHaveLength(1);
  expect(input[0].market_consent).toBeUndefined();
});
