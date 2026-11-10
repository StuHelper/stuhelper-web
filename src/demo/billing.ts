import * as d from './data'

// In-memory wallet that follows the billing contract. The demo payment channel shows a
// QR code; the provider "confirms" a payment when the user checks the result a few
// seconds later. A refund waits for review and then asks for payout details.
type Asset = 'points' | 'ivory'
type Entry = { id: string; asset: Asset; kind: string; amount: number; reference: string; created_at: string }
type Lot = { id: string; asset: Asset; original: number; remaining: number; held: number; expired: number; consumed: number; expires_at?: string; created_at: string }
type Order = {
  id: string; kind: 'topup' | 'purchase' | 'refund' | 'purchase_refund'; state: string; amount_minor: number; points: number; reference: string; channel: string; reason: string; created_at: string
  allocations: never[]; original_points: number; original_amount_minor: number; receipt_reference: string; failure_code: string; payment_instruction?: { type: 'qr_code' | 'redirect'; content: string; expires_at: string }
}

// Fields every order carries; refunds of purchases fill the original amounts.
const blank = { allocations: [] as never[], original_points: 0, original_amount_minor: 0, receipt_reference: '', failure_code: '' }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code }, status)
const inDays = (days: number) => new Date(Date.now() + days * 864e5).toISOString()

const channels = [{ id: 'demo-pay', enabled: true, amounts_minor: [1000, 3000, 5000, 10000], original_refunds: true }]
const offers = [
  { id: 'points-50', enabled: true, amount_minor: 500, points: 50, valid_seconds: 365 * 86400, version: 1 },
  { id: 'points-120', enabled: true, amount_minor: 1000, points: 120, valid_seconds: 365 * 86400, version: 1 },
  { id: 'points-400', enabled: true, amount_minor: 3000, points: 400, valid_seconds: 365 * 86400, version: 1 },
]
let sequence = 0
const id = (prefix: string) => `${prefix}-${++sequence}`
const wallet = { points: 0, ivory_minor: 0, frozen_ivory_minor: 0, debt_points: 0, frozen: false }
const entries: Entry[] = []
const lots: Lot[] = []
const orders: Order[] = []
const created = new Map<string, number>()
const receipts = new Map<string, unknown>()

function book(asset: Asset, kind: string, amount: number, reference: string, at = new Date().toISOString()) {
  entries.unshift({ id: id('entry'), asset, kind, amount, reference, created_at: at })
  if (asset === 'points') wallet.points += amount
  else wallet.ivory_minor += amount
}
function grant(points: number, days: number, at: string) {
  lots.push({ id: id('lot'), asset: 'points', original: points, remaining: points, held: 0, expired: 0, consumed: 0, expires_at: inDays(days), created_at: at })
}
// Seed history: a paid top-up, one redemption and two content rewards.
const seedTopup: Order = { id: 'order-seed', kind: 'topup', state: 'succeeded', amount_minor: 3000, points: 0, reference: 'seed', channel: 'demo-pay', reason: '', created_at: d.ago(20), ...blank }
orders.push(seedTopup)
book('ivory', 'topup', 3000, seedTopup.id, d.ago(20))
orders.unshift({ id: 'order-seed-points', kind: 'purchase', state: 'succeeded', amount_minor: 1000, points: 120, reference: 'points-120', channel: '', reason: '', created_at: d.ago(18), ...blank })
book('ivory', 'purchase', -1000, 'order-seed-points', d.ago(18))
book('points', 'purchase', 120, 'order-seed-points', d.ago(18))
grant(120, 347, d.ago(18))
book('points', 'reward', 5, 'reward-1', d.ago(6))
grant(5, 12, d.ago(6))
book('points', 'reward', 8, 'reward-2', d.ago(2))
grant(8, 90, d.ago(2))

const page = <T>(rows: T[]) => json({ items: rows, next: '' })

