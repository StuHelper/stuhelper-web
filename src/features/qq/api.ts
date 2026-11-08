import qqContract from '../../../contracts/qq-binding.openapi.json'
import type { components } from '../../api/qq-binding.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type QqStatus = Schemas['Status']
export type QqCode = Schemas['Code']
export type QqPart = 'onebot' | 'official' | 'connect'
export type BotPart = Exclude<QqPart, 'connect'>

const schemas = qqContract.components.schemas
const parse = {
  status: schemaOf<QqStatus>(schemas, 'Status'),
  code: schemaOf<QqCode>(schemas, 'Code'),
  authorization: schemaOf<Schemas['Authorization']>(schemas, 'Authorization'),
}

/**
 * QQ binding has three independent parts: the QQ number from the OneBot bot, the QQ Connect
 * openid and unionid, and the openid under the official QQ bot. Binding counts as complete
 * only when all three are bound; the server decides and reports `complete`.
 */
export class QqBindingApi {
  constructor(private readonly http: Http) {}

  status(signal?: AbortSignal) {
    return this.http.json('/api/v1/qq-binding/me', parse.status, { signal })
  }

  /** A one-time code for a bot part. A new key invalidates the previous unused code of that part. */
  code(kind: BotPart, key: string) {
    return this.http.json('/api/v1/qq-binding/codes', parse.code, { method: 'POST', body: { kind }, key })
  }

  /** The QQ Connect authorization address. The browser leaves the site to open it. */
  startConnect(key: string) {
    return this.http.json('/api/v1/qq-binding/connect/start', parse.authorization, { method: 'POST', body: {}, key })
  }

  confirmConnect(body: { state: string; code: string }, key: string) {
    return this.http.json('/api/v1/qq-binding/connect/confirm', parse.status, { method: 'POST', body, key })
  }

  cancelConnect(body: { state: string }, key: string) {
    return this.http.json('/api/v1/qq-binding/connect/cancel', parse.status, { method: 'POST', body, key })
  }

  unlink(kind: QqPart, revision: number, key: string) {
    return this.http.json(`/api/v1/qq-binding/bindings/${segment(kind)}/unlink`, parse.status, { method: 'POST', body: { revision }, key })
  }
}

export function useQqBindingApi() {
  return new QqBindingApi(useHttp())
}

/** Hide the middle digits of the caller's QQ number on screen; the first and last two stay visible. */
export function maskQq(number: string) {
  return number.length > 4 ? `${number.slice(0, 2)}${'*'.repeat(number.length - 4)}${number.slice(-2)}` : number
}

