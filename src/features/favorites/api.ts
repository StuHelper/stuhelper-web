import favoritesContract from '../../../contracts/favorites.openapi.json'
import type { components } from '../../api/favorites.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type Folder = Schemas['Folder']
export type Favorite = Schemas['Item']
export type FavoriteKind = Favorite['kind']
export type FavoriteSort = 'newest' | 'name'

const schemas = favoritesContract.components.schemas
const parse = {
  folder: schemaOf<Folder>(schemas, 'Folder'),
  folders: schemaOf<Schemas['Folders']>(schemas, 'Folders'),
  item: schemaOf<Favorite>(schemas, 'Item'),
  items: schemaOf<Schemas['Items']>(schemas, 'Items'),
  removed: schemaOf<Schemas['Removed']>(schemas, 'Removed'),
}

/** Server limit for one page and for one target lookup. */
export const favoritePageSize = 100

export interface FavoriteQuery {
  kind?: FavoriteKind
  folder_id?: string
  q?: string
  sort?: FavoriteSort
  after?: string
  limit?: number
}

/**
 * The caller's own favorites and folders. Reading and managing them needs only a session;
 * adding a new favorite also needs current content admission, which the server checks.
 */
export class FavoritesApi {
  constructor(private readonly http: Http) {}

  folders(after: string, signal?: AbortSignal) {
    return this.http.json('/api/v1/favorites/folders', parse.folders, { query: { after, limit: favoritePageSize }, signal })
  }

  /** Every folder. An owner has few folders; the bound stops a server that never ends paging. */
  async allFolders(signal?: AbortSignal) {
    const rows: Folder[] = []
    let after = ''
    for (let page = 0; page < 20; page++) {
      const result = await this.folders(after, signal)
      rows.push(...result.items)
      if (!result.next || result.next === after) return rows
      after = result.next
    }
    return rows
  }

  items(query: FavoriteQuery, signal?: AbortSignal) {
    return this.http.json('/api/v1/favorites/items', parse.items, { query: { limit: 30, ...query }, signal })
  }

  /** The caller's favorites among up to 100 targets of one kind, keyed by target id. */
  async lookup(kind: FavoriteKind, targets: string[], signal?: AbortSignal) {
    const found = new Map<string, Favorite>()
    const unique = [...new Set(targets.filter(Boolean))]
    for (let start = 0; start < unique.length; start += favoritePageSize) {
      const ids = unique.slice(start, start + favoritePageSize)
      let after = ''
      // One target has at most one favorite, so a page of 100 covers the batch; follow the cursor anyway.
      for (let page = 0; page < 5; page++) {
        const result = await this.http.json('/api/v1/favorites/items', parse.items, { query: { kind, target_ids: ids.join(','), limit: favoritePageSize, after }, signal })
        for (const item of result.items) found.set(item.target_id, item)
        if (!result.next || result.next === after) break
        after = result.next
      }
    }
    return found
  }

  createFolder(body: { name: string }, key: string) {
    return this.http.json('/api/v1/favorites/folders', parse.folder, { method: 'POST', body, key })
  }

  renameFolder(id: string, body: { name: string; revision: number }, key: string) {
    return this.http.json(`/api/v1/favorites/folders/${segment(id)}/rename`, parse.folder, { method: 'POST', body, key })
  }

  deleteFolder(id: string, body: { revision: number }, key: string) {
    return this.http.json(`/api/v1/favorites/folders/${segment(id)}/delete`, parse.removed, { method: 'POST', body, key })
  }

  add(body: { kind: FavoriteKind; target_id: string; folder_id?: string }, key: string) {
    return this.http.json('/api/v1/favorites/items', parse.item, { method: 'POST', body, key })
  }

  move(id: string, body: { folder_id: string; revision: number }, key: string) {
    return this.http.json(`/api/v1/favorites/items/${segment(id)}/move`, parse.item, { method: 'POST', body, key })
  }

  remove(id: string, body: { revision: number }, key: string) {
    return this.http.json(`/api/v1/favorites/items/${segment(id)}/remove`, parse.removed, { method: 'POST', body, key })
  }
}

export function useFavoritesApi() {
  return new FavoritesApi(useHttp())
}
