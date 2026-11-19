import { expect, it } from 'vitest'
import { parseEntity } from '../features/verification/api'
import { verificationRoute } from './verification'

it('returns a suggestion receipt and lists a removal request after it is filed', async () => {
  const request = (path: string, method: string, body?: unknown) =>
    verificationRoute('/verification' + path, method, body ? { body: JSON.stringify(body) } : undefined, 'verified', [])!
  const suggestion = parseEntity('Suggestion', await request('/suggestions', 'POST', { name: 'Fixture school', website: 'https://example.invalid' }).json())
  expect(suggestion).toMatchObject({ state: 'pending', name: 'Fixture school' })
  const list = await request('/credentials', 'GET').json()
  const credential = parseEntity('Credential', list[0])
  const saved = parseEntity('RemovalRequest', await request('/credentials/' + credential.id + '/requests', 'POST', { kind: 'revoke', reason: 'Fixture request' }).json())
  expect(saved).toMatchObject({ credential_id: credential.id, reason: 'Fixture request', state: 'pending' })
  expect(await request('/requests', 'GET').json()).toContainEqual(saved)
})
