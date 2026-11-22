import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { captureHomepage } from '../teacher-homepage-screenshot.mjs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { fixture as academicFixture } from './academic-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = ({ project }) => JSON.parse(fs.readFileSync(`src/locales/${project.metadata.locale}.json`, 'utf8'));
const teacherPath = (id) => `/api/v1/catalog/objects/${id}/teacher-homepage`;
const teacherURL = (info, id = 'teacher-a') => `${base}/teachers/${id}?lang=${info.project.metadata.locale}`;
const photoPath = `${teacherPath('teacher-a')}/photos/${'a'.repeat(64)}`;
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const timestamp = '2026-11-01T00:00:00Z';

const emptyProfile = { supervisors: [], fields: [], sections: [] };
const profile = {
  name: 'Prof. Lin',
  position: 'Research group coordinator',
  education: 'Graduate school',
  degree: 'PhD',
  discipline: 'Computer science',
  email: 'faculty@example.invalid',
  phone: '010-00000000',
  office_location: 'Room 203',
  hire_date: 'September 2021',
  supervisors: ['博士生导师', '硕士生导师'],
  biography: 'First line.\n<em>Second line</em>',
  research: 'Language and cognition',
  fields: [{ label: 'Research group', value: 'Computing & Society' }],
  sections: [{ title: 'Recent work', text: '<strong>Study A</strong>\nStudy B' }],
  photo: { url: photoPath, content_type: 'image/png', width: 1, height: 1 },
};

const credential = (id, state, teacherIds) => ({
  id, school_id: 'school', teacher_ids: teacherIds, state, revision: 1, verified_at: timestamp,
  expires_at: null, source: 'manual_material_review', note: '', disclosures: ['teacher'],
});

async function installFixture(page, credentials = []) {
  await academicFixture(page);
  await page.route('**/api/v1/verification/teacher-credentials?**', route => route.fulfill({ json: credentials }));
  await page.route(`**${teacherPath('teacher-a')}`, route => route.fulfill({ json: { profile } }));
  await page.route(`**${photoPath}`, route => route.fulfill({ contentType: 'image/png', body: tinyPng }));
}

async function screenshot(target, info, view) {
  const project = info.project.name;
  if (['desktop-zh-CN', 'mobile-ar-EG'].includes(project)) {
    await captureHomepage(target, `${view}-${project}.png`);
  }
}

test('the teacher page shows plain-text homepage details and a session-loaded photo', async ({ page }, info) => {
  const m = catalogue(info);
  const h = m.teacherHomepage;
  await installFixture(page);
  await page.goto(teacherURL(info));
  const homepage = page.getByRole('region', { name: h.title, exact: true });

  await expect(homepage.getByText(profile.name, { exact: true })).toBeVisible();
  for (const field of ['position', 'education', 'degree', 'discipline', 'email', 'phone', 'office_location', 'hire_date']) {
    const label = homepage.getByText(h.fields[field], { exact: true });
    await expect(label).toBeVisible();
    await expect(label.locator('..').getByText(profile[field], { exact: true })).toBeVisible();
  }
  await expect(homepage.getByText(h.supervisors.doctoral, { exact: true })).toBeVisible();
  await expect(homepage.getByText(h.supervisors.master, { exact: true })).toBeVisible();
  await expect(homepage.getByRole('heading', { name: h.fields.biography, exact: true })).toBeVisible();
  const biography = homepage.getByText(profile.biography, { exact: true });
  await expect(biography).toBeVisible();
  await expect(biography).toHaveCSS('white-space', 'pre-wrap');
  await expect(biography.locator('em')).toHaveCount(0);
  await expect(homepage.getByRole('heading', { name: h.fields.research, exact: true })).toBeVisible();
  await expect(homepage.getByText(profile.research, { exact: true })).toBeVisible();
  const field = profile.fields[0];
  await expect(homepage.getByText(field.label, { exact: true }).locator('..').getByText(field.value, { exact: true })).toBeVisible();

  const section = profile.sections[0];
  const sectionText = homepage.getByText(section.text, { exact: true });
  await expect(sectionText).toBeHidden();
  await homepage.getByText(section.title, { exact: true }).click();
  await expect(sectionText).toBeVisible();
  await expect(sectionText.locator('strong')).toHaveCount(0);
  await expect(homepage.getByText(h.source, { exact: true })).toBeVisible();

  const photo = homepage.getByRole('img', { name: h.photo.replace('{name}', profile.name), exact: true });
  await expect(photo).toHaveAttribute('src', /^blob:/);
  await expect(photo).toHaveJSProperty('naturalWidth', 1);
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(homepage, info, 'homepage');
});

