import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { recordDialogUntilClosed } from './dialog-helpers.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));

// Favorites server following the contract: revisions, idempotency keys and a default folder.
function favorites(page) {
  const state = {
    folders: [{ id: 'default', name: '', is_default: true, revision: 1 }, { id: 'exam', name: 'Exam', is_default: false, revision: 1 }],
    items: [
      { id: 'f1', kind: 'course', target_id: 'course', title: 'Test Course', folder_id: 'default', revision: 1, created_at: '2026-11-01T00:00:00Z' },
      { id: 'f2', kind: 'teacher', target_id: 'teacher', title: 'Test Teacher', folder_id: 'exam', revision: 1, created_at: '2026-11-02T00:00:00Z' },
    ],
    writes: [],
  };
  const view = (folder) => {
    const rows = state.items.filter((item) => item.folder_id === folder.id);
    const count = (kind) => rows.filter((item) => item.kind === kind).length;
    return { ...folder, item_count: rows.length, kind_counts: { course: count('course'), teacher: count('teacher'), resource: count('resource') } };
  };
  page.route('**/api/v1/favorites/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/favorites', '');
    if (request.method() === 'GET' && path === '/folders') return route.fulfill({ json: { items: state.folders.map(view), next: '' } });
    if (request.method() === 'GET' && path === '/items') {
      let rows = state.items;
      if (url.searchParams.get('kind')) rows = rows.filter((row) => row.kind === url.searchParams.get('kind'));
      if (url.searchParams.get('folder_id')) rows = rows.filter((row) => row.folder_id === url.searchParams.get('folder_id'));
      if (url.searchParams.get('target_ids')) rows = rows.filter((row) => url.searchParams.get('target_ids').split(',').includes(row.target_id));
      return route.fulfill({ json: { items: rows, next: '' } });
    }
    const body = request.postDataJSON();
    state.writes.push({ path, body, key: request.headers()['idempotency-key'] });
    const [, kind, id, action] = path.split('/');
    if (kind === 'folders' && action === 'rename') {
      const folder = state.folders.find((row) => row.id === id);
      Object.assign(folder, { name: body.name, revision: folder.revision + 1 });
      return route.fulfill({ json: view(folder) });
    }
    if (kind === 'folders' && action === 'delete') {
      state.folders = state.folders.filter((row) => row.id !== id);
      for (const item of state.items) if (item.folder_id === id) item.folder_id = 'default';
      return route.fulfill({ json: { id, removed: true } });
    }
    if (kind === 'items' && action === 'move') {
      const item = state.items.find((row) => row.id === id);
      Object.assign(item, { folder_id: body.folder_id, revision: item.revision + 1 });
      return route.fulfill({ json: item });
    }
    if (kind === 'items' && action === 'remove') {
      state.items = state.items.filter((row) => row.id !== id);
      return route.fulfill({ json: { id, removed: true } });
    }
    if (path === '/items') {
      const item = { id: `f${state.items.length + 3}`, ...body, folder_id: body.folder_id ?? 'default', title: 'Test Course', revision: 1, created_at: '2026-11-03T00:00:00Z' };
      state.items.push(item);
      return route.fulfill({ json: item });
    }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return state;
}

