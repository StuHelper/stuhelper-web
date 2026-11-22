// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { installDemoFetch } from './server'
import { teacherLevels } from './store'
import { Http } from '../shared/api/http'
import { boxes, boxOf, NotificationsApi } from '../features/notifications/api'
import { ResourcesApi } from '../features/resources/api'

it('uses one statistics source for a teacher', async () => {
  installDemoFetch()
  const response = await window.fetch('/api/v1/reviews/statistics?target_id=p3')
  const body = await response.json() as { dimensions: { level: number }[] }
  expect(body.dimensions.map((row) => row.level)).toEqual(teacherLevels('p3'))
})

it('returns a contract-valid personal resource page in demo mode', async () => {
  installDemoFetch()
  const page = await new ResourcesApi(new Http(window.fetch.bind(window))).mine({})
  expect(page.total).toBe(page.items.length)
})

it.each([undefined, ...boxes])('returns a contract-valid demo notifications page for box %s', async (box) => {
  installDemoFetch()
  const api = new NotificationsApi(new Http(window.fetch.bind(window)))
  const page = await api.list(box, '')

  expect(new Set(page.items.map(boxOf))).toEqual(new Set(box ? [box] : boxes))
})
