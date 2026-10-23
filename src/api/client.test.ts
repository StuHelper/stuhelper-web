import { describe, expect, it } from 'vitest'
import { getCapabilities, getModules } from './client'

const signal = new AbortController().signal
const fetcher = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

describe('platform contract', () => {
  it('accepts supported capabilities including unknown optional capabilities', async () => {
    const body = { api_version: 1, capabilities: ['platform.status', 'future.optional'] }
    await expect(getCapabilities(signal, fetcher(body))).resolves.toEqual(body)
  })
  it.each([{ api_version: 2, capabilities: [] }, { capabilities: [] }, { api_version: 1, capabilities: [1] }, null])('rejects incompatible data %s', async body => {
    await expect(getCapabilities(signal, fetcher(body))).rejects.toMatchObject({ code: 'incompatible' })
  })
  it('preserves identity service unavailability', async () => {
    await expect(getModules(signal, fetcher({ code: 'identity_unavailable' }, 503))).rejects.toMatchObject({ code: 'identity' })
  })
  it.each([[401, 'unauthenticated'], [403, 'forbidden'], [502, 'unavailable']] as const)('does not treat HTTP %i as a successful login', async (status, code) => {
    await expect(getModules(signal, fetcher({}, status))).rejects.toMatchObject({ code })
  })
  it('rejects unknown module lifecycle state', async () => {
    await expect(getModules(signal, fetcher([{ id: 'a', state: 'magic' }]))).rejects.toMatchObject({ code: 'incompatible' })
  })
})