export async function billingRoute(p: string, method: string, u: URL, init: RequestInit | undefined): Promise<Response | undefined> {
  if (!p.startsWith('/billing/')) return undefined
  if (method === 'GET') {
    if (p === '/billing/wallet') return json(wallet)
    if (p === '/billing/ledger') return page(entries)
    if (p === '/billing/lots') return page(lots.filter((lot) => lot.asset === (u.searchParams.get('asset') ?? lot.asset) && lot.remaining > 0))
    if (p === '/billing/orders') return page(orders)
    if (p === '/billing/channels') return json({ items: channels })
    if (p === '/billing/offers') return json({ items: offers })
    const order = orders.find((row) => p === `/billing/orders/${row.id}`)
    return order ? json(order) : nope('billing_not_found', 404)
  }
  const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
  if (receipts.has(key)) return json(receipts.get(key))
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
  const done = (value: Order) => { receipts.set(key, structuredClone(value)); return json(value) }
  const at = new Date().toISOString()

  if (p === '/billing/topups') {
    const channel = channels.find((row) => row.id === body.channel && row.enabled)
    if (!channel || !channel.amounts_minor.includes(body.amount_minor)) return nope('billing_invalid_input', 400)
    const order: Order = { id: id('order'), kind: 'topup', state: 'awaiting_payment', amount_minor: body.amount_minor, points: 0, reference: '', channel: channel.id, reason: '', created_at: at, ...blank, payment_instruction: { type: 'qr_code', content: `https://pay.example.invalid/demo/${sequence}`, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() } }
    orders.unshift(order)
    created.set(order.id, Date.now())
    return done(order)
  }
  if (p === '/billing/purchases') {
    const offer = offers.find((row) => row.id === body.offer_id && row.version === body.version && row.enabled)
    if (!offer) return nope('billing_invalid_input', 400)
    if (wallet.ivory_minor < offer.amount_minor) return nope('billing_insufficient_funds', 409)
    const order: Order = { id: id('order'), kind: 'purchase', state: 'succeeded', amount_minor: offer.amount_minor, points: offer.points, reference: offer.id, channel: '', reason: '', created_at: at, ...blank }
    orders.unshift(order)
    book('ivory', 'purchase', -offer.amount_minor, order.id)
    book('points', 'purchase', offer.points, order.id)
    grant(offer.points, offer.valid_seconds / 86400, at)
    return done(order)
  }
  if (p === '/billing/refunds') {
    const topup = orders.find((row) => row.id === body.topup_id && row.kind === 'topup' && row.state === 'succeeded')
    if (!topup || !(body.amount_minor > 0) || body.amount_minor > Math.min(topup.amount_minor, wallet.ivory_minor) || !String(body.reason ?? '').trim()) return nope('billing_invalid_input', 400)
    const order: Order = { id: id('order'), kind: 'refund', state: 'awaiting_details', amount_minor: body.amount_minor, points: 0, reference: topup.id, channel: topup.channel, reason: body.reason, created_at: at, ...blank }
    orders.unshift(order)
    wallet.ivory_minor -= body.amount_minor
    wallet.frozen_ivory_minor += body.amount_minor
    return done(order)
  }
  const receipt = /^\/billing\/refunds\/([^/]+)\/receipt$/.exec(p)
  if (receipt) {
    const order = orders.find((row) => row.id === receipt[1] && row.state === 'awaiting_details')
    if (!order) return nope('billing_not_found', 404)
    Object.assign(order, { state: 'awaiting_manual', receipt_reference: String(body.receipt_reference ?? '') })
    return done(order)
  }
  const action = /^\/billing\/orders\/([^/]+)\/(refresh|cancel)$/.exec(p)
  if (action) {
    const order = orders.find((row) => row.id === action[1])
    if (!order) return nope('billing_not_found', 404)
    if (order.state === 'awaiting_payment' && action[2] === 'cancel') order.state = 'cancelled'
    // The demo provider confirms a payment five seconds after the order was created.
    if (order.state === 'awaiting_payment' && action[2] === 'refresh' && Date.now() - (created.get(order.id) ?? 0) > 5000) {
      order.state = 'succeeded'
      book('ivory', 'topup', order.amount_minor, order.id)
    }
    return json(order)
  }
  return nope('billing_not_found', 404)
}
