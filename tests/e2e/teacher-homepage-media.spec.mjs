import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { expect, memberTest as test } from '../session-fixture.mjs';
import { fixture as academicFixture } from './academic-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const profilePath = '/api/v1/catalog/objects/teacher-a/teacher-homepage';
const mediaPath = `${profilePath}/media`;
const sourceSite = 'https://faculty.example.invalid';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const existingSection = { title: 'Recent work', text: 'The school lists three recent publications.' };
const profile = {
  name: 'Prof. Lin',
  biography: 'Professor Lin teaches computer science.',
  research: 'Research on natural language processing.',
  supervisors: [],
  fields: [],
  sections: [existingSection],
};

function copiedImage(digest, fields) {
  return {
    kind: 'image',
    field: 'biography',
    url: `${profilePath}/images/${digest.repeat(64)}`,
    image: { content_type: 'image/png', width: 1, height: 1, size_bytes: png.length },
    ...fields,
  };
}

async function fixture(page, { view = { profile }, items = [] } = {}) {
  await academicFixture(page);
  await page.route('**/api/v1/verification/teacher-credentials?**', route => route.fulfill({ json: [] }));
  await page.route(`**${profilePath}`, route => route.fulfill({ json: view }));
  await page.route(`**${mediaPath}`, route => route.fulfill({ json: { items } }));
}

async function openTeacher(page, info) {
  const locale = info.project.metadata.locale;
  const messages = JSON.parse(readFileSync(`src/locales/${locale}.json`, 'utf8'));
  const h = messages.teacherHomepage;
  await page.goto(`${base}/teachers/teacher-a?lang=${locale}`);
  const homepage = page.getByRole('region', { name: h.title, exact: true });
  return { h, homepage, messages };
}

const figure = (scope, title) => scope.locator('figure').filter({ hasText: title });
const unavailable = (route) => route.fulfill({ status: 503, json: { code: 'unavailable' } });
const gone = (route, status) => route.fulfill({ status, json: { code: status === 403 ? 'forbidden' : 'not_found' } });
const showPng = (route) => route.fulfill({ contentType: 'image/png', body: png });

test('a copied homepage image is read only when it enters the viewport and displays as a Blob', async ({ page }, info) => {
  const picture = copiedImage('a', { field: 'research', title: 'Laboratory photo' });
  const longBiography = 'Biographical notes from the school homepage.\n'.repeat(96).trimEnd();
  const reads = [];
  await fixture(page, { view: { profile: { ...profile, biography: longBiography } }, items: [picture] });
  await page.route(`**${picture.url}`, route => {
    reads.push({ method: route.request().method(), pathname: new URL(route.request().url()).pathname });
    return showPng(route);
  });

  const { homepage } = await openTeacher(page, info);
  const frame = figure(homepage, picture.title);
  await expect(frame).toBeVisible();
  await expect(frame).not.toBeInViewport();
  expect(reads).toEqual([]);
  await expect(frame.getByRole('img')).toHaveCount(0);

  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toBeInViewport();
  const image = frame.getByRole('img', { name: picture.title, exact: true });
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  await expect(image).toHaveJSProperty('naturalHeight', 1);
  expect(reads).toEqual([{ method: 'GET', pathname: picture.url }]);
});

async function verifyImageFailure(page, info, reply) {
  const picture = copiedImage('a', { title: 'Laboratory photo' });
  let listReads = 0;
  let profileReads = 0;
  await fixture(page);
  await page.route(`**${profilePath}`, route => {
    profileReads++;
    return route.fulfill({ json: { profile } });
  });
  await page.route(`**${mediaPath}`, route => {
    listReads++;
    return route.fulfill({ json: { items: [picture] } });
  });
  await page.route(`**${picture.url}`, reply);

  const { h, homepage } = await openTeacher(page, info);
  const frame = figure(homepage, picture.title);
  await frame.scrollIntoViewIfNeeded();
  await expect(frame.getByText(h.media.imageFailed, { exact: true })).toBeVisible();
  await expect(frame.getByRole('img')).toHaveCount(0);
  await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
  expect(listReads).toBe(1);
  expect(profileReads).toBe(1);
}

test('an unavailable image response leaves a localized placeholder without refreshing the homepage', ({ page }, info) =>
  verifyImageFailure(page, info, unavailable));

