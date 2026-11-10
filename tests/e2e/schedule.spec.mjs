import fs from 'node:fs';
import { fixture as academicFixture } from './academic-fixture.mjs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));
const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, value), text);
const number = (info, value) => new Intl.NumberFormat(info.project.metadata.locale).format(value);
const timetable = { school_id: 'school', term_id: 'spring', revision: 1, week_one_start: '2026-09-07', timezone: 'Asia/Shanghai', periods: [{ number: 1, start: '08:00', end: '08:45' }, { number: 2, start: '08:50', end: '09:35' }, { number: 3, start: '09:50', end: '10:35' }] };
const enrollment = { id: 'enrollment-1', subject: 'synthetic', school_id: 'school', course_id: 'course', term_id: 'spring', teacher_ids: ['teacher-b'], active: true };

// Structured schedule for the spring term: one lesson in weeks 1–2, one in week 3, one unreadable time.
async function schedule(page, calendar) {
  const state = { calendar: 0 };
  await page.route('**/api/v1/catalog/me/schedule**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/calendar')) {
      state.calendar += 1;
      return calendar === 'incomplete'
        ? route.fulfill({ status: 422, json: { code: 'schedule_incomplete' } })
        : route.fulfill({ status: 200, contentType: 'text/calendar', body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' });
    }
    return route.fulfill({ json: { next: '', items: [{ enrollment, course_name: 'Test Course', timetable, meetings: [
      { id: 'm1', time_text: 'Mon 1-2', location: 'Room A', schedule_time: { weekday: 1, start_period: 1, end_period: 2, weeks: [1, 2] } },
      { id: 'm2', time_text: 'Wed 3', location: 'Room B', schedule_time: { weekday: 3, start_period: 3, end_period: 3, weeks: [3] } },
      { id: 'm3', time_text: 'Afternoon, by arrangement', location: '' },
    ] }] } });
  });
  return state;
}

test('the week grid opens on the current teaching week and moves between weeks', async ({ page }, info) => {
  const c = catalogue(info).courses;
  // Monday of week 2 in Shanghai.
  await page.clock.install({ time: new Date('2026-09-14T02:00:00Z') });
  await academicFixture(page);
  await schedule(page);
  await page.goto(`${base}/me/courses?lang=${info.project.metadata.locale}`);
  await expect(page.getByText(fill(c.weekNumber, { week: number(info, 2) }), { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Room A/ })).toBeVisible();
  await expect(page.getByText('08:00–08:45')).toBeVisible();
  await expect(page.getByText(c.unplaced)).toBeVisible();
  await expect(page.getByText('Afternoon, by arrangement', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: c.nextWeek, exact: true }).click();
  await expect(page.getByText(fill(c.weekNumber, { week: number(info, 3) }), { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Room B/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Room A/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: c.nextWeek, exact: true })).toBeDisabled();
});

test('exporting the calendar downloads a file, and an incomplete timetable says why', async ({ page }, info) => {
  const all = catalogue(info);
  await academicFixture(page);
  const state = await schedule(page, 'incomplete');
  await page.goto(`${base}/me/courses?lang=${info.project.metadata.locale}`);
  await page.getByRole('button', { name: all.courses.exportCalendar }).click();
  await expect(page.getByText(all.errors.schedule_incomplete, { exact: true })).toBeVisible();
  expect(state.calendar).toBe(1);

  await page.unroute('**/api/v1/catalog/me/schedule**');
  await schedule(page, 'ok');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: all.courses.exportCalendar }).click();
  expect((await download).suggestedFilename()).toBe('stuhelper-schedule.ics');
  await expect(page.getByText(all.errors.schedule_incomplete, { exact: true })).toHaveCount(0);
});
