import { expect, it } from 'vitest'
import type { OwnSchedule, Timetable } from './api'
import { arrange, currentWeek, timetableOf } from './schedule'

const timetable: Timetable = { school_id: 's', term_id: 't', revision: 1, week_one_start: '2026-09-07', timezone: 'Asia/Shanghai', periods: [{ number: 1, start: '08:00', end: '08:45' }] }
const enrollment = { id: 'e1', subject: 'u', school_id: 's', course_id: 'c1', term_id: 't', teacher_ids: [], active: true } as unknown as OwnSchedule['enrollment']

it('places structured meetings and keeps unreadable ones with their original text', () => {
  const rows: OwnSchedule[] = [{
    enrollment,
    course_name: 'Algorithms',
    meetings: [
      { id: 'm1', time_text: '周一 第1-2节 第1-16周', location: 'A201', schedule_time: { weekday: 1, start_period: 1, end_period: 2, weeks: [1, 2, 3] } },
      { id: 'm2', time_text: '周三 下午', location: '' },
    ],
    timetable,
  }]
  const { lessons, unplaced } = arrange(rows)
  expect(lessons).toEqual([{ key: 'e1:m1', courseId: 'c1', course: 'Algorithms', location: 'A201', weekday: 1, start: 1, end: 2, weeks: [1, 2, 3] }])
  expect(unplaced.map((item) => item.meeting.time_text)).toEqual(['周三 下午'])
  expect(timetableOf(rows)).toBe(timetable)
})

it('counts teaching weeks in the school time zone and clamps to the term', () => {
  // 2026-09-13 23:30 UTC is already Monday 2026-09-14 in Shanghai: week 2.
  expect(currentWeek(timetable, 16, new Date('2026-09-13T23:30:00Z'))).toBe(2)
  expect(currentWeek(timetable, 16, new Date('2026-09-13T12:00:00Z'))).toBe(1)
  expect(currentWeek(timetable, 16, new Date('2026-08-01T00:00:00Z'))).toBe(1)
  expect(currentWeek(timetable, 16, new Date('2027-03-01T00:00:00Z'))).toBe(16)
  expect(currentWeek(undefined, 16)).toBe(1)
  expect(currentWeek({ ...timetable, timezone: 'Not/AZone' }, 16, new Date('2026-09-21T12:00:00Z'))).toBe(3)
})