test('favorites list folders, rename a folder in place and move an item', async ({ page }, info) => {
  const all = catalogue(info), f = all.favorites, state = favorites(page);
  await page.goto(`${base}/me/favorites?lang=${info.project.metadata.locale}`);
  await expect(page.getByRole('link', { name: 'Test Course', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(f.defaultFolder) })).toBeVisible();
  await page.getByRole('button', { name: /Exam/ }).click();
  await expect(page.getByRole('link', { name: 'Test Course', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: f.manageFolderItem.replace('{p0}', 'Exam') }).click();
  await page.getByRole('menuitem', { name: f.rename }).click();
  const field = page.getByRole('textbox', { name: f.renameFolder.replace('{p0}', 'Exam') });
  await field.fill('Finals');
  await field.press('Enter');
  await expect(page.getByRole('button', { name: /Finals/ }).first()).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/folders/exam/rename', body: { name: 'Finals', revision: 1 } });
  await page.getByRole('button', { name: new RegExp(f.all) }).click();
  await page.getByRole('button', { name: f.manageItem.replace('{p0}', 'Test Course') }).click();
  await page.getByRole('menuitem', { name: 'Finals' }).click();
  await expect(page.getByText(f.movedTo.replace('{p0}', 'Finals'))).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/items/f1/move', body: { folder_id: 'exam', revision: 1 } });
});

test('removing a favorite can be undone into the original folder', async ({ page }, info) => {
  const all = catalogue(info), f = all.favorites, state = favorites(page);
  await page.goto(`${base}/me/favorites?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: f.manageItem.replace('{p0}', 'Test Teacher') }).click();
  await page.getByRole('menuitem', { name: f.remove }).click();
  await expect(page.getByRole('link', { name: 'Test Teacher', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: all.common.undo, exact: true }).click();
  await expect.poll(() => state.writes.at(-1)).toMatchObject({ path: '/items', body: { kind: 'teacher', target_id: 'teacher', folder_id: 'exam' } });
});

test('the course page shows the saved state and removes the favorite', async ({ page }, info) => {
  const all = catalogue(info), f = all.favorites;
  // Routes registered later take precedence, so the favorites server goes after the catalog fixture.
  await academicFixture(page);
  const state = favorites(page);
  await page.goto(`${base}/courses/course?lang=${info.project.metadata.locale}`);
  const button = page.getByRole('button', { name: f.saved, exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(page.getByRole('button', { name: f.add, exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(state.writes.at(-1)).toMatchObject({ path: '/items/f1/remove', body: { revision: 1 } });
});

test('saving a favorite offers quick move to folder, persists selected folder on back, and confirms folder deletion', async ({ page }, info) => {
  const all = catalogue(info), f = all.favorites;
  await academicFixture(page);
  const state = favorites(page);
  state.items = state.items.filter((row) => row.id !== 'f1');

  await page.goto(`${base}/courses/course?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: f.add, exact: true }).click();
  await page.getByRole('button', { name: f.moveTo, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Exam/ }).click();
  await expect(page.getByText(f.movedTo.replace('{p0}', 'Exam'))).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/items/f4/move', body: { folder_id: 'exam', revision: 1 } });

  await page.goto(`${base}/me/favorites?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: /Exam/ }).click();
  expect(new URL(page.url()).searchParams.has('folder')).toBe(false);
  await page.getByRole('link', { name: 'Test Course', exact: true }).first().click();
  await expect(page).toHaveURL(/\/courses\/course/);
  await page.goBack();
  await expect(page.getByRole('button', { name: /Exam/ }).first()).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: f.manageFolderItem.replace('{p0}', 'Exam') }).click();
  await page.getByRole('menuitem', { name: f.deleteFolder }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const confirmText = await page.getByRole('dialog').innerText();
  const closing = recordDialogUntilClosed(page);
  await page.getByRole('dialog').getByRole('button', { name: all.common.cancel, exact: true }).click();
  // The shared dialog keeps its last content during the closing animation, so the message does not go blank.
  const closingTexts = await closing;
  expect(closingTexts.length).toBeGreaterThan(0);
  for (const text of closingTexts) expect(text).toBe(confirmText);
  expect(state.writes.some((w) => w.path === '/folders/exam/delete')).toBe(false);

  await page.getByRole('button', { name: f.manageFolderItem.replace('{p0}', 'Exam') }).click();
  await page.getByRole('menuitem', { name: f.deleteFolder }).click();
  await page.getByRole('dialog').getByRole('button', { name: f.deleteFolder, exact: true }).click();
  await expect.poll(() => state.writes.at(-1)).toMatchObject({ path: '/folders/exam/delete', body: { revision: 1 } });
});

test('the quick view can move a favorite and recovers the saved revision after a lost move response', async ({ page }, info) => {
  const all = catalogue(info), f = all.favorites, b = all.browse;
  await academicFixture(page);
  const state = favorites(page);
  state.items = state.items.filter(row => row.id !== 'f1');
  await page.goto(`${base}/courses?lang=${info.project.metadata.locale}`);
  await expect(page.locator('main li.line')).toHaveCount(1);
  const quick = page.getByRole('button', { name: b.quickViewItem.replace('{p0}', 'Test Course') });
  if (await quick.isVisible()) await quick.click();
  else {
    await page.getByRole('button', { name: b.moreActionsFor.replace('{p0}', 'Test Course') }).click();
    await page.getByRole('menuitem', { name: b.quickView }).click();
  }
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: f.add, exact: true }).click();
  await drawer.getByRole('button', { name: f.moveTo, exact: true }).click();
  const picker = page.getByRole('dialog', { name: f.moveTo, exact: true });
  let moves = 0;
  await page.route('**/api/v1/favorites/items/f4/move', route => {
    moves++;
    const item = state.items.find(row => row.id === 'f4');
    const body = route.request().postDataJSON();
    expect(body.revision).toBe(item.revision);
    Object.assign(item, { folder_id: body.folder_id, revision: item.revision + 1 });
    return moves === 1 ? route.abort('failed') : route.fulfill({ json: item });
  });
  await picker.getByRole('button', { name: /Exam/ }).click();
  await expect(picker.getByRole('button', { name: /Exam/ })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: new RegExp(f.defaultFolder) }).click();
  await expect(picker).toHaveCount(0);
  expect(moves).toBe(2);
});

test('a rejected folder name keeps the input but lets focus move without another write', async ({ page }, info) => {
  const f = catalogue(info).favorites;
  const state = favorites(page);
  const attempts = [];
  await page.route('**/api/v1/favorites/folders', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { code: 'conflict' } });
  });
  await page.goto(`${base}/me/favorites?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: f.newFolder, exact: true }).click();
  const name = page.getByRole('textbox', { name: f.newFolderName, exact: true });
  const search = page.getByRole('searchbox', { name: f.search, exact: true });
  await name.fill('Already used');
  await search.click();
  await expect(page.getByRole('alert')).toHaveText(f.folderNameTaken);
  await expect(search).toBeFocused();
  await name.focus();
  await search.focus();
  await expect(name).toHaveValue('Already used');
  expect(attempts).toEqual([{ name: 'Already used' }]);
  expect(state.folders.map(folder => folder.id)).toEqual(['default', 'exam']);
});
