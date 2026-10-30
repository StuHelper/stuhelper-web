// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { ApiError } from '../api/errors'
import { useAsync, usePaged } from './async'

describe('loading state', () => {
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
