import { describe, expect, it } from 'vitest'
import { Http } from '../../shared/api/http'
import { ClosureApi } from './closure'

function apiWithError(status: number, code: string) {
  return new ClosureApi(new Http(async () => Response.json({ code }, { status })))
}

describe('current closure', () => {
  it('opens the first application when the host reports no matching closure', async () => {
    await expect(apiWithError(404, 'closure_not_found').current()).resolves.toBeUndefined()
  })

  it('reports a missing route, denial or host failure to the page', async () => {
    for (const [status, code] of [[404, 'not_found'], [403, 'forbidden'], [503, 'closure_not_found']] as const) {
      await expect(apiWithError(status, code).current()).rejects.toMatchObject({ status })
    }
  })
})
