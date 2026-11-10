// Recently opened pages, kept on this device only as a convenience. Reading and
// writing can fail in private windows, which simply leaves the list empty.
const storageKey = 'stuhelper.recent'
const limit = 6

export interface RecentPage { path: string; title: string; kind: 'course' | 'teacher' | 'resource' }

export function recentPages(): RecentPage[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((row): row is RecentPage => typeof row?.path === 'string' && typeof row?.title === 'string' && ['course', 'teacher', 'resource'].includes(row?.kind))
  } catch {
    return []
  }
}

export function rememberPage(page: RecentPage) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([page, ...recentPages().filter((row) => row.path !== page.path)].slice(0, limit)))
  } catch {
    // Storage is optional.
  }
}

export function forgetPages() {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Storage is optional.
  }
}
