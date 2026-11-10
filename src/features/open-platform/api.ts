import contract from '../../../contracts/open-platform.openapi.json'
import type { components } from '../../api/open-platform.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type Scope = Schemas['Scope']
export type Application = Schemas['Application']
export type ApplicationInput = Schemas['ApplicationInput']
export type Credential = Schemas['Credential']
export type Consent = Schemas['Consent']
export type ConsentInput = Schemas['ConsentInput']
export type Grant = Schemas['Grant']
export type Notice = Schemas['Notice']

const schemas = contract.components.schemas
const parse = {
  app: schemaOf<Application>(schemas, 'Application'),
  apps: schemaOf<Schemas['Applications']>(schemas, 'Applications'),
  credential: schemaOf<Credential>(schemas, 'Credential'),
  consent: schemaOf<Consent>(schemas, 'Consent'),
  result: schemaOf<Schemas['AuthorizationResult']>(schemas, 'AuthorizationResult'),
  grant: schemaOf<Grant>(schemas, 'Grant'),
  grants: schemaOf<Schemas['Grants']>(schemas, 'Grants'),
  notice: schemaOf<Notice>(schemas, 'Notice'),
  notices: schemaOf<Schemas['Notices']>(schemas, 'Notices'),
}

/** Scopes in the order the contract lists them; each is requested, approved and consented separately. */
export const scopes: Scope[] = ['student_status', 'schools', 'qq_binding_status', 'qq_binding_details', 'profile', 'schedule', 'catalog', 'public_reviews']
export const pageSize = 100
// The contract omits the cursor on the last page.
const page = <T>(result: { items: T[]; next?: string }) => ({ items: result.items, next: result.next ?? '' })

/**
 * The open platform as seen by a signed-in person: applications they develop,
 * consent to an application's request, and the grants they gave.
 */
export class PlatformApi {
  constructor(private readonly http: Http) {}

  async apps(after: string, signal?: AbortSignal) {
    return page(await this.http.json('/api/v1/open-platform/apps', parse.apps, { query: { after, limit: pageSize }, signal }))
  }

  app(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/open-platform/apps/${segment(id)}`, parse.app, { signal })
  }

  create(body: ApplicationInput, key: string) {
    return this.http.json('/api/v1/open-platform/apps', parse.app, { method: 'POST', body, key })
  }

  /** Resubmit changed details of an application that is not active; the content is reviewed again. */
  submit(id: string, body: ApplicationInput, key: string) {
    return this.http.json(`/api/v1/open-platform/apps/${segment(id)}/submit`, parse.app, { method: 'POST', body, key })
  }

  /** Rotate the client secret. Only the first response for a key carries the secret. */
  rotate(id: string, revision: number, key: string) {
    return this.http.json(`/api/v1/open-platform/apps/${segment(id)}/credential`, parse.credential, { method: 'POST', body: { revision }, key })
  }

  async notices(id: string, after: string, signal?: AbortSignal) {
    return page(await this.http.json(`/api/v1/open-platform/apps/${segment(id)}/notices`, parse.notices, { query: { after, limit: pageSize }, signal }))
  }

  acknowledge(id: string, notice: string, body: { status: NonNullable<Notice['acknowledgement']>; note: string }, key: string) {
    return this.http.json(`/api/v1/open-platform/apps/${segment(id)}/notices/${segment(notice)}/ack`, parse.notice, { method: 'POST', body, key })
  }

  startConsent(body: ConsentInput, key: string) {
    return this.http.json('/api/v1/open-platform/consents', parse.consent, { method: 'POST', body, key })
  }

  consent(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/open-platform/consents/${segment(id)}`, parse.consent, { signal })
  }

  decide(id: string, body: { decision: 'approve' | 'deny'; scopes: Scope[] }, key: string) {
    return this.http.json(`/api/v1/open-platform/consents/${segment(id)}/decision`, parse.result, { method: 'POST', body, key })
  }

  async grants(after: string, signal?: AbortSignal) {
    return page(await this.http.json('/api/v1/open-platform/grants', parse.grants, { query: { after, limit: pageSize }, signal }))
  }

  /** Withdraw some or all scopes of a grant; old tokens stop working immediately. */
  revoke(id: string, body: { revision: number; scopes: Scope[] }, key: string) {
    return this.http.json(`/api/v1/open-platform/grants/${segment(id)}/revoke`, parse.grant, { method: 'POST', body, key })
  }
}

export function usePlatformApi() {
  return new PlatformApi(useHttp())
}

/** Redirect URIs must be exact HTTPS addresses without a fragment, as the server requires. */
export function redirectProblem(value: string): 'invalid' | 'https' | 'fragment' | '' {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'invalid'
  }
  if (url.protocol !== 'https:') return 'https'
  if (value.includes('#')) return 'fragment'
  return ''
}

/**
 * Read an OAuth authorization request from the page address. Unknown scopes and
 * a missing PKCE challenge make the request unusable; the page then explains the
 * problem instead of contacting the server.
 */
export function readAuthorization(query: Record<string, unknown>): ConsentInput | undefined {
  const text = (key: string) => (typeof query[key] === 'string' ? query[key] : '')
  const requested = text('scope').split(' ').filter(Boolean)
  if (query.response_type !== 'code' || !text('client_id') || !text('redirect_uri') || !text('state')) return undefined
  if (!/^[A-Za-z0-9_-]{43}$/.test(text('code_challenge')) || text('code_challenge_method') !== 'S256') return undefined
  if (!requested.length || requested.some((scope) => !scopes.includes(scope as Scope))) return undefined
  return { client_id: text('client_id'), redirect_uri: text('redirect_uri'), state: text('state'), scope: requested as Scope[], code_challenge: text('code_challenge'), code_challenge_method: 'S256' }
}
