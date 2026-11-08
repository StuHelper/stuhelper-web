import sessionContract from '../../../contracts/session.openapi.json'
import type { components } from '../../api/session.gen'
import { errorCode } from '../../shared/api/errors'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

export type Closure = components['schemas']['Closure']
const parse = schemaOf<Closure>(sessionContract.components.schemas, 'Closure')

/**
 * Closing the StuHelper account. A request starts a seven-day cooling period; administrators
 * process it afterwards. The shared SSO account and other applications are not affected.
 */
export class ClosureApi {
  constructor(private readonly http: Http) {}

  /** The current request, or undefined when there is none. */
  async current(signal?: AbortSignal) {
    try {
      return await this.http.json('/api/v1/profiles/me/closure', parse, { signal })
    } catch (failure) {
      if (errorCode(failure) === 'not_found') return undefined
      throw failure
    }
  }

  request(key: string) {
    return this.http.json('/api/v1/profiles/me/closure', parse, { method: 'POST', body: { acknowledge_points_forfeiture: true }, key })
  }

  cancel(id: string, key: string) {
    return this.http.json(`/api/v1/profiles/me/closure/${segment(id)}/cancel`, parse, { method: 'POST', key })
  }
}

export function useClosureApi() {
  return new ClosureApi(useHttp())
}
