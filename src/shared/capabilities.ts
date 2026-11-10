import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getCapabilities } from '../features/platform/api'
import { errorCode } from './api/errors'
import { useHttp } from './session'

/**
 * Capabilities of the modules this deployment runs. A module that is not
 * enabled hides its entries and pages; the server still rejects its requests.
 * The list is read once per page load and does not depend on the account.
 */
const names = ref<ReadonlySet<string>>(new Set())
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const failure = ref('')
let pending: Promise<void> | undefined

export function useCapabilities() {
  const http = useHttp()
  function load() {
    pending ??= (async () => {
      status.value = 'loading'
      try {
        names.value = new Set((await getCapabilities(http)).capabilities)
        status.value = 'ready'
      } catch (error) {
        failure.value = errorCode(error)
        status.value = 'error'
      } finally {
        pending = undefined
      }
    })()
    return pending
  }
  if (status.value === 'idle') void load()
  /**
   * Whether every named capability is available. Entries stay hidden until the
   * list is known; when it cannot be read, entries show and the server decides.
   */
  const has = (...required: string[]) => status.value === 'error' || (status.value === 'ready' && required.every((name) => names.value.has(name)))
  return { status: computed(() => status.value), failure: computed(() => failure.value), has, load }
}

/** Capability each optional feature needs, named after the backend module descriptors. */
export const feature = {
  favorites: 'favorites.manage',
  groups: 'groups.read',
  membership: 'billing.membership',
  notifications: 'notifications.inbox',
  openPlatform: 'open-platform.data',
  qq: 'qq-binding.manage',
  search: 'search.query',
  unlock: 'billing.resource-unlock',
  wallet: 'billing.wallet',
} as const

/** Whether a link's target page belongs to a module this deployment runs. */
export function useLinkAvailable() {
  const capabilities = useCapabilities()
  const router = useRouter()
  return (to: string) => {
    const required = router.resolve(to).meta.capability
    return !required || capabilities.has(required)
  }
}