test('a teacher page with no visible profile leaves out the homepage panel for a reader', async ({ page }, info) => {
  const m = catalogue(info);
  await installFixture(page);
  for (const [id, body, name] of [
    ['teacher-a', {}, 'Teacher A'],
    ['teacher-b', { profile: emptyProfile }, 'Teacher B'],
  ]) {
    await page.route(`**${teacherPath(id)}`, route => route.fulfill({ json: body }));
    const reading = page.waitForResponse(res => new URL(res.url()).pathname === teacherPath(id));
    await page.goto(teacherURL(info, id));
    await (await reading).finished();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: m.academic.subject.mentorReviews, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: m.teacherHomepage.title, exact: true })).toHaveCount(0);
  }
});

test('a reader can retry a homepage error and a failed photo leaves the profile readable', async ({ page }, info) => {
  const m = catalogue(info);
  await installFixture(page);
  let homepageReads = 0;
  await page.route(`**${teacherPath('teacher-a')}`, route => {
    homepageReads++;
    if (homepageReads === 1) return route.fulfill({ status: 503, json: { code: 'unavailable' } });
    return route.fulfill({ json: { profile } });
  });
  await page.route(`**${photoPath}`, route => route.fulfill({ status: 404, json: { code: 'not_found' } }));

  await page.goto(teacherURL(info));
  const homepage = page.getByRole('region', { name: m.teacherHomepage.title, exact: true });
  await expect(homepage.getByRole('alert')).toContainText(m.errors.unavailable);
  await expect(page.getByRole('heading', { level: 1, name: 'Teacher A', exact: true })).toBeVisible();
  const readingPhoto = page.waitForResponse(res => new URL(res.url()).pathname === photoPath && res.status() === 404);
  await homepage.getByRole('button', { name: m.common.retry, exact: true }).click();
  await (await readingPhoto).finished();
  await expect(homepage.getByRole('alert')).toHaveCount(0);
  await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
  await expect(homepage.getByRole('img')).toHaveCount(0);
  const mentorReviews = page.getByRole('tab', { name: m.academic.subject.mentorReviews, exact: true });
  await mentorReviews.click();
  await expect(mentorReviews).toHaveAttribute('aria-selected', 'true');
  expect(homepageReads).toBe(2);
});

test('a teacher with an active credential for the profile can manage the homepage', async ({ page }, info) => {
  const { teacherHomepage: h, common, errors } = catalogue(info);
  await installFixture(page);
  const credentials = Promise.withResolvers();
  let firstRead = true;
  await page.route('**/api/v1/verification/teacher-credentials?**', async route => {
    if (firstRead) {
      firstRead = false;
      await credentials.promise;
      return route.fulfill({ status: 500, json: { code: 'unavailable' } });
    }
    return route.fulfill({ json: [credential('current', 'active', ['teacher-a'])] });
  });
  await page.route(`**${teacherPath('teacher-a')}/requests?**`, route => route.fulfill({ json: { items: [], total: 0, next: '' } }));
  const homepage = page.getByRole('region', { name: h.title, exact: true });
  const complain = homepage.getByRole('button', { name: h.complain, exact: true });
  try {
    await page.goto(teacherURL(info));
    await expect(homepage.getByText(profile.name, { exact: true })).toBeVisible();
    await expect(complain).toHaveCount(0);
  } finally {
    credentials.resolve();
  }
  const error = homepage.getByRole('alert');
  await expect(error).toContainText(errors.unavailable);
  await expect(complain).toHaveCount(0);
  await error.getByRole('button', { name: common.retry, exact: true }).click();
  const manage = homepage.getByRole('link', { name: h.manage, exact: true });
  await expect(manage).toHaveAttribute('href', '/me/teacher-homepage/teacher-a');
  await expect(complain).toHaveCount(0);
  await manage.click();
  await expect(page).toHaveURL(/\/me\/teacher-homepage\/teacher-a(?:\?|$)/);
  await expect(page.getByText(h.request.none, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: h.manageTitle.replace('{name}', 'Teacher A'), exact: true })).toBeVisible();
});

