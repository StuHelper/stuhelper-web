// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { installDemoFetch, setPersona } from './server'
import { teacherLevels } from './store'
import { Http } from '../shared/api/http'
import { LegalApi } from '../features/legal/api'
import { ResourcesApi } from '../features/resources/api'
import { createSessionStore } from '../shared/session'

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

it('serves current, fixed and paged public legal documents to a guest', async () => {
  installDemoFetch()
  setPersona('guest')
  try {
    const api = new LegalApi(new Http(window.fetch.bind(window)))
    const current = await api.current('terms')
    expect(current).toMatchObject({ title: 'StuHelper 用户服务协议', version: '3.0' })
    const older = await api.version('terms', '2.0')
    const fragment = await window.fetch('/api/v1/legal/documents/terms/versions/2.0/html')
    expect(fragment.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await fragment.text()).toBe(older.html)
    expect(older.digest).not.toBe(current.digest)
    const first = await api.versions('terms', '')
    expect(first.items).toHaveLength(50)
    expect(first.items[0]).toMatchObject({ version: current.version, digest: current.digest })
    expect(first.items[0]).not.toHaveProperty('html')
    expect(first.next).toBe('50')
    const last = await api.versions('terms', first.next)
    expect(last.items.map(({ version }) => version)).toEqual(['1.1'])
    expect(last.next).toBe('')
    await expect(api.version('terms', 'missing')).rejects.toMatchObject({ code: 'not_found' })
    await expect(api.versions('missing', '')).resolves.toEqual({ items: [], next: '' })
  } finally {
    localStorage.removeItem('stuhelper-demo-persona')
  }
})

it('links the demo consent status and upload terms to their published snapshots', async () => {
  installDemoFetch()
  const fetcher = window.fetch.bind(window)
  const api = new LegalApi(new Http(fetcher))
  const { documents } = await createSessionStore(fetcher).consentStatus()
  const resources = new ResourcesApi(new Http(fetcher))
  try {
    vi.stubEnv('VITE_DEMO', '')
    await expect(resources.capabilities()).rejects.toMatchObject({ code: 'incompatible' })
    vi.stubEnv('VITE_DEMO', '1')
    const capabilities = await resources.capabilities()
    const otherOrigin = new ResourcesApi(new Http(async () => Response.json({
      ...capabilities, terms: { ...capabilities.terms, url: 'http://127.0.0.1:18874/legal/upload-license/versions/3.0' },
    })))
    await expect(otherOrigin.capabilities()).rejects.toMatchObject({ code: 'incompatible' })
    for (const [slug, reference] of Object.entries({ ...documents, 'upload-license': capabilities.terms })) {
      const fixed = await api.version(slug, reference.version)
      const url = new URL(reference.url)
      expect(url.origin).toBe(window.location.origin)
      expect(url.pathname).toBe(`/legal/${slug}/versions/${fixed.version}`)
      expect(reference.digest).toBe(fixed.digest)
    }
  } finally {
    vi.unstubAllEnvs()
  }
})
