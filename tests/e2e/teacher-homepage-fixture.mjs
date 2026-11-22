import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { expect } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogObject = { school_id: 'school', credits: null, aliases: [], revision: 1, updated_at: '2026-10-27T00:00:00Z' };
const school = { ...catalogObject, id: 'school', kind: 'school', name: 'Test University' };
export const teachers = [
  { ...catalogObject, id: 'teacher-a', kind: 'teacher', name: 'Prof. Lin' },
  { ...catalogObject, id: 'teacher-b', kind: 'teacher', name: 'Teacher Zhao' },
];
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
export const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
export const managePath = (teacher) => `/me/teacher-homepage/${teacher.id}`;
export const localizedPath = (path, info) => `${path}?lang=${info.project.metadata.locale}`;
export const localizedUrl = (path, info) => base + localizedPath(path, info);

export function receipt(body, id, teacherId) {
  return { ...body, id, teacher_id: teacherId, status: 'pending', revision: 1, created_at: '2026-11-18T00:00:00Z' };
}

export async function serveHomepageRequests(page, { receipts = [], errors = [], abortFirst = false } = {}) {
  const items = [...receipts];
  const replies = [...errors];
  const writes = [];
  const notFound = (route) => route.fulfill({ status: 404, json: { code: 'not_found' } });
  await page.route('**/api/v1/catalog/**', notFound);
  await page.route('**/api/v1/catalog/objects?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('kind') !== 'school') return route.fallback();
    return route.fulfill({ json: { items: [school], next: '' } });
  });
  await page.route('**/api/v1/catalog/objects/lookup?**', (route) => {
    const ids = new URL(route.request().url()).searchParams.get('ids')?.split(',') ?? [];
    return route.fulfill({ json: {
      items: teachers.filter((teacher) => ids.includes(teacher.id)),
      missing_ids: ids.filter((id) => !teachers.some((teacher) => teacher.id === id)),
    } });
  });
  await page.route('**/api/v1/catalog/objects/*/teacher-homepage/requests*', (route) => {
    const request = route.request();
    const teacherId = new URL(request.url()).pathname.split('/').at(-3);
    if (request.method() === 'GET') {
      const selected = items.filter((item) => item.teacher_id === teacherId);
      return route.fulfill({ json: { items: selected, total: selected.length, next: '' } });
    }
    expect(request.method()).toBe('POST');
    const body = request.postDataJSON();
    writes.push({ teacherId, body, key: request.headers()['idempotency-key'] });
    if (abortFirst && writes.length === 1) return route.abort();
    const error = replies.shift();
    if (error) return route.fulfill({ status: error.status, json: { code: error.code } });
    const item = receipt(body, `request-${items.length + 1}`, teacherId);
    if (body.value?.photo) {
      item.value = { photo: { id: 'a'.repeat(64), content_type: body.value.photo.content_type, width: 1, height: 1 } };
    }
    items.push(item);
    return route.fulfill({ json: item });
  });
  await page.route('**/api/v1/catalog/me/teacher-homepage/requests/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const item = items.find((row) => row.id === id);
    return item ? route.fulfill({ json: item }) : notFound(route);
  });
  return writes;
}

export function requestEditor(page, messages) {
  const { request } = messages.teacherHomepage;
  const section = page.getByRole('region', { name: request.title, exact: true });
  const form = section.locator('form');
  return {
    start: section.getByRole('button', { name: request.start, exact: true }),
    form,
    field: form.getByRole('combobox'),
    itemName: form.getByRole('textbox', { name: request.label }),
    content: form.getByRole('textbox', { name: request.value }),
    message: form.getByRole('textbox', { name: request.message }),
    submit: form.getByRole('button', { name: messages.common.submit, exact: true }),
    sent: section.getByText(request.sent, { exact: true }),
    retry: section.getByRole('button', { name: messages.common.retryOriginal, exact: true }),
  };
}

export async function openForm(page, messages) {
  const editor = requestEditor(page, messages);
  await editor.start.click();
  return editor;
}

export async function pickField(page, controls, messages, field) {
  const label = messages.teacherHomepage.fields[field];
  await controls.field.click();
  await page.getByRole('textbox', { name: messages.common.searchOptions, exact: true }).fill(label);
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(controls.field).toHaveText(label);
}
