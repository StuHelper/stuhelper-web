import { Buffer } from 'node:buffer';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { captureHomepage } from '../teacher-homepage-screenshot.mjs';
import { catalogue, localizedUrl, managePath, openForm, pickField, png, receipt, serveHomepageRequests, teachers } from './teacher-homepage-fixture.mjs';

const [teacher] = teachers;
const teacherPath = managePath(teacher);
const receiptPath = '/me/teacher-homepage/requests';
const newText = 'Updated homepage information';
const explanation = 'Please update the details on my homepage.';

test('a teacher submits fixed text and can then request to hide the whole homepage', async ({ page }, info) => {
  const messages = catalogue(info);
  const { request, fields } = messages.teacherHomepage;
  const writes = await serveHomepageRequests(page);
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);

  await editor.field.click();
  await expect(page.getByRole('textbox', { name: messages.common.searchOptions, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: fields.page, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickField(page, editor, messages, 'name');
  await editor.content.fill(` ${newText} `);
  await editor.message.fill(` ${explanation} `);
  await editor.submit.click();
  await expect(editor.sent).toBeVisible();
  await expect(page.getByRole('link', { name: `${request.kinds.correction} · ${fields.name}` })).toBeVisible();

  const next = await openForm(page, messages);
  await expect(next.message).toHaveValue('');
  await next.form.getByRole('radio', { name: request.kinds.hide, exact: true }).check();
  await pickField(page, next, messages, 'page');
  await expect(next.content).toHaveCount(0);
  await next.message.fill(explanation);
  await next.submit.click();
  await expect(next.sent).toBeVisible();
  expect(writes).toEqual([
    { teacherId: teacher.id, key: expect.any(String), body: { kind: 'correction', field: { field: 'name' }, value: { text: newText }, message: explanation } },
    { teacherId: teacher.id, key: expect.any(String), body: { kind: 'hide', field: { field: 'page' }, message: explanation } },
  ]);
  expect(writes[0].key).not.toBe(writes[1].key);
});

test('a general field requires an item name and accepts up to 160 Unicode code points', async ({ page }, info) => {
  const messages = catalogue(info);
  const writes = await serveHomepageRequests(page);
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);
  await pickField(page, editor, messages, 'fields');
  await editor.content.fill(newText);
  await editor.message.fill(explanation);
  await expect(editor.submit).toBeDisabled();
  await expect(page.locator('html')).toHaveAttribute('dir', info.project.metadata.locale === 'ar-EG' ? 'rtl' : 'ltr');
  const layout = await editor.form.evaluate((form) => {
    const formBounds = form.getBoundingClientRect();
    const fieldEdges = Array.from(form.querySelectorAll('input[type="text"], textarea'), (field) => {
      const bounds = field.getBoundingClientRect();
      return Math.max(Math.abs(bounds.left - formBounds.left), Math.abs(bounds.right - formBounds.right));
    });
    const overflow = Math.max(...[form, document.documentElement].map((node) => node.scrollWidth - node.clientWidth));
    return { fieldEdges, overflow };
  });
  expect(layout.fieldEdges).toHaveLength(3);
  for (const edge of layout.fieldEdges) expect(edge).toBeLessThanOrEqual(1);
  expect(layout.overflow).toBe(0);
  if (['desktop-zh-CN', 'mobile-ar-EG'].includes(info.project.name)) {
    await captureHomepage(editor.form, `request-form-${info.project.name}.png`);
  }

  const name = '𠮷'.repeat(160);
  await editor.itemName.focus();
  await page.keyboard.insertText(name);
  await expect(editor.itemName).toHaveValue(name);
  await expect(editor.submit).toBeEnabled();
  await page.keyboard.insertText('𠮷');
  await expect(editor.itemName).toHaveValue(`${name}𠮷`);
  await expect(editor.submit).toBeDisabled();
  expect(writes).toEqual([]);

  await editor.itemName.fill(name);
  await editor.submit.click();
  await expect(editor.sent).toBeVisible();
  expect(writes).toEqual([{ teacherId: teacher.id, key: expect.any(String), body: {
    kind: 'correction', field: { field: 'fields', label: name }, value: { text: newText }, message: explanation,
  } }]);
});

test('a teacher supplies the section title with the proposed text', async ({ page }, info) => {
  const messages = catalogue(info);
  const { request } = messages.teacherHomepage;
  const writes = await serveHomepageRequests(page);
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);
  await editor.form.getByRole('radio', { name: request.kinds.supplement, exact: true }).check();
  await pickField(page, editor, messages, 'sections');
  await editor.content.fill(newText);
  await editor.message.fill(explanation);
  await expect(editor.submit).toBeDisabled();
  await editor.itemName.fill(' Research projects ');
  await editor.submit.click();
  await expect(editor.sent).toBeVisible();
  expect(writes).toEqual([{ teacherId: teacher.id, key: expect.any(String), body: {
    kind: 'supplement', field: { field: 'sections', label: 'Research projects' }, value: { text: newText }, message: explanation,
  } }]);
});