test('a non-owner can report a homepage with a category and up to 2000 code points', async ({ page }, info) => {
  const m = catalogue(info);
  const h = m.teacherHomepage;
  const writes = [];
  await installFixture(page, [credential('other', 'active', ['teacher-b']), credential('past', 'revoked', ['teacher-a'])]);
  await page.route('**/api/v1/moderation/teacher-homepage-complaints/teacher-a', route => {
    const request = route.request();
    const body = request.postDataJSON();
    writes.push({ method: request.method(), key: request.headers()['idempotency-key'], body });
    return route.fulfill({ json: {
      id: 'complaint', school_id: 'school', submission: { object_id: 'teacher-a', kind: 'report', ...body },
      object_revision: 1, revision: 1, state: 'waiting', created_at: timestamp, updated_at: timestamp,
      content_kind: 'teacher_homepage',
    } });
  });

  const readingCredentials = page.waitForResponse(res => new URL(res.url()).pathname === '/api/v1/verification/teacher-credentials');
  await page.goto(teacherURL(info));
  await (await readingCredentials).finished();
  const homepage = page.getByRole('region', { name: h.title, exact: true });
  await homepage.getByRole('button', { name: h.complain, exact: true }).click();

  const dialog = page.getByRole('dialog', { name: h.complaint.title, exact: true });
  const submit = dialog.getByRole('button', { name: m.common.submit, exact: true });
  const reason = dialog.getByRole('textbox', { name: h.complaint.reason });
  const evidence = dialog.getByRole('textbox', { name: h.complaint.evidence });
  const detail = '🏫'.repeat(2000);
  const proof = '📚'.repeat(2000);
  await reason.fill('The listed office information is out of date.');
  await expect(submit).toBeDisabled();

  const category = m.violation.categories.wrong_info;
  await dialog.getByRole('combobox', { name: m.violation.label, exact: true }).click();
  await page.getByRole('textbox', { name: m.common.searchOptions }).fill(category.name);
  await page.getByRole('option', { name: category.name, exact: true }).click();
  await expect(dialog.getByText(category.hint, { exact: true })).toBeVisible();
  await expect(submit).toBeEnabled();
  await screenshot(dialog, info, 'complaint');

  await reason.fill(detail);
  await expect(reason).toHaveAttribute('aria-invalid', 'false');
  await expect(submit).toBeEnabled();
  await reason.fill(`${detail}🏫`);
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(submit).toBeDisabled();
  await reason.fill(detail);
  await evidence.fill(`${proof}📚`);
  await expect(evidence).toHaveAttribute('aria-invalid', 'true');
  await expect(submit).toBeDisabled();
  expect(writes).toEqual([]);

  await evidence.fill(` ${proof}\n\n Additional evidence `);
  await expect(evidence).toHaveAttribute('aria-invalid', 'false');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog.getByRole('status')).toHaveText(h.complaint.sent);
  expect(writes).toEqual([{
    method: 'POST', key: expect.any(String), body: { category: 'wrong_info', reason: detail, evidence: [proof, 'Additional evidence'] },
  }]);

  await dialog.locator('form').getByRole('button', { name: m.common.close, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(homepage.getByRole('link', { name: h.manage, exact: true })).toHaveCount(0);
});

test('teacher verification links each active profile to its own homepage management page', async ({ page }, info) => {
  const m = catalogue(info);
  const h = m.teacherHomepage;
  await installFixture(page, [
    credential('active', 'active', ['teacher-a', 'teacher-b']),
    credential('past', 'expired', ['teacher-retired']),
  ]);
  await page.route('**/api/v1/verification/applications?**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/verification/schools?**', route => route.fulfill({ json: [{
    id: 'school', name: 'Test University', enabled: true, methods: ['manual_material_review'],
    notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'example.invalid',
    teacher_enabled: true, teacher_material_types: ['staff_card'], material_types: [], revision: 1,
  }] }));
  await page.route(`**${teacherPath('teacher-b')}/requests?**`, route => route.fulfill({ json: { items: [], total: 0, next: '' } }));

  await page.goto(`${base}/me/verification/teacher?lang=${info.project.metadata.locale}`);
  const credentials = page.getByRole('region', { name: m.teacher.credentials, exact: true });
  const link = (name) => credentials.getByRole('link', { name: h.manageFor.replace('{name}', name), exact: true });
  await expect(link('Teacher A')).toHaveAttribute('href', '/me/teacher-homepage/teacher-a');
  await expect(link('Teacher B')).toHaveAttribute('href', '/me/teacher-homepage/teacher-b');
  await expect(link('teacher-retired')).toHaveCount(0);
  await link('Teacher B').click();
  await expect(page).toHaveURL(/\/me\/teacher-homepage\/teacher-b(?:\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: h.manageTitle.replace('{name}', 'Teacher B'), exact: true })).toBeVisible();
  await expect(page.getByText(h.request.none, { exact: true })).toBeVisible();
  await screenshot(page.locator('main'), info, 'management');
});
