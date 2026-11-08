import { expect, it } from 'vitest'
import { Http } from '../../shared/api/http'
import { PlatformApi, readAuthorization, redirectProblem } from './api'

const challenge = 'a'.repeat(43)
const request = { response_type: 'code', client_id: 'app', redirect_uri: 'https://app.example.invalid/cb', state: 's1', scope: 'profile schedule', code_challenge: challenge, code_challenge_method: 'S256' }

it('accepts only exact HTTPS redirect addresses without a fragment', () => {
  expect(redirectProblem('https://app.example.invalid/cb')).toBe('')
  expect(redirectProblem('http://app.example.invalid/cb')).toBe('https')
  expect(redirectProblem('https://app.example.invalid/cb#x')).toBe('fragment')
  expect(redirectProblem('app.example.invalid/cb')).toBe('invalid')
})

it('reads a complete authorization request and keeps the requested scope order', () => {
  expect(readAuthorization(request)).toEqual({ client_id: 'app', redirect_uri: 'https://app.example.invalid/cb', state: 's1', scope: ['profile', 'schedule'], code_challenge: challenge, code_challenge_method: 'S256' })
})

it('rejects authorization requests without PKCE S256, with unknown scopes or another response type', () => {
  expect(readAuthorization({ ...request, code_challenge_method: 'plain' })).toBeUndefined()
  expect(readAuthorization({ ...request, code_challenge: 'short' })).toBeUndefined()
  expect(readAuthorization({ ...request, scope: 'profile wallet' })).toBeUndefined()
  expect(readAuthorization({ ...request, scope: '' })).toBeUndefined()
  expect(readAuthorization({ ...request, response_type: 'token' })).toBeUndefined()
  expect(readAuthorization({ ...request, state: '' })).toBeUndefined()
})

it('treats a missing cursor as the last page', async () => {
  const api = new PlatformApi(new Http(async () => Response.json({ items: [] })))
  await expect(api.grants('')).resolves.toEqual({ items: [], next: '' })
})
