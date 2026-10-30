import { onScopeDispose, readonly, ref, shallowRef, type Ref } from 'vue'
import { ApiError, errorCode } from '../api/errors'
import { Mutation } from '../api/mutation'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Load one value. A new load cancels the previous one, and both a new load and
 * a failure clear the old value so revoked data never stays on screen.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>) {
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
    data.value = undefined
    try {
      const value = await loader(controller.signal)
      if (current !== controller) return
      data.value = value
      status.value = 'ready'
    } catch (failure) {
      if (current !== controller) return
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
 */
export function usePaged<T>(loader: (cursor: string, signal: AbortSignal) => Promise<PageResult<T>>) {
  const items = shallowRef<T[]>([])
  const next = ref('')
  const status = ref<LoadStatus>('idle')
  const error = ref('')
  const appending = ref(false)
  let current: AbortController | undefined

  async function load(cursor: string) {
    current?.abort()
    const controller = new AbortController()
    current = controller
    status.value = 'loading'
    error.value = ''
    appending.value = cursor !== ''
    if (!cursor) {
      items.value = []
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
      error.value = errorCode(failure)
      if (failure instanceof ApiError && failure.denied) {
        items.value = []
        next.value = ''
      }
      status.value = 'error'
    } finally {
      if (current === controller) appending.value = false
    }
  }

  function clear() {
    current?.abort()
    current = undefined
    items.value = []
    next.value = ''
    error.value = ''
    status.value = 'idle'
  }

  onScopeDispose(clear)
  return {
    items,
    next: readonly(next),
    status: readonly(status),
    error: readonly(error),
    appending: readonly(appending),
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
    retry: () => settle(() => mutation.retry()),
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
