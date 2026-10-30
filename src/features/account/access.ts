import { computed, inject, readonly, ref, shallowRef, watch, type ComputedRef, type InjectionKey } from 'vue'
import { ApiError } from '../../shared/api/errors'
import { Http } from '../../shared/api/http'
import type { SessionStore } from '../../shared/session'
import { AcademicApi, type CatalogObject } from '../academic/api'
import { VerificationApi, type Application, type Credential, type Summary } from '../verification/api'

/** Whether the current account may enter content pages. Specific actions keep their own rules. */
export type AccessState = 'loading' | 'guest' | 'unverified' | 'processing' | 'verified' | 'expired' | 'unavailable'

const open = new Set<Application['state']>(['in_progress', 'pending_review', 'supplement_required'])

export function deriveAccess(summary: Summary, applications: Application[], credentials: Credential[]): AccessState {
  if (summary.campus_eligibility) return 'verified'
  if (applications.some((row) => open.has(row.state))) return 'processing'
  if (credentials.some((row) => row.state === 'expired' || row.state === 'revoked')) return 'expired'
  return 'unverified'
}

/**
 * The platform serves one university. Its id comes from the catalog so that no
 * environment-specific value is compiled in; a deployment holding several school
 * records must name the served one with VITE_STUHELPER_SCHOOL_ID.
 */
export function chooseCampus(schools: CatalogObject[], configured: string | undefined) {
  const chosen = configured ? schools.find((row) => row.id === configured) : schools.length === 1 ? schools[0] : undefined
  if (!chosen) throw new ApiError('incompatible')
  return chosen
}

/** Accept only a path inside this site, so a crafted link cannot redirect elsewhere. */
export function safeNext(value: unknown) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : ''
}

export function createAccessStore(fetcher: typeof fetch, session: SessionStore) {
  const http = new Http(fetcher)
  const verification = new VerificationApi(http)
  const academic = new AcademicApi(http)
  const result = ref<AccessState>('loading')
  const campus = shallowRef<CatalogObject>()
  let generation = 0

  async function evaluate(signalLoading: boolean) {
    const current = ++generation
    // A background recheck must not unmount the page the user is working in.
    if (signalLoading) result.value = 'loading'
    try {
      const summary = await verification.get('Summary', '/api/v1/verification/summary')
      let next: AccessState = 'verified'
      if (!summary.campus_eligibility) {
        const [applications, credentials] = await Promise.all([
          verification.list('Application', '/api/v1/verification/applications', {}),
          verification.list('Credential', '/api/v1/verification/credentials', {}),
        ])
        next = deriveAccess(summary, applications.items, credentials.items)
      }
      if (next === 'verified' && !campus.value) campus.value = chooseCampus(await academic.options({ kind: 'school' }), import.meta.env.VITE_STUHELPER_SCHOOL_ID)
      if (current === generation) result.value = next
    } catch (failure) {
      if (current !== generation) return
      if (failure instanceof ApiError && failure.code === 'unauthenticated') session.revalidate()
      result.value = 'unavailable'
    }
  }

  const state: ComputedRef<AccessState> = computed(() => {
    if (session.state.value === 'loading') return 'loading'
    if (session.state.value === 'guest') return 'guest'
    if (session.state.value === 'error') return 'unavailable'
    return result.value
  })

  watch(() => session.state.value, (value) => {
    if (value === 'member') void evaluate(true)
    else {
      generation++
      result.value = 'loading'
      campus.value = undefined
    }
  }, { immediate: true })

  async function retry() {
    if (session.state.value !== 'member') await session.reload()
    if (session.state.value === 'member') await evaluate(true)
  }

  return { state, campus: readonly(campus), retry, refresh: () => evaluate(false) }
}

export type AccessStore = ReturnType<typeof createAccessStore>
export const accessKey: InjectionKey<AccessStore> = Symbol('access')

export function useAccess(): AccessStore {
  const store = inject(accessKey)
  if (!store) throw new Error('Access store is not installed')
  return store
}

/** The served university. Pages behind the content gate may rely on it being known. */
export function useCampusId() {
  const access = useAccess()
  return computed(() => access.campus.value?.id ?? '')
}
