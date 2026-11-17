import { readonly, ref } from 'vue'

/**
 * Unread notification count shared by the navigation bell, the home to-do list and the
 * message center. Undefined means not known, and no badge is shown then. One request is
 * in flight at a time and a known value is reused for a minute, so moving between pages
 * does not multiply requests. A failed read keeps the last known value.
 */
const count = ref<number>()
let loadedAt = 0
let pending: Promise<void> | undefined
const freshFor = 60_000

export const unreadCount = readonly(count)

export function refreshUnread(read: () => Promise<number>, force = false) {
  if (pending) return pending
  if (!force && count.value !== undefined && Date.now() - loadedAt < freshFor) return Promise.resolve()
  pending = read()
    .then((value) => { setUnread(value) }, () => { /* The message center reports its own failures; the bell only loses its badge. */ })
    .finally(() => { pending = undefined })
  return pending
}

/** Record a count the caller already knows, for example after marking everything read. */
export function setUnread(value: number | undefined) {
  count.value = value === undefined ? undefined : Math.max(0, value)
  loadedAt = value === undefined ? 0 : Date.now()
}
