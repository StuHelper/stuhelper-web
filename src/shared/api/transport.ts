import { inject, type InjectionKey } from 'vue'

/**
 * Same-origin transport for the application session. OIDC tokens and the
 * session itself stay in the backend and an HttpOnly cookie; JavaScript only
 * reads the session-bound CSRF value and sends it on writes.
 */
export const sessionFetch: typeof fetch = (input, init) => {
  if (typeof window !== 'undefined') {
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (target.origin !== window.location.origin) throw new TypeError('session_origin_mismatch')
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof document !== 'undefined') {
    const value = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('stuhelper_csrf='))
      ?.slice('stuhelper_csrf='.length)
    if (value) headers.set('X-CSRF-Token', value)
  }
  return fetch(input, { ...init, credentials: 'same-origin', headers })
}

/**
 * A host can supply its own authenticated transport at bootstrap. Every request
 * obtains current credentials from it; pages never persist tokens or turn
 * provider passwords into application identities.
 */
export const hostFetchKey: InjectionKey<typeof fetch> = Symbol('hostFetch')

export function useHostFetch(): typeof fetch {
  return inject(hostFetchKey, sessionFetch)
}