test('a supervisor request sends all selected roles or an explicit empty list', async ({ page }, info) => {
  const messages = catalogue(info);
  const { supervisors } = messages.teacherHomepage;
  const writes = await serveHomepageRequests(page);
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);
  await pickField(page, editor, messages, 'supervisors');
  await editor.form.getByRole('checkbox', { name: supervisors.doctoral, exact: true }).check();
  await editor.form.getByRole('checkbox', { name: supervisors.master, exact: true }).check();
  await editor.message.fill(explanation);
  await editor.submit.click();
  await expect(editor.sent).toBeVisible();

  const next = await openForm(page, messages);
  await pickField(page, next, messages, 'supervisors');
  await expect(next.form.getByRole('checkbox', { name: supervisors.doctoral, exact: true })).not.toBeChecked();
  await expect(next.form.getByRole('checkbox', { name: supervisors.master, exact: true })).not.toBeChecked();
  await next.message.fill(explanation);
  await next.submit.click();
  await expect(next.sent).toBeVisible();
  expect(writes).toEqual([
    { teacherId: teacher.id, key: expect.any(String), body: { kind: 'correction', field: { field: 'supervisors' }, value: { supervisors: ['博士生导师', '硕士生导师'] }, message: explanation } },
    { teacherId: teacher.id, key: expect.any(String), body: { kind: 'correction', field: { field: 'supervisors' }, value: { supervisors: [] }, message: explanation } },
  ]);
});

test('a photo request rejects the wrong type and size and submits the original PNG bytes', async ({ page }, info) => {
  const messages = catalogue(info);
  const { request } = messages.teacherHomepage;
  const writes = await serveHomepageRequests(page);
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);
  await pickField(page, editor, messages, 'photo');
  await editor.message.fill(explanation);
  const file = editor.form.locator('input[type=file]');
  const preview = editor.form.getByRole('img', { name: request.photoPreview, exact: true });
  const alert = editor.form.getByRole('alert');

  await file.setInputFiles({ name: 'portrait.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(alert).toHaveText(request.photoType);
  await expect(editor.submit).toBeDisabled();
  await expect(preview).toHaveCount(0);

  await file.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(alert).toHaveText(request.photoSize);
  await expect(editor.submit).toBeDisabled();
  await expect(preview).toHaveCount(0);
  expect(writes).toEqual([]);

  await file.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: png });
  await expect(alert).toHaveCount(0);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1);
  await editor.submit.click();
  await expect(editor.sent).toBeVisible();
  expect(writes).toEqual([{ teacherId: teacher.id, key: expect.any(String), body: {
    kind: 'correction', field: { field: 'photo' }, value: { photo: { content_type: 'image/png', data: png.toString('base64') } }, message: explanation,
  } }]);
});

