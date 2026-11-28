import { describe, expect, it, vi } from 'vitest'
import type { CatalogObject, DirectoryItem } from './api'
import { cardFromDirectory, cardsByIds } from './courseCard'

const object = (id: string, kind: string, name: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, school_id: 's', credits: null, aliases: [], revision: 1, updated_at: '2026-10-20T08:00:00Z', ...extra }) as unknown as CatalogObject
const course = object('c4', 'course', '操作系统', { credits: 4, code: 'B3I06302', address_id: 'B3I06302', department_id: 'd-cs', category_id: 'c-core' })

describe('course cards', () => {
  it('carries the facts of a course list row from a directory row', () => {
    const row = { object: course, departments: [object('d-cs', 'department', '计算机学院')], categories: [object('c-core', 'category', '专业课')], review_count: 12, recommendation: 'strongly_recommended' } as unknown as DirectoryItem
    expect(cardFromDirectory(row)).toMatchObject({ code: 'B3I06302', credits: 4, department: '计算机学院', category: { id: 'c-core', name: '专业课' }, level: 5, reviews: 12 })
  })

  it('names department and category of courses known only by id, without inventing ratings', async () => {
    const lookup = vi.fn(async (ids: (string | undefined)[]) => new Map([course, object('d-cs', 'department', '计算机学院'), object('c-core', 'category', '专业课')].filter((item) => ids.includes(item.id)).map((item) => [item.id, item])))
    const cards = await cardsByIds({ lookup } as never, ['c4'])
    expect(cards.get('c4')).toMatchObject({ code: 'B3I06302', credits: 4, department: '计算机学院', category: { name: '专业课' }, level: 0, reviews: undefined })
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})
