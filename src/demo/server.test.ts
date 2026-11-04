// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { installDemoFetch } from './server'
import { teacherLevels } from './store'

it('uses one statistics source for a teacher', async () => {
  installDemoFetch()
  const response = await window.fetch('/api/v1/reviews/statistics?target_id=p3')
  const body = await response.json() as { dimensions: { level: number }[] }
  expect(body.dimensions.map((row) => row.level)).toEqual(teacherLevels('p3'))
})
