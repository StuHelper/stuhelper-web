import contract from '../../../contracts/search.openapi.json'
import type { components } from '../../api/search.gen'
import type { Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type SearchItem = Schemas['Item']
export type Target = Schemas['Target']
export type Vote = Schemas['Vote']
export type SearchKind = Target['kind']

const schemas = contract.components.schemas
const parse = {
  page: schemaOf<Schemas['Page']>(schemas, 'Page'),
  votes: schemaOf<Schemas['Votes']>(schemas, 'Votes'),
}
export const pageSize = 20

/** Local page of a search target. Only kind and ID decide the address. */
export function targetRoute(target: Target) {
  const id = encodeURIComponent(target.id)
  switch (target.kind) {
    case 'school':
      return '/courses'
    case 'course':
      return `/courses/${id}`
    case 'teacher':
      return `/teachers/${id}`
    case 'review':
      return `/reviews/${id}`
    case 'resource':
      return `/resources/items/${id}`
  }
}

/**
 * Search, popular courses and teachers, and the caller's own votes. The server
 * checks current visibility of every result against its source module, so a
 * result here can still open as unavailable if it was removed a moment ago.
 */
export class SearchApi {
  constructor(private readonly http: Http) {}

  async search(q: string, kind: SearchKind | '', cursor: string, signal?: AbortSignal, limit = pageSize) {
    const page = await this.http.json('/api/v1/search', parse.page, { query: { q, kind: kind || undefined, cursor: cursor || undefined, limit }, signal })
    return { items: page.items, next: page.next_cursor }
  }

  async popular(kind: 'course' | 'teacher', cursor: string, signal?: AbortSignal) {
    const page = await this.http.json('/api/v1/search/popular', parse.page, { query: { kind, cursor: cursor || undefined, limit: pageSize }, signal })
    return { items: page.items, next: page.next_cursor }
  }

  async myVotes(cursor: string, signal?: AbortSignal) {
    const page = await this.http.json('/api/v1/search/my-votes', parse.votes, { query: { cursor: cursor || undefined, limit: pageSize }, signal })
    return { items: page.items, next: page.next_cursor }
  }
}

export function useSearchApi() {
  return new SearchApi(useHttp())
}
