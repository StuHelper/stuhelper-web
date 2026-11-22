import { afterEach, describe, expect, it, vi } from 'vitest'
import { mediaFetch } from './media'

const site = 'https://app.example.org'
const path = '/api/v1/catalog/objects/teacher/teacher-homepage/photos/' + 'a'.repeat(64)
function setup(final: string) {
  vi.stubGlobal('window', { location: new URL(site) })
  const response = new Response()
  Object.defineProperty(response, 'url', { value: final })
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Catalog image transport', () => {
  it('rejects non-image routes, foreign initial URLs and writes before sending a request', async () => {
    const fetcher = setup(site + path)
    for (const url of ['/api/v1/auth/session', 'https://media.stuhelper.com' + path, path + '?other=1']) {
      await expect(mediaFetch(url)).rejects.toThrow('media_route_mismatch')
    }
    await expect(mediaFetch(path, { method: 'POST' })).rejects.toThrow('media_route_mismatch')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects unknown or empty final origins and an HTTP media configuration', async () => {
    for (const origin of ['', 'https://unrelated.example.org', 'http://media.example.org']) {
      setup(origin && origin + '/object')
      vi.stubEnv('VITE_MEDIA_ORIGIN', 'http://media.example.org')
      await expect(mediaFetch(path)).rejects.toThrow('media_origin_mismatch')
    }
  })
  it('accepts the configured HTTPS origin and sends only same-origin credentials', async () => {
    vi.stubEnv('VITE_MEDIA_ORIGIN', 'https://media.example.org')
    const fetcher = setup('https://media.example.org/object')
    await mediaFetch(path)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'follow', mode: 'cors', credentials: 'same-origin' })
    expect(fetcher.mock.calls[0]?.[1]?.headers).toBeUndefined()
  })
})
