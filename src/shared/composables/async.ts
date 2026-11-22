import { onScopeDispose, readonly, ref, shallowRef, type Ref } from 'vue'
import { ApiError, errorCode } from '../api/errors'
import { Mutation } from '../api/mutation'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Load one value. A new load cancels the previous one and clears the old value.
 * With keepData the old value stays during refresh and is cleared if the refresh fails.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, options: { keepData?: boolean } = {}) {
  const data = shallowRef<T>()
  const status = ref<LoadStatus>('idle')
  const error = ref('')
  let current: AbortController | undefined

  async function reload() {
    current?.abort()
    const controller = new AbortController()
    current = controller
    status.value = 'loading'
    error.value = ''
    if (!options.keepData) data.value = undefined
    try {
      const value = await loader(controller.signal)
      if (current !== controller) return
      data.value = value
      status.value = 'ready'
    } catch (failure) {
      if (current !== controller) return
      if (options.keepData) data.value = undefined
      error.value = errorCode(failure)
      status.value = 'error'
    }
  }

  function clear() {
    current?.abort()
    current = undefined
    data.value = undefined
    error.value = ''
    status.value = 'idle'
  }

  onScopeDispose(clear)
  return { data, status: readonly(status), error: readonly(error), reload, clear }
}

export interface PageResult<T> {
  items: T[]
  next: string
}

/**
 * Cursor pagination that appends pages. Reloading starts again from the first
 * page; a failed "load more" keeps the rows that were already shown.
 *
 * With `keepRows` a reload leaves the rows of the previous result on screen, marked
 * by `refreshing`, until the first page of the new result arrives, so changing a
 * filter does not flash an empty list. Any failure of that reload clears them, so
 * rows the server no longer confirms never stay.
 */
export function usePaged<T>(loader: (cursor: string, signal: AbortSignal) => Promise<PageResult<T>>, options: { resetOnConflict?: boolean; keepRows?: boolean } = {}) {
  const items = shallowRef<T[]>([])
  const next = ref('')
  const status = ref<LoadStatus>('idle')
  const error = ref('')
  const appending = ref(false)
  const refreshing = ref(false)
  let current: AbortController | undefined

  async function load(cursor: string): Promise<void> {
    current?.abort()
    const controller = new AbortController()
    current = controller
    status.value = 'loading'
    error.value = ''
    appending.value = cursor !== ''
    const kept = !cursor && !!options.keepRows && items.value.length > 0
    refreshing.value = kept
    if (!cursor) {
      if (!kept) items.value = []
      // The old cursor belongs to the old result and must not be followed any more.
      next.value = ''
    }
    try {
      const page = await loader(cursor, controller.signal)
      if (current !== controller) return
      items.value = cursor ? [...items.value, ...page.items] : page.items
      // A repeated cursor would loop forever; stop instead.
      next.value = page.next && page.next !== cursor ? page.next : ''
      status.value = 'ready'
    } catch (failure) {
      if (current !== controller) return
      // A version-bound cursor cannot be retried after the directory changes.
      // Reset once; a failure of the first page follows the normal error path.
      if (cursor && options.resetOnConflict && failure instanceof ApiError && failure.status === 409) {
        await load('')
        return
      }
      error.value = errorCode(failure)
      if (kept || (failure instanceof ApiError && failure.denied)) {
        items.value = []
        next.value = ''
      }
      status.value = 'error'
    } finally {
      if (current === controller) {
        appending.value = false
        refreshing.value = false
      }
    }
  }

  function clear() {
    current?.abort()
    current = undefined
    items.value = []
    next.value = ''
    error.value = ''
    status.value = 'idle'
    appending.value = false
    refreshing.value = false
  }

  onScopeDispose(clear)
  return {
    items,
    next: readonly(next),
    status: readonly(status),
    error: readonly(error),
    appending: readonly(appending),
    refreshing: readonly(refreshing),
    reload: () => load(''),
    loadMore: () => (next.value ? load(next.value) : Promise.resolve()),
    clear,
  }
}

export interface ActionState {
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string>>
  uncertain: Readonly<Ref<boolean>>
}

/**
 * Run user-initiated writes. Each instance owns one Mutation: after a lost
 * response only the original request can be retried, and the form stays locked.
 */
export function useMutation() {
  const mutation = new Mutation()
  const busy = ref(false)
  const error = ref('')
  const uncertain = ref(false)

  async function settle<R>(work: () => Promise<R>): Promise<R | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    try {
      return await work()
    } catch (failure) {
      error.value = errorCode(failure)
      return undefined
    } finally {
      busy.value = false
      uncertain.value = mutation.uncertain
    }
  }

  return {
    busy: readonly(busy),
    error: readonly(error),
    uncertain: readonly(uncertain),
    /** Resolves to the result, or undefined when the write failed (see `error`). */
    run: <B, R>(signature: string, body: B, send: (body: B, key: string) => Promise<R>) => settle(() => mutation.run(signature, body, send)),
    retry: () => {
      if (error.value === 'write_response_unrecognized') {
        window.location.reload()
        return Promise.resolve(undefined)
      }
      return settle(() => mutation.retry())
    },
    dismiss: () => {
      if (!mutation.uncertain) error.value = ''
    },
  }
}

/** Track a non-idempotent read-only task such as a download. */
export function useTask() {
  const busy = ref(false)
  const error = ref('')
  async function run<R>(work: () => Promise<R>): Promise<R | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    try {
      return await work()
    } catch (failure) {
      error.value = errorCode(failure)
      return undefined
    } finally {
      busy.value = false
    }
  }
  return { busy: readonly(busy), error: readonly(error), run }
}