test('an undecodable image response leaves a localized placeholder without refreshing the homepage', ({ page }, info) =>
  verifyImageFailure(page, info, route => route.fulfill({ contentType: 'image/png', body: 'Invalid PNG fixture' })));

async function verifyImageRefresh(page, info, status) {
  const stale = copiedImage('a', { title: 'Previous photograph' });
  const current = copiedImage('b', { title: 'Current photograph' });
  const missing = copiedImage('c', { field: 'sections', section: existingSection.title, title: 'Unavailable photograph' });
  const reads = [];
  const staleResponse = Promise.withResolvers();
  const revisedBiography = status === 403 ? 'The school has updated the public biography.' : undefined;
  let listReads = 0;
  let profileReads = 0;
  await fixture(page);
  await page.route(`**${profilePath}`, route => {
    profileReads++;
    return route.fulfill({ json: { profile: profileReads === 1 ? profile : { ...profile, biography: revisedBiography } } });
  });
  await page.route(`**${mediaPath}`, route => {
    listReads++;
    return route.fulfill({ json: { items: listReads === 1 ? [stale] : [current, missing] } });
  });
  await page.route(`**${profilePath}/images/*`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    reads.push(pathname);
    if (pathname === stale.url) {
      await staleResponse.promise;
      return gone(route, status);
    }
    return pathname === current.url ? showPng(route) : gone(route, status);
  });

  const { h, homepage } = await openTeacher(page, info);
  try {
    await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
    await figure(homepage, stale.title).scrollIntoViewIfNeeded();
    await expect.poll(() => reads).toEqual([stale.url]);
  } finally {
    staleResponse.resolve();
  }

  const replacement = figure(homepage, current.title);
  await replacement.scrollIntoViewIfNeeded();
  const image = replacement.getByRole('img', { name: current.title, exact: true });
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  await expect(figure(homepage, stale.title)).toHaveCount(0);
  await expect(homepage.getByText(profile.biography, { exact: true })).toHaveCount(0);
  if (revisedBiography) await expect(homepage.getByText(revisedBiography, { exact: true })).toBeVisible();
  expect(listReads).toBe(2);
  expect(profileReads).toBe(2);
  expect(reads).toEqual([stale.url, current.url]);

  await homepage.getByText(existingSection.title, { exact: true }).click();
  const missingFrame = figure(homepage, missing.title);
  await missingFrame.scrollIntoViewIfNeeded();
  await expect(missingFrame.getByText(h.media.imageFailed, { exact: true })).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  expect(reads).toEqual([stale.url, current.url, missing.url]);
  expect(listReads).toBe(2);
  expect(profileReads).toBe(2);
}

test('an image HTTP 403 refreshes the homepage once and uses the replacement address', ({ page }, info) =>
  verifyImageRefresh(page, info, 403));

test('an image HTTP 404 refreshes the homepage once and uses the replacement address', ({ page }, info) =>
  verifyImageRefresh(page, info, 404));

test('source links stay in their biography, research and section groups and open privately', async ({ page }, info) => {
  const links = {
    image: `${sourceSite}/teachers/lin`,
    video: `${sourceSite}/talk.mp4`,
    attachment: `${sourceSite}/publications.pdf`,
  };
  const secondSection = { title: existingSection.title, text: 'Earlier publications are listed separately.' };
  const outsideRequests = [];
  await fixture(page, {
    view: { profile: { ...profile, sections: [existingSection, secondSection] } },
    items: [
      { kind: 'image', field: 'biography', url: links.image },
      { kind: 'video', field: 'research', url: links.video },
      { kind: 'attachment', field: 'sections', section: existingSection.title, url: links.attachment },
    ],
  });
  await page.route(`${sourceSite}/**`, route => {
    outsideRequests.push(route.request().url());
    return route.abort();
  });
  const { h, homepage } = await openTeacher(page, info);

  const biography = homepage.getByRole('heading', { name: h.fields.biography, exact: true }).locator('..');
  const research = homepage.getByRole('heading', { name: h.fields.research, exact: true }).locator('..');
  const sectionTitles = homepage.getByText(existingSection.title, { exact: true });
  await expect(sectionTitles).toHaveCount(2);
  const section = sectionTitles.first().locator('..');
  const duplicateSection = sectionTitles.last().locator('..');
  await expect(section.getByText(existingSection.text, { exact: true })).toBeHidden();
  await expect(duplicateSection.getByText(secondSection.text, { exact: true })).toBeHidden();
  await sectionTitles.first().click();
  await sectionTitles.last().click();
  await expect(section.getByText(existingSection.text, { exact: true })).toBeVisible();
  await expect(duplicateSection.getByText(secondSection.text, { exact: true })).toBeVisible();
  await expect(duplicateSection.getByRole('link')).toHaveCount(0);

  for (const [kind, scope] of [['image', biography], ['video', research], ['attachment', section]]) {
    const link = scope.getByRole('link', { name: h.media[`${kind}Link`] });
    await expect(scope.getByRole('link')).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleName(new RegExp(RegExp.escape(h.media.external)));
    await expect(link).toHaveAttribute('href', links[kind]);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
    await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  }
  await expect(homepage.getByRole('link', { name: h.media.attachmentLink })).toHaveCount(1);
  await expect(homepage.locator('img, video, iframe, embed, object')).toHaveCount(0);
  expect(outsideRequests).toEqual([]);
});

