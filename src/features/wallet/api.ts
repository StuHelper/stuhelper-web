import billingContract from '../../../contracts/billing.openapi.json'
import type { components } from '../../api/billing.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type Wallet = Schemas['Wallet']
export type Entry = Schemas['Entry']
export type Lot = Schemas['Lot']
export type Order = Schemas['Order']
export type Channel = Schemas['Channel']
export type Offer = Schemas['Offer']

const schemas = billingContract.components.schemas
const parse = {
  wallet: schemaOf<Wallet>(schemas, 'Wallet'),
  ledger: schemaOf<Schemas['LedgerPage']>(schemas, 'LedgerPage'),
  lots: schemaOf<Schemas['LotPage']>(schemas, 'LotPage'),
  orders: schemaOf<Schemas['OrderPage']>(schemas, 'OrderPage'),
  order: schemaOf<Order>(schemas, 'Order'),
  channels: schemaOf<Schemas['ChannelList']>(schemas, 'ChannelList'),
  offers: schemaOf<Schemas['OfferList']>(schemas, 'OfferList'),
}

/** Order states that will not change any more. */
export const finalStates: Order['state'][] = ['succeeded', 'failed', 'rejected', 'expired', 'cancelled']

/**
 * The caller's points and Ivory. Ivory amounts are in minor units (0.01 Ivory); a CNY top-up
 * credits 1 Ivory per 1 CNY. Points are whole numbers and may carry an expiry per lot.
 */
export class WalletApi {
  constructor(private readonly http: Http) {}

  wallet(signal?: AbortSignal) {
    return this.http.json('/api/v1/billing/wallet', parse.wallet, { signal })
  }

  ledger(after: string, signal?: AbortSignal) {
    return this.http.json('/api/v1/billing/ledger', parse.ledger, { query: { after, limit: 30 }, signal })
  }

  /** Point lots with remaining balance, used to show what expires and when. */
  async pointLots(signal?: AbortSignal) {
    const rows: Lot[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const result = await this.http.json('/api/v1/billing/lots', parse.lots, { query: { asset: 'points', after, limit: 100 }, signal })
      rows.push(...result.items)
      if (!result.next || result.next === after) break
      after = result.next
    }
    return rows
  }

  orders(after: string, signal?: AbortSignal) {
    return this.http.json('/api/v1/billing/orders', parse.orders, { query: { after, limit: 30 }, signal })
  }

  order(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/billing/orders/${segment(id)}`, parse.order, { signal })
  }

  channels(signal?: AbortSignal) {
    return this.http.json('/api/v1/billing/channels', parse.channels, { signal })
  }

  offers(signal?: AbortSignal) {
    return this.http.json('/api/v1/billing/offers', parse.offers, { signal })
  }

  topup(body: { channel: string; amount_minor: number }, key: string) {
    return this.http.json('/api/v1/billing/topups', parse.order, { method: 'POST', body, key })
  }

  purchase(body: { offer_id: string; version: number }, key: string) {
    return this.http.json('/api/v1/billing/purchases', parse.order, { method: 'POST', body, key })
  }

  refund(body: { topup_id: string; amount_minor: number; reason: string }, key: string) {
    return this.http.json('/api/v1/billing/refunds', parse.order, { method: 'POST', body, key })
  }

  receipt(id: string, body: { receipt_reference: string }, key: string) {
    return this.http.json(`/api/v1/billing/refunds/${segment(id)}/receipt`, parse.order, { method: 'POST', body, key })
  }

  /** Ask the payment provider for the current result. Only a confirmed payment credits Ivory. */
  refresh(id: string, key: string) {
    return this.http.json(`/api/v1/billing/orders/${segment(id)}/refresh`, parse.order, { method: 'POST', key })
  }

  cancel(id: string, key: string) {
    return this.http.json(`/api/v1/billing/orders/${segment(id)}/cancel`, parse.order, { method: 'POST', key })
  }
}

export function useWalletApi() {
  return new WalletApi(useHttp())
}

/** Minor units to a decimal string with two places, without floating-point rounding. */
export function minorText(minor: number) {
  const sign = minor < 0 ? '-' : ''
  const value = Math.abs(minor)
  return `${sign}${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}`
}

/** A typed Ivory amount with up to two decimals, in minor units; undefined when it is not one. */
export function parseIvory(text: string) {
  const match = /^(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return undefined
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Remaining points that will expire, grouped by expiry time, soonest first. */
export function expiringPoints(lots: Lot[]) {
  const totals = new Map<string, number>()
  for (const lot of lots) {
    const available = lot.remaining - lot.held
    if (lot.asset === 'points' && lot.expires_at && available > 0) totals.set(lot.expires_at, (totals.get(lot.expires_at) ?? 0) + available)
  }
  return [...totals].map(([at, points]) => ({ at, points })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}
