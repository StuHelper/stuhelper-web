import { beforeEach, describe, expect, it } from 'vitest'
import { clearCompare, compareList, maxCompare, toggleCompare } from './compare'

describe('compare state', () => {
  beforeEach(() => {
    clearCompare('course')
    clearCompare('teacher')
  })

  it('adds items up to maxCompare, removes toggled items and clears only the requested kind', () => {
    for (let i = 1; i <= maxCompare; i++) {
      expect(toggleCompare('course', `c-${i}`)).toBe(true)
    }
    expect(toggleCompare('course', 'c-extra')).toBe(false)
    expect(compareList.course).toHaveLength(maxCompare)

    expect(toggleCompare('teacher', 't-1')).toBe(true)
    expect(toggleCompare('course', 'c-2')).toBe(true)
    expect(compareList.course).not.toContain('c-2')

    clearCompare('course')
    expect(compareList.course).toEqual([])
    expect(compareList.teacher).toEqual(['t-1'])
  })
})