test('a conflict or rate limit explains the rejection and preserves the teacher’s draft', async ({ page }, info) => {
  const messages = catalogue(info);
  const errors = [{ status: 409, code: 'conflict' }, { status: 429, code: 'rate_limited' }];
  const writes = await serveHomepageRequests(page, { errors });
  await page.goto(localizedUrl(teacherPath, info));
  const editor = await openForm(page, messages);
  await editor.content.fill(newText);
  await editor.message.fill(explanation);
  for (const { code } of errors) {
    await editor.submit.click();
    await expect(editor.form.getByRole('alert')).toHaveText(messages.errors[code]);
    await expect(editor.content).toHaveValue(newText);
    await expect(editor.message).toHaveValue(explanation);
    await expect(page.getByText(messages.teacherHomepage.request.none, { exact: true })).toBeVisible();
  }
  expect(writes).toEqual(errors.map(() => ({ teacherId: teacher.id, key: expect.any(String), body: {
    kind: 'correction', field: { field: 'biography' }, value: { text: newText }, message: explanation,
  } })));
});

test('request history opens pending, approved and rejected receipts and handles an expired receipt', async ({ page }, info) => {
  const messages = catalogue(info);
  const h = messages.teacherHomepage;
  const receipts = [
    receipt({ kind: 'correction', field: { field: 'biography' }, value: { text: 'Proposed biography' }, message: 'The current biography is incomplete.' }, 'pending-request', teacher.id),
    { ...receipt({ kind: 'hide', field: { field: 'email' }, message: 'Please hide my old email address.' }, 'approved-request', teacher.id), status: 'approved', revision: 2, resolved_at: '2026-11-19T00:00:00Z', resolution_note: 'The old email address was hidden.' },
    { ...receipt({ kind: 'supplement', field: { field: 'sections', label: 'Current projects' }, value: { text: 'Proposed section content' }, message: 'Please list my research projects.' }, 'rejected-request', teacher.id), status: 'rejected', revision: 2, resolved_at: '2026-11-19T00:00:00Z', resolution_note: 'Please provide a reference from the school website.' },
  ];
  await serveHomepageRequests(page, { receipts });
  await page.goto(localizedUrl(teacherPath, info));

  for (const item of receipts) {
    const title = `${h.request.kinds[item.kind]} · ${item.field.label ?? h.fields[item.field.field]}`;
    const row = page.getByRole('region', { name: h.request.history, exact: true }).getByRole('link', { name: title });
    await expect(row).toHaveAttribute('href', `${receiptPath}/${item.id}`);
    await expect(row.getByText(h.request.status[item.status], { exact: true })).toBeVisible();
    await row.click();
    await expect(page.getByRole('heading', { name: h.receipt.title, exact: true })).toBeVisible();
    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(detail.getByText(h.request.status[item.status], { exact: true })).toBeVisible();
    await expect(detail.getByText(item.message, { exact: true })).toBeVisible();
    await expect(detail.getByText(h.receipt.submitted, { exact: true })).toBeVisible();
    if (item.value?.text) await expect(detail.getByText(item.value.text, { exact: true })).toBeVisible();
    else await expect(detail.getByRole('heading', { name: h.request.value, exact: true })).toHaveCount(0);

    if (item.resolution_note) {
      await expect(detail.getByText(h.receipt.resolved, { exact: true })).toBeVisible();
      await expect(detail.getByText(item.resolution_note, { exact: true })).toBeVisible();
    } else {
      await expect(detail.getByText(h.receipt.resolved, { exact: true })).toHaveCount(0);
      await expect(detail.getByRole('heading', { name: h.receipt.note, exact: true })).toHaveCount(0);
    }
    const back = page.getByRole('link', { name: h.manage, exact: true });
    await expect(back).toHaveAttribute('href', teacherPath);
    await back.click();
  }

  await page.goto(localizedUrl(`${receiptPath}/expired-request`, info));
  await expect(page.getByRole('alert')).toContainText(messages.errors.not_found);
  await expect(page.getByRole('article')).toHaveCount(0);
});
