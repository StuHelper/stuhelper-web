import type { useVerification } from '../verification/api'
import type { useAcademic } from './api'

export interface OwnCourse {
  courseId: string
  /** Short address of the course page; the internal id when the catalog has none. */
  address: string
  termId: string
  termName: string
  teacherIds: string[]
  teacherNames: string[]
  name: string
  code: string
}
export interface OwnTerm { termId: string; name: string; order: number; rows: OwnCourse[] }
export interface OwnCourses { state: 'off' | 'ready'; groups: OwnTerm[] }

/**
 * The person's own courses by term, newest term first. They are read only with school
 * data authorization, which is the consent to read the person's own enrollment. A stopped
 * authorization still covers the terms authorized so far, so only 'inactive' turns it off.
 */
export async function loadOwnCourses(api: ReturnType<typeof useAcademic>, verification: ReturnType<typeof useVerification>, missingCourseLabel: string, signal?: AbortSignal): Promise<OwnCourses> {
  const authorization = await verification.schoolData(signal)
  if (authorization.state === 'inactive') return { state: 'off', groups: [] }
  const enrollments = (await api.myEnrollments(signal)).filter((row) => row.active)
  const names = await api.lookup(enrollments.flatMap((row) => [row.course_id, row.term_id, ...row.teacher_ids]), signal)
  const missing = enrollments.map(row => row.course_id).filter(id => !names.get(id)?.name)
  const owned = await api.enrollmentReferences(missing, signal)
  const groups = new Map<string, OwnTerm>()
  for (const row of enrollments) {
    const termName = names.get(row.term_id)?.name ?? row.term_id
    const group = groups.get(row.term_id) ?? { termId: row.term_id, name: termName, order: row.term_order_key ?? 0, rows: [] }
    const course = names.get(row.course_id)
    group.rows.push({
      courseId: row.course_id,
      address: course?.address_id || row.course_id,
      termId: row.term_id,
      termName,
      teacherIds: row.teacher_ids.slice(),
      teacherNames: row.teacher_ids.map((id) => names.get(id)?.name ?? '').filter(Boolean),
      name: course?.name || owned.get(row.course_id)?.name || missingCourseLabel,
      code: typeof course?.code === 'string' ? course.code : '',
    })
    groups.set(row.term_id, group)
  }
  return { state: 'ready', groups: [...groups.values()].sort((a, b) => b.order - a.order) }
}

/** The latest own enrollment of a course, or undefined when the person did not take it. */
export function latestEnrollment(groups: OwnTerm[], courseId: string): OwnCourse | undefined {
  for (const group of groups) {
    const found = group.rows.find((row) => row.courseId === courseId)
    if (found) return found
  }
  return undefined
}
