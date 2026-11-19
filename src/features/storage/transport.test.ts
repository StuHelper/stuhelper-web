import { describe, expect, it, vi } from 'vitest'
import { contributionAPI } from '../../api/contribution'
import { custodyAPI } from '../../api/custody'
import { createStorageFetch } from './transport'

describe('storage shared transport', () => {
  it('enforces redirect: error and notifies session hooks on 401, 403 and 503', async () => {
    const onDenied = vi.fn()
    const onUnavailable = vi.fn()
    const seen: RequestInit[] = []
    const raw = vi.fn<typeof fetch>(async (input, init) => {
      seen.push(init ?? {})
      const url = String(input)
      if (url.includes('/policy')) return new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 })
      if (url.includes('/statistics')) return new Response(JSON.stringify({ code: 'unavailable' }), { status: 503 })
      return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })
    })
    const wrapped = createStorageFetch(raw, { onDenied, onUnavailable })
    const contrib = contributionAPI(wrapped)
    const custody = custodyAPI(wrapped)

    await expect(contrib.policy(new AbortController().signal)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(onDenied).toHaveBeenCalledWith(401)
    expect(seen[0]?.redirect).toBe('error')

    await expect(contrib.statistics(new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
    expect(onUnavailable).toHaveBeenCalledTimes(1)

    await expect(custody.list(new AbortController().signal)).rejects.toMatchObject({ code: 'forbidden' })
    expect(onDenied).toHaveBeenCalledWith(403)
  })

  it('bounds response payloads and turns oversized JSON into incompatible', async () => {
    const huge = 'x'.repeat(4 * 1024 * 1024 + 128)
    const wrapped = createStorageFetch(async () => new Response(huge, { status: 200 }))
    const custody = custodyAPI(wrapped)
    await expect(custody.policy(new AbortController().signal)).rejects.toMatchObject({ code: 'incompatible' })
  })
})
