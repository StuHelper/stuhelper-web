import fs from 'node:fs';
import { member } from './demo-fixture.mjs';
import { expect, memberTest as test } from '../session-fixture.mjs';

const base = 'http://127.0.0.1:18787';
const catalogue = (info) => JSON.parse(fs.readFileSync(`src/locales/${info.project.metadata.locale}.json`, 'utf8'));

function profiles(page, conflictFirst = false) {
  const state = { profile: structuredClone(member.profile), writes: [], conflict: conflictFirst };
  page.route('**/api/v1/profiles/me', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: state.profile });
    const body = request.postDataJSON();
    state.writes.push(body);
    if (state.conflict) {
      state.conflict = false;
      state.profile = { ...state.profile, revision: state.profile.revision + 1 };
      return route.fulfill({ status: 409, json: { code: 'conflict' } });
    }
    state.profile = { ...state.profile, ...body, revision: state.profile.revision + 1 };
    return route.fulfill({ json: state.profile });
  });
  return state;
}

test('profile counts code points, saves visibility and keeps input after a conflict', async ({ page }, info) => {
  const all = catalogue(info), p = all.profile, state = profiles(page, true);
  await page.goto(`${base}/me/profile?lang=${info.project.metadata.locale}`);
  const nickname = page.getByRole('textbox', { name: p.nickname, exact: true });
  await nickname.fill('😀'.repeat(21));
  await expect(page.getByText(p.tooLong.replace('{max}', '20')).first()).toBeVisible();
  await expect(page.getByRole('button', { name: p.save, exact: true })).toBeDisabled();
  await nickname.fill('😀'.repeat(20));
  await expect(page.getByText('20/20')).toBeVisible();
  await page.getByRole('region', { name: p.publicShows }).getByRole('checkbox', { name: p.visibility.grade, exact: true }).check();
  await page.getByRole('button', { name: p.save, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(p.conflict);
  await page.getByRole('button', { name: p.reload, exact: true }).click();
  await expect(nickname).toHaveValue('😀'.repeat(20));
  await page.getByRole('button', { name: p.save, exact: true }).click();
  await expect(page.getByText(p.saved)).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ nickname: '😀'.repeat(20), revision: 2, visibility: { grade: true, school: true } });
});

test('group card fields start off and only the allowed ones are saved', async ({ page }, info) => {
  const p = catalogue(info).profile, state = profiles(page);
  await page.goto(`${base}/me/profile?lang=${info.project.metadata.locale}`);
  const card = page.getByRole('region', { name: p.card.title });
  for (const key of ['nickname', 'name', 'school', 'department', 'grade', 'student_id', 'gender']) await expect(card.getByRole('checkbox', { name: p.card.fields[key], exact: true })).not.toBeChecked();
  await card.getByRole('checkbox', { name: p.card.fields.nickname, exact: true }).check();
  await card.getByRole('checkbox', { name: p.card.fields.grade, exact: true }).check();
  await page.getByRole('button', { name: p.save, exact: true }).click();
  await expect(page.getByText(p.saved)).toBeVisible();
  expect(state.writes.at(-1).group_card_consent).toEqual({ school: false, grade: true, department: false, name: false, student_id: false, gender: false, nickname: true });
  // The public profile switches are separate; the same-named grade switch there is unchanged.
  expect(state.writes.at(-1).visibility.grade).toBe(false);
});
