import fs from 'node:fs';
import { test, expect } from 'playwright/test';

// "My courses" is switched off in every normal build (src/app/features.ts); the production
// assertion lives in tests/e2e/access.spec.mjs. The review prototype opens the page with
// VITE_DEMO_MY_COURSES=1 (see playwright.demo.config.mjs), so its behaviour is covered here
// against the prototype's mock backend: the current term has structured times and a
// timetable, the earlier term only has the school's original text.
const catalogue = (locale) => JSON.parse(fs.readFileSync(`src/locales/${locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (locale, value) => new Intl.NumberFormat(locale).format(value);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// Monday of teaching week 11 in Shanghai (week one starts on 2026-09-07).
const monday = new Date('2026-11-16T02:30:00Z');

for (const locale of ['zh-CN', 'en-US', 'ar-EG']) {
  test(`the week grid opens on the current teaching week, marks today and moves between weeks (${locale})`, async ({ page }) => {
    const c = catalogue(locale).courses;
    await page.clock.setFixedTime(monday);
    await page.goto(`/me/courses?lang=${locale}`);
    await expect(page.getByText(fill(c.weekNumber, { week: number(locale, 11) }), { exact: true })).toBeVisible();
    // Monday carries the marker; the lesson of that day links to its course and shows its time.
    await expect(page.locator('.week [aria-current="date"]')).toHaveCount(1);
    const lesson = page.locator('a[href="/courses/c3"][aria-label*="A201"]');
    await expect(lesson).toBeVisible();
    await expect(lesson).toContainText('08:00–09:35');
    // The timetable is a personal page: the campus sub-navigation under the bar belongs to campus pages only.
    await expect(page.locator('header .subnav')).toHaveCount(0);
    // The grid is part of the page, below the week picker, not in a floating layer.
    const layout = await page.evaluate((nextWeek) => {
      const link = document.querySelector('a[href="/courses/c3"][aria-label*="A201"]');
      let fixed = false;
      for (let node = link; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).position === 'fixed') fixed = true;
      const top = (element) => element.getBoundingClientRect().top + scrollY;
      const picker = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === nextWeek);
      return { fixed, afterPicker: top(link) > top(picker) };
    }, c.nextWeek);
    expect(layout).toEqual({ fixed: false, afterPicker: true });

    // Week 13 has no lab lesson (weeks 3-14 only run to 14) for machine learning, which ends in week 12.
    await page.getByRole('button', { name: c.nextWeek, exact: true }).click();
    await page.getByRole('button', { name: c.nextWeek, exact: true }).click();
    await expect(page.getByText(fill(c.weekNumber, { week: number(locale, 13) }), { exact: true })).toBeVisible();
    await expect(page.locator('a[href="/courses/c10"]')).toHaveCount(0);
    // Away from the current week nothing is marked as today, and one button returns to it.
    await expect(page.locator('.week [aria-current="date"]')).toHaveCount(0);
    await page.getByRole('button', { name: c.thisWeek, exact: true }).click();
    await expect(page.getByText(fill(c.weekNumber, { week: number(locale, 11) }), { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: c.thisWeek, exact: true })).toHaveCount(0);
    // The last teaching week is the end of the picker.
    for (let week = 11; week < 16; week++) await page.getByRole('button', { name: c.nextWeek, exact: true }).click();
    await expect(page.getByRole('button', { name: c.nextWeek, exact: true })).toBeDisabled();
  });
}

test('a phone shows the five weekdays without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(monday);
  for (const locale of ['zh-CN', 'ar-EG']) {
    await page.goto(`/me/courses?lang=${locale}`);
    await expect(page.locator('a[href="/courses/c5"]').first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const card = await page.locator('.week-card').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(card).toBeLessThanOrEqual(0);
  }
});

test('a term with only original time text opens as a list and cannot be exported', async ({ page }) => {
  const all = catalogue('zh-CN');
  await page.clock.setFixedTime(monday);
  await page.goto('/me/courses?lang=zh-CN');
  await page.getByRole('tab', { name: '2026 春季学期', exact: true }).click();
  // No lesson can be placed, so the page explains it and lists the courses with the school's text.
  await expect(page.getByText(all.courses.textOnly, { exact: true })).toBeVisible();
  await expect(page.locator('.week')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: all.courses.weekView, exact: true })).toHaveCount(0);
  await expect(page.locator('main a[href="/courses/c1"]')).toBeVisible();
  await expect(page.getByText('周三 下午').first()).toBeVisible();
  // The server refuses to export an incomplete timetable, and the page says why.
  await page.getByRole('button', { name: all.courses.exportCalendar, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: all.errors.schedule_incomplete })).toBeVisible();
  // Changing the term clears the message; the complete term exports a calendar file.
  await page.getByRole('tab', { name: '2026 秋季学期', exact: true }).click();
  await expect(page.getByText(all.errors.schedule_incomplete, { exact: true })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: all.courses.exportCalendar, exact: true }).click();
  expect((await download).suggestedFilename()).toBe('stuhelper-schedule.ics');
  await expect(page.getByText(all.courses.exported, { exact: true })).toBeVisible();
});

test('the home page shows the next class day and courses waiting for a review', async ({ page }) => {
  const b = catalogue('zh-CN').browse;
  await page.clock.setFixedTime(monday);
  await page.goto('/campus?lang=zh-CN');
  const day = page.locator('section[aria-labelledby="h-day"]');
  await expect(day.getByRole('heading', { name: b.nextClassDay })).toBeVisible();
  // Monday has one lesson in the prototype timetable; the block says it is today.
  await expect(day.getByText(/今天/)).toBeVisible();
  await expect(day.getByRole('link', { name: /数据结构与算法/ })).toHaveAttribute('href', '/courses/c3');
  await expect(day.getByRole('link', { name: b.fullTimetable })).toHaveAttribute('href', '/me/courses');
  await expect(page.getByText(fill(b.pendingReviews, { count: '6' }), { exact: true })).toBeVisible();
});

test('my courses is listed in the personal center of the prototype', async ({ page }) => {
  const title = catalogue('zh-CN').courses.title;
  await page.goto('/me?lang=zh-CN');
  await expect(page.locator('nav.me-nav a[href="/me/courses"]')).toContainText(title);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('main a[href="/me/courses"]:visible')).toContainText(title);
});
