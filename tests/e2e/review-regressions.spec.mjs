import { fixture as academicFixture } from './academic-fixture.mjs';
import fs from 'node:fs';
import { test, expect } from '../session-fixture.mjs';
import { fixture, routes } from './resource-fixture.mjs';

test('unsaved resource input survives cancelled navigation and warns before unload',async({page},info)=>{
 const locale=info.project.metadata.locale,m=JSON.parse(fs.readFileSync(`src/locales/${locale}.json`,'utf8')).resources;
 await routes(page,fixture());await page.goto(`http://127.0.0.1:18787/resources/new?school_id=school&course_id=course&lang=${locale}`);
 await page.getByLabel(m.resourceTitle,{exact:true}).fill('Unsaved title');
 await expect(page.getByLabel(m.description,{exact:true})).toHaveAttribute('maxlength','8000');
 const dialog=page.waitForEvent('dialog');const click=page.getByRole('link',{name:m.mine,exact:true}).click();await (await dialog).dismiss();await click;
 await expect(page.getByLabel(m.resourceTitle,{exact:true})).toHaveValue('Unsaved title');
 expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
});

test('course change discards the previous directory cursor',async({page},info)=>{
 const locale=info.project.metadata.locale,m=JSON.parse(fs.readFileSync(`src/locales/${locale}.json`,'utf8')).resources;const s=fixture(),seen=[];
 await routes(page,s);
 await page.route('**/api/v1/resources/directories?*',route=>{const u=new URL(route.request().url());seen.push(Object.fromEntries(u.searchParams));return route.fulfill({json:{items:[],next_cursor:u.searchParams.get('after')?'':'old-page'}})});
 await page.goto(`http://127.0.0.1:18787/resources?school_id=school&course_id=course&lang=${locale}`);
 await page.getByRole('button',{name:m.more,exact:true}).first().click();
 await expect.poll(()=>seen.at(-1)?.after).toBe('old-page');
 await page.getByRole('combobox').nth(2).selectOption('');await page.getByRole('button',{name:m.filter,exact:true}).click();
 await page.getByRole('combobox').nth(2).selectOption('course');await page.getByRole('button',{name:m.filter,exact:true}).click();
 await expect.poll(()=>seen.at(-1)?.after??'').toBe('');
});

test('an unresolved bookmark blocks changing the displayed object until the original request is confirmed',async({page},info)=>{
 const locale=info.project.metadata.locale,m=JSON.parse(fs.readFileSync(`src/locales/${locale}.json`,'utf8')),posts=[];
 await academicFixture(page);
 await page.route('**/api/v1/reviews/me/bookmarks',route=>{posts.push(route.request().postDataJSON());return posts.length===1?route.abort():route.fulfill({json:{id:'bookmark',state:'saved',revision:1}})});
 await page.goto(`http://127.0.0.1:18787/courses/course?lang=${locale}`);
 await page.getByRole('button',{name:m.academic.bookmark,exact:true}).click();await expect(page.getByRole('button',{name:m.academic.retry,exact:true})).toBeVisible();
 await page.getByRole('link',{name:m.resources.title,exact:true}).last().click();await expect(page).toHaveURL(/\/courses\/course/);
 await page.getByRole('button',{name:m.academic.retry,exact:true}).click();await expect(page.getByText(m.academic.bookmarked,{exact:true})).toBeVisible();expect(posts).toEqual([{target_id:'course',set:true},{target_id:'course',set:true}]);
});
