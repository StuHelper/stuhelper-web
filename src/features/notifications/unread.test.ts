import { afterEach, expect, it, vi } from 'vitest'
import { refreshUnread, setUnread, unreadCount } from './unread'

afterEach(() => {
  setUnread(undefined)
  vi.useRealTimers()
})

it('shares one request, reuses a fresh count and reads again when forced or stale', async () => {
  vi.useFakeTimers()
  let calls = 0
  const read = () => Promise.resolve(++calls)
  await Promise.all([refreshUnread(read), refreshUnread(read)])
  expect(calls).toBe(1)
  expect(unreadCount.value).toBe(1)
  await refreshUnread(read)
  expect(calls).toBe(1)
  await refreshUnread(read, true)
  expect(unreadCount.value).toBe(2)
  vi.advanceTimersByTime(61_000)
  await refreshUnread(read)
  expect(unreadCount.value).toBe(3)
})

it('keeps the last known count when a read fails and never goes below zero', async () => {
  setUnread(4)
  await refreshUnread(() => Promise.reject(new Error('offline')), true)
  expect(unreadCount.value).toBe(4)
  setUnread(-2)
  expect(unreadCount.value).toBe(0)
  setUnread(undefined)
  expect(unreadCount.value).toBeUndefined()
})
