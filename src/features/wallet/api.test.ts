import { expect, it } from 'vitest'
import { Http } from '../../shared/api/http'
import { WalletApi, expiringPoints, minorText, parseIvory, type Lot } from './api'

const lot = (remaining: number, held: number, expires_at?: string): Lot => ({ id: `lot-${remaining}-${expires_at ?? 'none'}`, asset: 'points', original: remaining, remaining, held, expired: 0, consumed: 0, created_at: '2026-11-01T00:00:00Z', ...(expires_at ? { expires_at } : {}) })

it('formats minor units as a two-decimal amount without floating-point rounding', () => {
  expect(minorText(0)).toBe('0.00')
  expect(minorText(5)).toBe('0.05')
  expect(minorText(123456)).toBe('1234.56')
  expect(minorText(-1010)).toBe('-10.10')
  expect(minorText(9007199254740991)).toBe('90071992547409.91')
})

it('reads typed Ivory amounts with at most two decimals', () => {
  expect(parseIvory('12')).toBe(1200)
  expect(parseIvory(' 12.5 ')).toBe(1250)
  expect(parseIvory('0,07')).toBe(7)
  expect(parseIvory('0.10')).toBe(10)
  for (const text of ['', '1.234', '-1', '1e3', 'abc', '.5']) expect(parseIvory(text)).toBeUndefined()
})

it('groups expiring points by date, excludes held and non-expiring points, and sorts soonest first', () => {
  const rows = expiringPoints([
    lot(10, 4, '2026-12-01T00:00:00Z'),
    lot(5, 0, '2026-11-20T00:00:00Z'),
    lot(3, 0, '2026-12-01T00:00:00Z'),
    lot(7, 7, '2026-11-10T00:00:00Z'),
    lot(9, 0),
  ])
  expect(rows).toEqual([{ at: '2026-11-20T00:00:00Z', points: 5 }, { at: '2026-12-01T00:00:00Z', points: 9 }])
})

it('reads every page of point lots and stops on a repeated cursor', async () => {
  const urls: URL[] = []
  const api = new WalletApi(new Http(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    urls.push(url)
    const after = url.searchParams.get('after')
    return Response.json({ items: [lot(urls.length, 0, '2026-12-01T00:00:00Z')], next: after === 'b' ? 'b' : after ? 'b' : 'a' })
  }))
  const rows = await api.pointLots()
  expect(rows).toHaveLength(3)
  expect(urls.map((url) => url.searchParams.get('asset'))).toEqual(['points', 'points', 'points'])
  expect(urls.map((url) => url.searchParams.get('after') ?? '')).toEqual(['', 'a', 'b'])
})

it('sends each write with the caller idempotency key and rejects responses outside the contract', async () => {
  const sent: { url: string; key: string | null; body: unknown }[] = []
  const order = { id: 'order', kind: 'topup', state: 'awaiting_payment', amount_minor: 1000, points: 0, reference: '', channel: 'demo-pay', reason: '', created_at: '2026-11-08T00:00:00Z', allocations: [], original_points: 0, original_amount_minor: 0, receipt_reference: '', failure_code: '' }
  const api = new WalletApi(new Http(async (input, init) => {
    sent.push({ url: String(input), key: new Headers(init?.headers).get('Idempotency-Key'), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return sent.length === 1 ? Response.json(order) : Response.json({ ...order, state: 'settled' })
  }))
  await expect(api.topup({ channel: 'demo-pay', amount_minor: 1000 }, 'key-1')).resolves.toMatchObject({ state: 'awaiting_payment' })
  await expect(api.refresh('order', 'key-2')).rejects.toMatchObject({ code: 'incompatible' })
  expect(sent[0]).toMatchObject({ key: 'key-1', body: { channel: 'demo-pay', amount_minor: 1000 } })
  expect(sent[1]!.url).toContain('/api/v1/billing/orders/order/refresh')
  expect(sent[1]!.key).toBe('key-2')
})
