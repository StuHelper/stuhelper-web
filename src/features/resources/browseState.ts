import type { Directory, Value } from './api'

/** Read configured filter values from the address; anything malformed is ignored. */
export function parseAttributes(raw: string): Record<string, Value> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'object' && item !== null && !Array.isArray(item))) as Record<string, Value>
  } catch {
    return {}
  }
}

const key = (id: string) => `stuhelper.folder.${id}`

/** Folder names for the path display. A folder link opened elsewhere shows a generic path. */
export function rememberTrail(id: string, trail: Directory[]) {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(trail))
  } catch {
    // Storage is optional.
  }
}

export function readTrail(id: string): Directory[] {
  if (!id) return []
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(id)) ?? 'null')
    // Written by rememberTrail in this tab.
    if (Array.isArray(value) && value.length) return value as Directory[]
  } catch {
    // Fall through to the generic path.
  }
  return [{ id, names: {} } as Directory]
}
