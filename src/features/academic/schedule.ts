import type { OwnSchedule, ScheduleMeeting, Timetable } from './api'

/** A meeting placed on the week grid: one course, one weekday, a run of periods. */
export interface Lesson {
  key: string
  courseId: string
  course: string
  location: string
  weekday: number
  start: number
  end: number
  weeks: number[]
}

/** Meetings with a structured time become lessons; the rest keep only their original text. */
export function arrange(rows: OwnSchedule[]) {
  const lessons: Lesson[] = []
  const unplaced: { course: string; courseId: string; meeting: ScheduleMeeting }[] = []
  for (const row of rows) {
    for (const meeting of row.meetings) {
      const time = meeting.schedule_time
      if (!time) {
        unplaced.push({ course: row.course_name, courseId: row.enrollment.course_id, meeting })
        continue
      }
      lessons.push({ key: `${row.enrollment.id}:${meeting.id}`, courseId: row.enrollment.course_id, course: row.course_name, location: meeting.location, weekday: time.weekday, start: time.start_period, end: time.end_period, weeks: time.weeks })
    }
  }
  return { lessons, unplaced }
}

/** The school timetable shared by the term; every row of one term carries the same one when present. */
export const timetableOf = (rows: OwnSchedule[]): Timetable | undefined => rows.find((row) => row.timetable)?.timetable

/** Today's date in the school's time zone, as YYYY-MM-DD. An unknown zone falls back to UTC. */
function schoolToday(now: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/**
 * Teaching week containing today, counted from the Monday of week one in the
 * school's time zone. Before the term starts this is week 1; after it ends, the last week.
 */
export function currentWeek(timetable: Timetable | undefined, last: number, now = new Date()) {
  if (!timetable) return 1
  const days = Math.floor((Date.parse(schoolToday(now, timetable.timezone)) - Date.parse(timetable.week_one_start)) / 86_400_000)
  if (!Number.isFinite(days)) return 1
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), Math.max(last, 1))
}

/**
 * Where today falls in the term: its teaching week and weekday (1 Monday to 7 Sunday) in the
 * school's time zone. Undefined before week one, or without a timetable; the caller decides
 * whether a week after the last lesson still counts.
 */
export function todayInTerm(timetable: Timetable | undefined, now = new Date()) {
  if (!timetable) return undefined
  const days = Math.floor((Date.parse(schoolToday(now, timetable.timezone)) - Date.parse(timetable.week_one_start)) / 86_400_000)
  if (!Number.isFinite(days) || days < 0) return undefined
  return { week: Math.floor(days / 7) + 1, weekday: (days % 7) + 1 }
}

/** The seven calendar dates (YYYY-MM-DD, Monday first) of one teaching week. Empty without a timetable. */
export function weekDates(timetable: Timetable | undefined, week: number) {
  const start = timetable ? Date.parse(timetable.week_one_start) : Number.NaN
  if (!Number.isFinite(start)) return []
  return Array.from({ length: 7 }, (_, day) => new Date(start + ((week - 1) * 7 + day) * 86_400_000).toISOString().slice(0, 10))
}
