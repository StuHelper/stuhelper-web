import { inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import contract from '../../contracts/session.openapi.json'
import type { components, operations } from '../api/session.gen'
import { ApiError } from './api/errors'
import { Http } from './api/http'
import { extras } from './extras'
import { forgetReturnFilters, keepFiltersForReturn } from './pageFilters'
import { toasts } from './ui/toast'
import { setUnread } from '../features/notifications/unread'
import { resetFavorites } from '../features/favorites/state'
import { clearCompare } from '../features/search/compare'
import { forgetTrails } from '../features/resources/browseState'
import { forgetPages } from './recent'
import { schemaOf } from './api/schema'
import { useHostFetch } from './api/transport'

// Sign-in providers the login endpoint accepts besides the regular page (session contract 0.5.0).
type LoginProvider = NonNullable<NonNullable<operations['startLogin']['parameters']['query']>['provider']>

export type Session = components['schemas']['Session']
export type Profile = components['schemas']['Profile']
export type ProfileUpdate = components['schemas']['ProfileUpdate']
export type SessionState = 'loading' | 'guest' | 'member' | 'error'

const schemas = contract.components.schemas
const parseSession = schemaOf<Session>(schemas, 'Session')
export const parseProfile = schemaOf<Profile>(schemas, 'Profile')

/**
 * The signed-in application session. Business pages read login state from here
 * for presentation only; every permission is still decided by the server.
 */
export function createSessionStore(fetcher: typeof fetch) {
  const state = ref<SessionState>('loading')
  const unavailable = ref(false)
  const session = shallowRef<Session | null>(null)
  const http = new Http(fetcher)
  let pending: Promise<void> | undefined;
  let retryAt = 0;
  let failures = 0;
  let generation = 0

  async function load() {
    const current = generation
    const wait = retryAt - Date.now();
    if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
    if (current !== generation) return
    try {
      const value = await http.json('/api/v1/auth/session', parseSession, { timeout: 10_000 })
      if (current !== generation) return
      if (!value.authenticated) throw new ApiError('incompatible')
      if (session.value && session.value.profile.id !== value.profile.id) clearAccountData()
      session.value = value
      state.value = 'member';
      unavailable.value = false;
      failures = 0;
      retryAt = 0;
    } catch (error) {
      if (current !== generation) return
      if (error instanceof ApiError && error.denied) {
        invalidate()
      } else {
        // Keep mounted forms and their valid input during a temporary outage.
        // Every business action is still authorized independently by the server.
        unavailable.value = true;
        state.value = session.value ? 'member' : 'error';
        if (error instanceof ApiError && (error.status === 503 || error.code === 'network' || error.code === 'timeout')) {
          failures = Math.min(failures + 1, 4);
          retryAt = Date.now() + Math.min(1000 * 2 ** (failures - 1), 8000);
        }
      }
    }
  }

  function reload() {
    if (pending) return pending
    const request = load().finally(() => {
      if (pending === request) pending = undefined
    })
    pending = request
    return request
  }

  /** A business API rejected the account; confirm whether the session ended. */
  function revalidate(serviceUnavailable = false) {
    if (state.value === 'member' && (!serviceUnavailable || !unavailable.value)) void reload()
  }

  function clearAccountData() {
    toasts.value = []
    resetFavorites()
    setUnread(undefined)
    forgetReturnFilters()
    clearCompare('course')
    clearCompare('teacher')
    forgetPages()
    forgetTrails()
  }

  function invalidate() {
    generation++
    pending = undefined
    session.value = null
    state.value = 'guest'
    unavailable.value = false
    failures = 0
    retryAt = 0
    clearAccountData()
  }
  function startSignIn(provider?: LoginProvider) {
    if (extras.signIn) return extras.signIn()
    const target = window.location.href.split('#')[0] ?? window.location.origin
    keepFiltersForReturn()
    // The server maps the allowed provider to the identity provider's direct sign-in page and keeps
    // its own state, nonce and PKCE checks; an older server ignores the parameter.
    window.location.assign(`/api/v1/auth/login?return_to=${encodeURIComponent(target)}${provider ? `&provider=${provider}` : ''}`)
  }
  // Both are used directly as click handlers, so neither takes the event as an argument.
  const signIn = () => startSignIn()
  const signInWithQq = () => startSignIn('qq')

  /** End this application's session on this device or on all devices. */
  async function signOut(all: boolean) {
    let upstreamEnded = false
    try {
      upstreamEnded = await http.json(`/api/v1/auth/${all ? 'logout-all' : 'logout'}`, (body) => {
        if (!body || typeof body !== 'object' || !('signed_out' in body) || body.signed_out !== true) throw new ApiError('incompatible')
        return 'upstream_ended' in body && body.upstream_ended === true
      }, { method: 'POST', timeout: 10_000 })
    } catch (error) {
      if (!(error instanceof ApiError) || !error.denied) throw error
      if (error.status !== 401) {
        invalidate()
        throw error
      }
    }
    invalidate()
    rememberSignOut(all ? 'all' : 'device', upstreamEnded)
    window.location.assign('/')
  }

  async function currentProfile(signal?: AbortSignal) {
    return http.json('/api/v1/profiles/me', parseProfile, { signal })
  }

  async function saveProfile(profile: ProfileUpdate, key: string) {
    const saved = await http.json('/api/v1/profiles/me', parseProfile, { method: 'PUT', body: profile, key, timeout: 10_000 })
    if (session.value) session.value = { ...session.value, profile: saved }
    return saved
  }

  return { unavailable: readonly(unavailable), state: readonly(state), session: readonly(session), reload, revalidate, invalidate, signIn, signInWithQq, signOut, currentProfile, saveProfile }
}

export type SessionStore = ReturnType<typeof createSessionStore>
export const sessionKey: InjectionKey<SessionStore> = Symbol('session')
/** Runs after a business API refuses the account, so a lost qualification closes content pages. */
export const deniedKey: InjectionKey<() => void> = Symbol('denied')

export function useSession(): SessionStore {
  const store = inject(sessionKey)
  if (!store) throw new Error('Session store is not installed')
  return store
}

/** An HTTP client on the host transport that re-checks the session after a denial. */
export function useHttp() {
  const fetcher = useHostFetch()
  const session = inject(sessionKey, undefined)
  const recheck = inject(deniedKey, undefined)
  return new Http(fetcher, { onUnavailable: () => session?.revalidate(true), onDenied: (status) => {
    if(status===401) session?.invalidate(); else session?.revalidate()
    recheck?.()
  } })
}

/** What the last sign-out ended, shown once on the page the browser lands on afterwards. */
export interface SignOutNotice { scope: 'device' | 'all'; upstreamEnded: boolean }
const signOutKey = 'stuhelper.signedOut'
function rememberSignOut(scope: SignOutNotice['scope'], upstreamEnded: boolean) {
  try { sessionStorage.setItem(signOutKey, JSON.stringify({ scope, upstreamEnded })) } catch { /* Storage is optional. */ }
}
/** Reads and forgets the notice, so it appears only once. Anything unexpected is ignored. */
export function takeSignOutNotice(): SignOutNotice | undefined {
  try {
    const raw = sessionStorage.getItem(signOutKey)
    sessionStorage.removeItem(signOutKey)
    const value: unknown = raw ? JSON.parse(raw) : undefined
    if (!value || typeof value !== 'object') return undefined
    const scope = 'scope' in value ? value.scope : undefined
    const upstreamEnded = 'upstreamEnded' in value ? value.upstreamEnded : undefined
    if ((scope !== 'device' && scope !== 'all') || typeof upstreamEnded !== 'boolean') return undefined
    return { scope, upstreamEnded }
  } catch { return undefined }
}
