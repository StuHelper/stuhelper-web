import { reactive, shallowRef } from 'vue'
import { errorCode } from '../../shared/api/errors'
import type { FavoritesApi, Favorite, FavoriteKind } from './api'

/** Known favorite of a target: the record, null when not saved, undefined while unknown. */
type Entry = Favorite | null | undefined

// A toast may outlive the button that saved this item.
export const moveTarget = shallowRef<{ item: Favorite; profileId: string }>()

const known = reactive(new Map<string, Entry>())
const failed = reactive(new Set<string>())
const pending = new Map<FavoriteKind, Set<string>>()
let scheduled = false
let generation = 0

const keyOf = (kind: FavoriteKind, target: string) => `${kind}:${target}`

export function favoriteGeneration() { return generation }

export function favoriteOf(kind: FavoriteKind, target: string): Entry {
  return known.get(keyOf(kind, target))
}

export function favoriteFailed(kind: FavoriteKind, target: string) {
  return failed.has(keyOf(kind, target))
}

export function rememberFavorite(kind: FavoriteKind, target: string, value: Favorite | null) {
  known.set(keyOf(kind, target), value)
  failed.delete(keyOf(kind, target))
}

/**
 * Queue a state lookup. Buttons rendered in the same tick share one request per kind,
 * so a list of 30 courses costs one call instead of 30.
 */
export function requestFavorite(api: FavoritesApi, kind: FavoriteKind, target: string, refresh = false) {
  const key = keyOf(kind, target)
  if (!refresh && (known.has(key) || failed.has(key))) return
  failed.delete(key)
  const set = pending.get(kind) ?? new Set<string>()
  set.add(target)
  pending.set(kind, set)
  if (scheduled) return
  scheduled = true
  const current = generation
  queueMicrotask(() => {
    if (current !== generation) return
    scheduled = false
    const batches = [...pending]
    pending.clear()
    for (const [batchKind, targets] of batches) void load(api, batchKind, [...targets])
  })
}

async function load(api: FavoritesApi, kind: FavoriteKind, targets: string[]) {
  const current = generation
  try {
    const found = await api.lookup(kind, targets)
    if (current !== generation) return
    for (const target of targets) rememberFavorite(kind, target, found.get(target) ?? null)
  } catch (failure) {
    if (current !== generation) return
    // Signed-out viewers have no favorites; any other failure leaves the state unknown.
    const signedOut = errorCode(failure) === 'unauthenticated'
    for (const target of targets) {
      if (signedOut) rememberFavorite(kind, target, null)
      else failed.add(keyOf(kind, target))
    }
  }
}

/** Forget every known state, for example after signing out. */
export function resetFavorites() {
  moveTarget.value = undefined
  generation++
  scheduled = false
  pending.clear()
  known.clear()
  failed.clear()
}
