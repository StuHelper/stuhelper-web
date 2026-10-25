import { describe, expect, it } from 'vitest'
import { getCapabilities, getModules } from './client'
import cases from '../../contracts/client-cases.json'
const signal = new AbortController().signal
const fetcher = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

describe('provider-owned client behavior cases', () => {
  it.each(cases.capabilities)('$name', async ({ body, accepted }) => {
    const result = getCapabilities(signal, fetcher(body))
    if (accepted) await expect(result).resolves.toEqual(body)
    else await expect(result).rejects.toMatchObject({ code: 'incompatible' })
  })
  it.each(cases.modules)('$name', async ({ body, accepted }) => {
    const result = getModules(signal, fetcher(body))
    if (accepted) await expect(result).resolves.toEqual(body)
    else await expect(result).rejects.toMatchObject({ code: 'incompatible' })
  })
  it.each(cases.http_errors)('maps HTTP $status to $code', async ({ status, body, code }) => {
    await expect(getModules(signal, fetcher(body, status))).rejects.toMatchObject({ code })
  })
})