test('a teacher page displays named and untitled media-only sections without a profile response', async ({ page }, info) => {
  const title = 'Multimedia archive';
  const video = { kind: 'video', field: 'sections', section: title, title: 'Lecture recording', url: `${sourceSite}/lecture.mp4` };
  const attachment = { kind: 'attachment', field: 'sections', url: `${sourceSite}/programme.pdf` };
  await fixture(page, { view: {}, items: [video, attachment] });
  const { h, homepage } = await openTeacher(page, info);

  const namedSection = homepage.getByText(title, { exact: true }).locator('..');
  await namedSection.getByText(title, { exact: true }).click();
  await expect(namedSection.getByRole('link', { name: video.title })).toHaveAttribute('href', video.url);
  const untitledSection = homepage.getByText(h.media.untitled, { exact: true }).locator('..');
  await untitledSection.getByText(h.media.untitled, { exact: true }).click();
  await expect(untitledSection.getByRole('link', { name: h.media.attachmentLink })).toHaveAttribute('href', attachment.url);
  await expect(homepage.getByText(h.empty, { exact: true })).toHaveCount(0);
});

test('a failed homepage media list leaves the teacher profile and reviews usable', async ({ page }, info) => {
  const source = { kind: 'video', field: 'research', url: `${sourceSite}/talk.mp4` };
  const retryResponse = Promise.withResolvers();
  let listReads = 0;
  let profileReads = 0;
  await fixture(page);
  await page.route(`**${profilePath}`, route => {
    profileReads++;
    return route.fulfill({ json: { profile } });
  });
  await page.route(`**${mediaPath}`, async route => {
    listReads++;
    if (listReads === 1) return unavailable(route);
    await retryResponse.promise;
    return route.fulfill({ json: { items: [source] } });
  });
  const { h, homepage, messages } = await openTeacher(page, info);
  const failure = homepage.getByText(h.media.loadFailed, { exact: true });

  await expect(failure).toBeVisible();
  await expect(homepage.getByRole('heading', { name: h.fields.biography, exact: true })).toBeVisible();
  await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
  await expect(homepage.getByText(profile.research, { exact: true })).toBeVisible();
  await homepage.getByText(existingSection.title, { exact: true }).click();
  await expect(homepage.getByText(existingSection.text, { exact: true })).toBeVisible();
  const reviews = page.getByRole('tab', { name: messages.academic.subject.mentorReviews, exact: true });
  await reviews.click();
  await expect(reviews).toHaveAttribute('aria-selected', 'true');
  expect(listReads).toBe(1);

  try {
    await homepage.getByRole('button', { name: messages.common.retry, exact: true }).click();
    await expect.poll(() => listReads).toBe(2);
    await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
    await expect(homepage.getByText(existingSection.text, { exact: true })).toBeVisible();
  } finally {
    retryResponse.resolve();
  }
  await expect(homepage.getByRole('link', { name: h.media.videoLink })).toHaveAttribute('href', source.url);
  await expect(failure).toHaveCount(0);
  await expect(homepage.getByText(profile.biography, { exact: true })).toBeVisible();
  await expect(homepage.getByText(existingSection.text, { exact: true })).toBeVisible();
  expect(listReads).toBe(2);
  expect(profileReads).toBe(1);
});
