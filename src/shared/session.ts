import { inject, readonly, ref, shallowRef, type InjectionKey } from 'vue'
import contract from '../../contracts/session.openapi.json'
import type { components } from '../api/session.gen'
import { ApiError } from './api/errors'
import { Http } from './api/http'
import { extras } from './extras'
import { forgetPages } from './recent'
import { schemaOf } from './api/schema'
import { useHostFetch } from './api/transport'

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
 let generation=0;

  async function load() {
 const current=generation;
    const wait = retryAt - Date.now();
    if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
    try {
      const value = await http.json('/api/v1/auth/session', parseSession, { timeout: 10_000 })
      if(current!==generation)return;
      if (!value.authenticated) throw new ApiError('incompatible')
      session.value = value
      state.value = 'member';
      unavailable.value = false;
      failures = 0;
      retryAt = 0;
    } catch (error) {
 if(current!==generation)return;
      if (error instanceof ApiError && error.denied) {
        session.value = null;
        state.value = 'guest';
        unavailable.value = false;
        failures = 0;
        retryAt = 0;
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
    pending ??= load().finally(() => {
      pending = undefined
    })
    return pending
  }

  /** A business API rejected the account; confirm whether the session ended. */
  function revalidate(serviceUnavailable = false) {
    if (state.value === 'member' && (!serviceUnavailable || !unavailable.value)) void reload()
  }

  function invalidate(){generation++;session.value=null;state.value='guest';unavailable.value=false;failures=0;retryAt=0;}
  function signIn() {
    if (extras.signIn) return extras.signIn()
    const target = window.location.href.split('#')[0] ?? window.location.origin
    window.location.assign(`/api/v1/auth/login?return_to=${encodeURIComponent(target)}`)
  }

  /** End this application's session on this device or on all devices. */
  async function signOut(all: boolean) {
    await http.send(`/api/v1/auth/${all ? 'logout-all' : 'logout'}`, { method: 'POST', timeout: 10_000 })
    forgetPages()
    session.value = null
    state.value = 'guest'
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

  return { unavailable: readonly(unavailable), state: readonly(state), session: readonly(session), reload, revalidate, invalidate, signIn, signOut, currentProfile, saveProfile }
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
