import { expect, it } from 'vitest'
import { myCoursesEnabled } from './features'

// The unit-test build has no VITE_DEMO, like production. The page may only open in the review prototype.
it('keeps my courses off outside the review prototype', () => {
  expect(import.meta.env.VITE_DEMO).toBeUndefined()
  expect(myCoursesEnabled).toBe(false)
})
