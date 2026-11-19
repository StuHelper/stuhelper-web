import { computed, ref } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'

// Search text and list filters stay out of the address bar. They are kept in
// the state of the current browser history entry instead, so the address shows
// only the page (/courses) while reload, back and forward still restore the list.
// Vue Router merges history.state on its own writes, so this key survives them.
const KEY = 'filters'
const maxLength = 2000

export type PageFilters = Record<string, string>

function clean(input: Record<string, string | undefined>, keys: readonly string[]): PageFilters {
  const result: PageFilters = {}
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value && value.length <= maxLength) result[key] = value
  }
  return result
}

// history.state is written by this module, Vue Router and possibly other tabs'
// older builds, so every value is checked before use.
function stored(keys: readonly string[]): PageFilters {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null) return {}
  const raw: unknown = (state as Record<string, unknown>)[KEY]
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return clean(raw as Record<string, string | undefined>, keys)
}

function writeState(filters: PageFilters) {
  const state: unknown = window.history.state
  window.history.replaceState({ ...(typeof state === 'object' && state !== null ? state : {}), [KEY]: filters }, '')
}

// Sign-in leaves the site and comes back as a new history entry, which has no
// state. The filters of the page being left are parked in sessionStorage and
// picked up once by the same page path on return.
const returnKey = 'stuhelper.returnFilters'

export function forgetReturnFilters() {
  try {
    sessionStorage.removeItem(returnKey)
  } catch { /* Storage is optional. */ }
}

export function keepFiltersForReturn() {
  const state: unknown = window.history.state
  const raw = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[KEY] : undefined
  try {
    if (typeof raw === 'object' && raw !== null && Object.keys(raw).length) sessionStorage.setItem(returnKey, JSON.stringify({ path: window.location.pathname, filters: raw }))
    else sessionStorage.removeItem(returnKey)
  } catch {
    // Storage is optional; the page then opens unfiltered after sign-in.
  }
}

function takeReturnFilters(path: string, keys: readonly string[]): PageFilters {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(returnKey) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return {}
    const entry = parsed as { path?: unknown; filters?: unknown }
    if (entry.path !== path || typeof entry.filters !== 'object' || entry.filters === null) return {}
    sessionStorage.removeItem(returnKey)
    return clean(entry.filters as Record<string, string | undefined>, keys)
  } catch {
    return {}
  }
}

/** A link that opens a list page with filters applied, without putting them in the address. */
export function withFilters(path: string, filters: Record<string, string | undefined>): RouteLocationRaw {
  return { path, state: { [KEY]: clean(filters, Object.keys(filters)) }, force: true }
}

/**
 * Filters of the current list page. `replace` changes the current history entry;
 * `push` adds an entry, so back returns to the previous filters (used for folders).
 */
export function usePageFilters<K extends string>(keys: readonly K[]) {
  const router = useRouter()
  const path = router.currentRoute.value.path
  const version = ref(0)

  // Older links carried filters in ?query or #fragment. Move them into the page
  // state once and drop them from the address.
  const route = router.currentRoute.value
  const fragment = route.hash.includes('=') ? new URLSearchParams(route.hash.slice(1)) : new URLSearchParams()
  const legacy: Record<string, string> = {}
  const query = { ...route.query }
  for (const key of keys) {
    const value = query[key]
    if (typeof value === 'string') legacy[key] = value
    delete query[key]
    const hashed = fragment.get(key)
    if (hashed !== null) legacy[key] = hashed
  }
  const returned = Object.keys(stored(keys)).length ? {} : takeReturnFilters(path, keys)
  if (Object.keys(returned).length) writeState(returned)
  if (Object.keys(legacy).length || fragment.size) {
    // Write the state first so the first read already sees the migrated values.
    const merged = clean({ ...stored(keys), ...legacy }, keys)
    writeState(merged)
    void router.replace({ path, query, hash: fragment.size ? '' : route.hash, state: { [KEY]: merged } })
  }

  let last = {} as Record<K, string>
  const values = computed<Record<K, string>>(() => {
    // Re-read on every navigation and local write. While the router is already
    // leaving for another page, keep the last values so the list does not reload.
    void version.value
    if (router.currentRoute.value.path === path) last = { ...Object.fromEntries(keys.map((key) => [key, ''])), ...stored(keys) } as Record<K, string>
    return last
  })
  const signature = computed(() => JSON.stringify(values.value))

  function replace(changes: Partial<Record<K, string | undefined>>) {
    // history.state belongs to the current entry; after leaving the page it is another page's.
    if (router.currentRoute.value.path !== path) return
    writeState(clean({ ...values.value, ...changes }, keys))
    version.value++
  }
  function push(changes: Partial<Record<K, string | undefined>>) {
    void router.push(withFilters(path, clean({ ...values.value, ...changes }, keys)))
  }
  return { values, signature, replace, push }
}
