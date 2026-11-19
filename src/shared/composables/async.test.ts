// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { ApiError } from '../api/errors'
import { useAsync, usePaged } from './async'

describe('loading state', () => {
  it('restarts a versioned directory after a stale cursor without appending old rows', async () => {
    const scope = effectScope()
    const cursors: string[] = []
    const paged = scope.run(() => usePaged(async (cursor) => {
      cursors.push(cursor)
      if (cursor) throw new ApiError('conflict', false, 409)
      return cursors.length === 1 ? { items: ['old'], next: 'stale' } : { items: ['new'], next: '' }
    }, { resetOnConflict: true }))!
    await paged.reload()
    await paged.loadMore()
    expect(cursors).toEqual(['', 'stale', ''])
    expect(paged.items.value).toEqual(['new'])
    expect(paged.status.value).toBe('ready')
    expect(paged.next.value).toBe('')
    scope.stop()
  })

  it('does not loop when the first page also rejects a reset', async () => {
    const scope = effectScope()
    let reads = 0
    const paged = scope.run(() => usePaged(async () => {
      if (++reads > 1) throw new ApiError('conflict', false, 409)
      return { items: ['old'], next: 'stale' }
    }, { resetOnConflict: true }))!
    await paged.reload()
    await paged.loadMore()
    expect(reads).toBe(3)
    expect(paged.items.value).toEqual([])
    expect(paged.status.value).toBe('error')
    scope.stop()
  })
  it('appends pages and keeps shown rows when the next page fails', async () => {
    const scope = effectScope()
    let fail = false
    const paged = scope.run(() => usePaged(async (cursor) => {
      if (fail) throw new ApiError('network')
      return cursor ? { items: [3], next: '' } : { items: [1, 2], next: 'c2' }
    }))
    if (!paged) throw new Error('scope')
    await paged.reload()
    expect(paged.items.value).toEqual([1, 2])
    fail = true
    await paged.loadMore()
    expect(paged.items.value).toEqual([1, 2])
    expect(paged.error.value).toBe('network')
    fail = false
    await paged.loadMore()
    expect(paged.items.value).toEqual([1, 2, 3])
    expect(paged.next.value).toBe('')
    scope.stop()
  })

  it('clears private rows and their cursor on HTTP denial regardless of the business code', async () => {
    const responses = [[401, 'billing_unauthenticated'], [403, 'billing_forbidden'], [403, 'school_restricted']] as const
    for (const [status, code] of responses) {
      const scope = effectScope()
      const paged = scope.run(() => usePaged(async (cursor) => {
        if (cursor) throw new ApiError(code, false, status)
        return { items: ['private order'], next: 'more' }
      }))!
      await paged.reload()
      expect(paged.items.value).toEqual(['private order'])
      await paged.loadMore()
      expect(paged.items.value).toEqual([])
      expect(paged.next.value).toBe('')
      expect(paged.error.value).toBe(code)
      scope.stop()
    }
  })

  it('clears private rows when access is revoked', async () => {
    const scope = effectScope()
    let denied = false
    const paged = scope.run(() => usePaged(async () => {
      if (denied) throw new ApiError('forbidden')
      return { items: ['private'], next: 'more' }
    }))
    if (!paged) throw new Error('scope')
    await paged.reload()
    denied = true
    await paged.loadMore()
    expect(paged.items.value).toEqual([])
    scope.stop()
  })

  it('keeps the previous rows while a reload is in flight and clears them when it fails', async () => {
    const scope = effectScope()
    const pending: { resolve: (value: { items: string[]; next: string }) => void; reject: (failure: unknown) => void }[] = []
    const paged = scope.run(() => usePaged<string>(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), { keepRows: true }))!
    const first = paged.reload()
    // Nothing was shown yet, so the first load is an ordinary empty loading state.
    expect(paged.refreshing.value).toBe(false)
    pending[0]?.resolve({ items: ['old'], next: 'old-cursor' })
    await first
    const second = paged.reload()
    expect(paged.items.value).toEqual(['old'])
    expect(paged.refreshing.value).toBe(true)
    // The cursor of the previous result must not be offered during the reload.
    expect(paged.next.value).toBe('')
    pending[1]?.resolve({ items: ['new'], next: '' })
    await second
    expect(paged.items.value).toEqual(['new'])
    expect(paged.refreshing.value).toBe(false)
    const third = paged.reload()
    expect(paged.items.value).toEqual(['new'])
    pending[2]?.reject(new ApiError('network'))
    await third
    expect(paged.items.value).toEqual([])
    expect(paged.status.value).toBe('error')
    expect(paged.refreshing.value).toBe(false)
    scope.stop()
  })

  it('ignores a stale response after a newer load', async () => {
    const scope = effectScope()
    const resolvers: ((value: string) => void)[] = []
    const value = scope.run(() => useAsync(() => new Promise<string>((resolve) => resolvers.push(resolve))))
    if (!value) throw new Error('scope')
    const first = value.reload()
    const second = value.reload()
    resolvers[1]?.('new')
    await second
    resolvers[0]?.('old')
    await first
    expect(value.data.value).toBe('new')
    scope.stop()
  })
})

it('preserves order rows when a business conflict leaves the account authorized', async () => {
  const scope = effectScope()
  try {
    const paged = scope.run(() => usePaged(async cursor => {
      if (cursor) throw new ApiError('billing_conflict', false, 409)
      return { items: ['existing order'], next: 'more' }
    }))!
    await paged.reload()
    await paged.loadMore()
    expect(paged.error.value).toBe('billing_conflict')
    expect(paged.items.value).toEqual(['existing order'])
    expect(paged.next.value).toBe('more')
  } finally { scope.stop() }
})
