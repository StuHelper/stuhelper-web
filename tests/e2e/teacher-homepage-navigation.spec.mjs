import { expect, memberTest as test } from '../session-fixture.mjs';
import { catalogue, localizedPath, localizedUrl, managePath, pickField, png, requestEditor, serveHomepageRequests, teachers } from './teacher-homepage-fixture.mjs';

const push = (page, path) => page.evaluate((to) => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(to), path);

async function choosePhoto(page, messages, action, name) {
  await action.start.click();
  await pickField(page, action, messages, 'photo');
  await action.form.locator('input[type="file"]').setInputFiles({ name, mimeType: 'image/png', buffer: png });
  await action.message.fill('Please replace my homepage photo.');
}

function teacherHeading(page, messages, teacher) {
  const name = messages.teacherHomepage.manageTitle.replace('{name}', teacher.name);
  return page.getByRole('heading', { level: 1, name, exact: true });
}

test('switching teacher records clears drafts and unknown submissions from the previous teacher', async ({ page }, info) => {
  const messages = catalogue(info);
  const [first, second] = teachers;
  const writes = await serveHomepageRequests(page, { abortFirst: true });
  const action = requestEditor(page, messages);
  await page.goto(localizedUrl(managePath(first), info));
  await expect(teacherHeading(page, messages, first)).toBeVisible();
  await action.start.click();
  await action.content.fill('First teacher’s draft');
  await action.message.fill('An explanation from the first teacher');

  await push(page, localizedPath(managePath(second), info));
  await expect(teacherHeading(page, messages, second)).toBeVisible();
  await expect(action.form).toHaveCount(0);
  await page.goBack();
  await expect(teacherHeading(page, messages, first)).toBeVisible();
  await action.start.click();
  await expect(action.content).toHaveValue('');
  await expect(action.message).toHaveValue('');
  await action.content.fill('First teacher’s proposed biography');
  await action.message.fill('Please amend the first profile.');
  await action.submit.click();
  await expect(action.retry).toBeVisible();

  await page.goForward();
  await expect(teacherHeading(page, messages, second)).toBeVisible();
  await expect(action.retry).toHaveCount(0);
  await action.start.click();
  await action.content.fill('Second teacher’s proposed biography');
  await action.message.fill('Please amend the second profile.');
  await action.submit.click();
  await expect(action.sent).toBeVisible();
  expect(writes).toEqual([
    { teacherId: first.id, key: expect.any(String), body: { kind: 'correction', field: { field: 'biography' }, value: { text: 'First teacher’s proposed biography' }, message: 'Please amend the first profile.' } },
    { teacherId: second.id, key: expect.any(String), body: { kind: 'correction', field: { field: 'biography' }, value: { text: 'Second teacher’s proposed biography' }, message: 'Please amend the second profile.' } },
  ]);
});

test('photo preparation locks the form and drops the unsent request when switching teachers', async ({ page }, info) => {
  await page.addInitScript(() => {
    const readFile = File.prototype.arrayBuffer;
    const fetchRequest = window.fetch;
    const released = new Promise((resolve) => window.addEventListener('release-test-photo', resolve, { once: true }));
    File.prototype.arrayBuffer = async function () {
      if (this.name !== 'deferred.png') return readFile.call(this);
      document.documentElement.dataset.testPhotoRead = 'waiting';
      await released;
      const bytes = await readFile.call(this);
      // The timer runs after the promise continuations and any resulting fetch call.
      setTimeout(() => { document.documentElement.dataset.testPhotoRead = 'complete'; }, 0);
      return bytes;
    };
    window.fetch = (input, init) => {
      if (init?.method === 'POST' && String(input).includes('/teacher-homepage/requests')) {
        document.documentElement.dataset.testPhotoPost = 'sent';
      }
      return fetchRequest(input, init);
    };
  });

  const messages = catalogue(info);
  const [first, second] = teachers;
  const writes = await serveHomepageRequests(page);
  const action = requestEditor(page, messages);
  await page.goto(localizedUrl(managePath(first), info));
  await choosePhoto(page, messages, action, 'deferred.png');
  await action.submit.click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-test-photo-read', 'waiting');
  await expect(action.message).toBeDisabled();
  await expect(action.submit).toBeDisabled();
  await push(page, localizedPath(managePath(second), info));
  await expect(teacherHeading(page, messages, second)).toBeVisible();
  await expect(action.form).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('release-test-photo')));
  await expect(html).toHaveAttribute('data-test-photo-read', 'complete');
  await expect(html).not.toHaveAttribute('data-test-photo-post', 'sent');
  expect(writes).toEqual([]);
});

test('a local photo read failure leaves the form ready to retry without sending a partial request', async ({ page }, info) => {
  await page.addInitScript(() => {
    const readFile = File.prototype.arrayBuffer;
    let failed = false;
    File.prototype.arrayBuffer = function () {
      if (this.name !== 'retry.png' || failed) return readFile.call(this);
      failed = true;
      return Promise.reject(new DOMException('Test file read failed', 'NotReadableError'));
    };
  });

  const messages = catalogue(info);
  const writes = await serveHomepageRequests(page);
  const action = requestEditor(page, messages);
  await page.goto(localizedUrl(managePath(teachers[0]), info));
  await choosePhoto(page, messages, action, 'retry.png');
  await action.submit.click();
  await expect(action.form.getByRole('alert')).toBeVisible();
  await expect(action.submit).toBeEnabled();
  await expect(action.message).toHaveValue('Please replace my homepage photo.');
  expect(writes).toEqual([]);
  await action.submit.click();
  await expect(action.sent).toBeVisible();
  expect(writes).toEqual([{
    teacherId: teachers[0].id,
    key: expect.any(String),
    body: {
      kind: 'correction', field: { field: 'photo' }, message: 'Please replace my homepage photo.',
      value: { photo: { content_type: 'image/png', data: png.toString('base64') } },
    },
  }]);
});
