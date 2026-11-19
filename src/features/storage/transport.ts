import { inject } from 'vue'
import { ApiError } from '../../shared/api/errors'
import { readLimited } from '../../shared/api/http'
import { useHostFetch } from '../../shared/api/transport'
import { deniedKey, sessionKey } from '../../shared/session'

const storageJsonLimit = 4 * 1024 * 1024

export interface StorageFetchHooks {
  onUnavailable?: () => void
  onDenied?: (status: number) => void
}

/**
 * Adapt the host transport for the provider-maintained storage SDKs so they share
 * `Http`'s redirect rejection, bounded response reading and session lifecycle hooks
 * while keeping the verified SDK snapshots unmodified.
 */
export function createStorageFetch(fetcher: typeof fetch, hooks: StorageFetchHooks = {}): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!url.startsWith('/api/')) throw new TypeError('invalid_storage_path')
    const response = await fetcher(input, { ...init, credentials: 'same-origin', redirect: 'error' })
    if (response.status === 503) hooks.onUnavailable?.()
    if (response.status === 401 || response.status === 403) hooks.onDenied?.(response.status)
    try {
      const bytes = await readLimited(response, storageJsonLimit, init?.signal ?? undefined)
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'capacity_exceeded') {
        return new Response('', { status: response.status, statusText: response.statusText, headers: response.headers })
      }
      throw failure
    }
  }
}

export function useStorageFetch(): typeof fetch {
  const fetcher = useHostFetch()
  const session = inject(sessionKey, undefined)
  const recheck = inject(deniedKey, undefined)
  return createStorageFetch(fetcher, {
    onUnavailable: () => session?.revalidate(true),
    onDenied: (status) => {
      if (status === 401) session?.invalidate()
      else session?.revalidate()
      recheck?.()
    },
  })
}
