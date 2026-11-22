import contract from '../../../contracts/legal.openapi.json'
import type { components } from '../../api/legal.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type LegalDocument = Schemas['PublicDocument']
export type LegalVersion = Schemas['PublicDocumentMetadata']

const schemas = contract.components.schemas
const parse = {
  document: schemaOf<LegalDocument>(schemas, 'PublicDocument'),
  page: schemaOf<Schemas['PublicDocumentPage']>(schemas, 'PublicDocumentPage'),
}
export const versionPageSize = 50
/** Slugs and versions follow the contract patterns; anything else is not a document address. */
export const validSlug = (value: string) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64
export const validVersion = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)

/** Published legal documents, readable without signing in. Archived versions stay readable. */
export class LegalApi {
  constructor(private readonly http: Http) {}

  current(slug: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/legal/documents/${segment(slug)}`, parse.document, { signal })
  }

  version(slug: string, version: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/legal/documents/${segment(slug)}/versions/${segment(version)}`, parse.document, { signal })
  }

  async versions(slug: string, offset: string, signal?: AbortSignal) {
    const page = await this.http.json(`/api/v1/legal/documents/${segment(slug)}/versions`, parse.page, { query: { limit: versionPageSize, offset: offset || undefined }, signal })
    return { items: page.items, next: page.next_offset === undefined ? '' : String(page.next_offset) }
  }
}

export function useLegalApi() {
  return new LegalApi(useHttp())
}
