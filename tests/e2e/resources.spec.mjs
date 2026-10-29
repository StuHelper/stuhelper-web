import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { expect, test } from '../session-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';
async function setup(
  page,
  info,
  path = '/resources?school_id=school&course_id=course',
) {
  const locale = info.project.metadata.locale,
    m = JSON.parse(
      fs.readFileSync(`src/locales/${locale}.json`, 'utf8'),
    ).resources,
    s = fixture(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (/\[intlify\].*(Not found|Fall back)/i.test(e.text()))
      errors.push(e.text());
  });
  await routes(page, s);
  await page.goto(
    `http://127.0.0.1:18787${path}${path.includes('?') ? '&' : '?'}lang=${locale}`,
  );
  return { m, s, errors, locale };
}
async function layout(page, errors, locale) {
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar-EG' ? 'rtl' : 'ltr',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
if(process.env.RESOURCE_SCREENSHOTS && ((locale==='zh-CN'&&page.viewportSize().width>800)||(locale==='ar-EG'&&page.viewportSize().width<800))&&test.info().title.startsWith('configured')){fs.mkdirSync(process.env.RESOURCE_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RESOURCE_SCREENSHOTS,'web-'+locale+'.png'),fullPage:true})} 
}
test('configured category field filters and grouping follow server configuration', async ({
  page,
}, info) => {
  const { m, s, errors, locale } = await setup(page, info);
  await expect(
    page.getByRole('link', { name: 'Fixture notes', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: m.category, exact: true })
    .selectOption('custom-category');
  const label = locale === 'en-US' ? 'Custom year' : '自定义年份';
  await page.getByLabel(label, { exact: true }).fill('2025');
  await page.getByRole('button', { name: m.filter, exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: new Intl.NumberFormat(locale, { useGrouping: false }).format(2025),
      exact: true,
    }),
  ).toBeVisible();
  expect(
    s.calls.some((x) => x.query?.attributes === '{"edition":{"number":2025}}'),
  ).toBe(true);
  await layout(page, errors, locale);
});
test('upload uses current terms and retries the original metadata request', async ({
  page,
}, info) => {
  const { m, s, errors, locale } = await setup(
    page,
    info,
    '/resources/new?school_id=school&course_id=course',
  );
  await page
    .getByLabel(m.resourceTitle, { exact: true })
    .fill('Uploaded lecture');
  await page
    .getByRole('combobox', { name: m.origin, exact: true })
    .selectOption('original');
  await page.getByLabel(m.acceptTerms, { exact: true }).check();
  s.lose = true;
  await page.getByRole('button', { name: m.save, exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel(m.resourceTitle, { exact: true })).toHaveValue(
    'Uploaded lecture',
  );
  await page
    .locator('button[type=submit]')
    .filter({ hasText: m.retry })
    .click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  const posts = s.calls.filter((x) => x.path === '' && x.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0].key).toBe(posts[1].key);
  expect(posts[0].body).toEqual(posts[1].body);
  expect(posts[0].body.metadata.origin.consent).toEqual({
    accepted: true,
    version: 'v1',
    digest: 'a'.repeat(64),
  });
  await page
    .getByLabel(m.chooseFile, { exact: true })
    .setInputFiles({
      name: 'lecture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
  await page.getByRole('button', { name: m.uploadFile, exact: true }).click();
  await expect(
    page.getByText(m.uploadStates.attached, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: m.submit, exact: true }).click();
  await expect(page.getByText(m.states.pending, { exact: true })).toBeVisible();
  expect(
    s.calls.find((x) => x.path === '/api/v1/media/uploads')?.body.purpose,
  ).toBe('custom-profile');
  await layout(page, errors, locale);
});
test('current denial clears resource data and request receipts survive navigation', async ({
  page,
}, info) => {
  const { m, s, errors, locale } = await setup(
    page,
    info,
    '/resources/items/resource',
  );
  await expect(
    page.getByRole('heading', { name: 'Fixture notes', exact: true }),
  ).toBeVisible();
  s.reject = true;
  await page.getByRole('button', { name: m.download, exact: true }).click();
  await expect(
    page.getByText(m.errors.permission_denied, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fixture notes', exact: true }),
  ).toHaveCount(0);
  s.reject = false;
  await page.goto(`http://127.0.0.1:18787/resources/requests?lang=${locale}`);
  await page.getByRole('button', { name: m.checkStatus, exact: true }).click();
  await expect(
    page.getByText('Processed decision', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: m.appeal, exact: true }).click();
  await page
    .getByLabel(m.reason, { exact: true })
    .fill('Additional authorization evidence');
  await page.getByRole('button', { name: m.sendRequest, exact: true }).click();
  await expect
    .poll(
      () =>
        s.calls.filter(
          (x) => x.path.endsWith('/requests') && x.method === 'POST',
        ).length,
    )
    .toBe(1);
  expect(
    s.calls.find((x) => x.path.endsWith('/requests') && x.method === 'POST')
      .body.previous_task_id,
  ).toBe('previous-task');
  await layout(page, errors, locale);
});
test('folder packages list every part and allow individual retry', async ({
  page,
}, info) => {
  const { m, s, errors, locale } = await setup(page, info);
  await page
    .getByRole('button', {
      name: locale === 'en-US' ? 'Resource folder' : '资料目录',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: m.downloadDirectory, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: m.packages, exact: true }),
  ).toBeVisible();
  const one = m.part.replace(
    '{number}',
    new Intl.NumberFormat(locale).format(1),
  );
  const two = m.part.replace(
    '{number}',
    new Intl.NumberFormat(locale).format(2),
  );
  await expect(
    page.getByRole('button', { name: two, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: one, exact: true }).click();
  await expect
    .poll(
      () =>
        s.calls.filter((x) => x.path === '/packages/package/parts/1').length,
    )
    .toBe(1);
  await page.getByRole('button', { name: one, exact: true }).click();
  await expect
    .poll(
      () =>
        s.calls.filter((x) => x.path === '/packages/package/parts/1').length,
    )
    .toBe(2);
  expect(s.calls.find((x) => x.path === '/packages').body).toEqual({
    directory_id: 'folder',
  });
  await layout(page, errors, locale);
});

test('owned file reuse avoids content transfer and keeps separate review',async({page},info)=>{
 const {m,s,errors,locale}=await setup(page,info,'/resources/new?school_id=school&course_id=course');
 await page.getByLabel(m.resourceTitle,{exact:true}).fill('Reused lecture');await page.getByRole('combobox',{name:m.origin,exact:true}).selectOption('original');await page.getByLabel(m.acceptTerms,{exact:true}).check();await page.getByRole('button',{name:m.save,exact:true}).click();await expect(page.getByText(m.saved,{exact:true})).toBeVisible();
 s.media.reused=true;s.media.state='verifying';await page.getByLabel(m.chooseFile,{exact:true}).setInputFiles({name:'lecture.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});await page.getByRole('button',{name:m.uploadFile,exact:true}).click();await expect(page.getByText(m.errors.reuse_pending,{exact:true})).toBeVisible();
 expect(s.calls.filter(x=>x.path?.startsWith('/api/v1/media')&&x.method==='PUT')).toHaveLength(0);s.media.state='awaiting_approval';await page.getByRole('button',{name:m.uploadFile,exact:true}).click();await expect(page.getByText(m.reusedFile,{exact:true})).toBeVisible();await expect(page.getByText(m.uploadStates.attached,{exact:true})).toBeVisible();expect(s.calls.filter(x=>x.path==='/api/v1/media/uploads')).toHaveLength(1);expect(s.calls.find(x=>x.path==='/api/v1/media/uploads').body.reuse_existing).toBe(true);expect(s.calls.filter(x=>x.path?.startsWith('/api/v1/media')&&x.method==='PUT')).toHaveLength(0);await page.getByRole('button',{name:m.submit,exact:true}).click();await expect(page.getByText(m.states.pending,{exact:true})).toBeVisible();await layout(page,errors,locale);
});
