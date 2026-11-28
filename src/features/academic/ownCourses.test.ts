import { describe, expect, it, vi } from 'vitest'
import type { CatalogObject, Enrollment } from './api'
import { latestEnrollment, loadOwnCourses } from './ownCourses'

const enrollment = (course: string, term: string, order: number, teachers: string[], active = true) =>
  ({ id: `${course}:${term}`, course_id: course, term_id: term, term_order_key: order, teacher_ids: teachers, active }) as unknown as Enrollment
const named = (id: string, name: string, extra: Partial<CatalogObject> = {}) => [id, { id, name, ...extra } as CatalogObject] as const

function fakes(state: 'active' | 'historical' | 'inactive', rows: Enrollment[]) {
  const api = {
    enrollmentReferences: vi.fn(async () => new Map([named('hidden', '体育来源课程')])),
    myEnrollments: vi.fn(async () => rows),
    lookup: vi.fn(async () => new Map([named('c1', '操作系统', { code: 'B3I06302', address_id: 'B3I06302' }), named('c2', '编译原理'), named('t1', '2025 秋季学期'), named('t2', '2026 春季学期'), named('p1', '陈老师'), named('p2', '许老师')])),
  }
  const verification = { schoolData: vi.fn(async () => ({ state })) }
  return { api: api as never, verification: verification as never, spies: { api, verification } }
}

describe('own courses', () => {
  it('does not read enrollment without school data authorization', async () => {
    const { api, verification, spies } = fakes('inactive', [enrollment('c1', 't1', 1, ['p1'])])
    expect(await loadOwnCourses(api, verification, '课程信息暂缺')).toEqual({ state: 'off', groups: [] })
    expect(spies.api.myEnrollments).not.toHaveBeenCalled()
  })

  it('groups active enrollments by term, newest first, with every teacher', async () => {
    const { api, verification } = fakes('historical', [
      enrollment('c1', 't1', 1, ['p1', 'p2']),
      enrollment('c2', 't2', 2, ['p2']),
      enrollment('c2', 't1', 1, ['p1'], false),
    ])
    const own = await loadOwnCourses(api, verification, '课程信息暂缺')
    expect(own.state).toBe('ready')
    expect(own.groups.map((group) => [group.termId, group.rows.map((row) => row.courseId)])).toEqual([['t2', ['c2']], ['t1', ['c1']]])
    expect(own.groups[1]?.rows[0]).toMatchObject({ address: 'B3I06302', code: 'B3I06302', termName: '2025 秋季学期', teacherIds: ['p1', 'p2'], teacherNames: ['陈老师', '许老师'] })
  })

  it('uses owner references for omitted courses and never labels an unknown course with its id', async () => {
    const { api, verification, spies } = fakes('active', [
      enrollment('hidden', 't1', 1, []), enrollment('missing', 't1', 1, ['p1']),
    ])
    const { groups } = await loadOwnCourses(api, verification, '课程信息暂缺')
    expect(groups[0]?.rows.map(row => [row.courseId, row.name])).toEqual([
      ['hidden', '体育来源课程'], ['missing', '课程信息暂缺'],
    ])
    expect(spies.api.enrollmentReferences).toHaveBeenCalledWith(['hidden', 'missing'], undefined)
  })

  it('finds the latest term in which the person took a course', async () => {
    const { api, verification } = fakes('active', [enrollment('c1', 't1', 1, ['p1']), enrollment('c1', 't2', 2, ['p2'])])
    const { groups } = await loadOwnCourses(api, verification, '课程信息暂缺')
    expect(latestEnrollment(groups, 'c1')?.termId).toBe('t2')
    expect(latestEnrollment(groups, 'c9')).toBeUndefined()
  })
})
