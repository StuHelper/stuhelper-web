import mediaContract from '../../../contracts/media.openapi.json'
import resourcesContract from '../../../contracts/resources.openapi.json'
import type { components as Media } from '../../api/media.gen'
import type { components as Resources } from '../../api/resources.gen'
import { ApiError } from '../../shared/api/errors'
import { saveBlob, segment, type Http, type Query } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

export type Schema = Resources['schemas']
export type Category = Schema['Category']
export type Resource = Schema['Resource']
export type Version = Schema['Version']
export type Metadata = Schema['Metadata']
export type Field = Schema['Field']
export type Value = Schema['Value']
export type Capabilities = Schema['Capabilities']
export type Directory = Schema['Directory']
export type Package = Schema['Package']
export type Coverage = Schema['Coverage']
export type Receipt = Schema['RequestReceipt']
export type RequestInput = Schema['Request']
export type MediaVersion = Media['schemas']['Version']

const resources = resourcesContract.components.schemas
const media = mediaContract.components.schemas
const parse = {
  capabilities: schemaOf<Capabilities>(resources, 'Capabilities'),
  categories: schemaOf<Schema['CategoryPage']>(resources, 'CategoryPage'),
  resource: schemaOf<Resource>(resources, 'Resource'),
  coverage: schemaOf<Coverage>(resources, 'Coverage'),
  page: schemaOf<Schema['ResourcePage']>(resources, 'ResourcePage'),
  directories: schemaOf<Schema['DirectoryPage']>(resources, 'DirectoryPage'),
  package: schemaOf<Package>(resources, 'Package'),
  receipt: schemaOf<Receipt>(resources, 'RequestReceipt'),
  receipts: schemaOf<Schema['RequestPage']>(resources, 'RequestPage'),
  mediaVersion: schemaOf<MediaVersion>(media, 'Version'),
  mediaView: schemaOf<MediaVersion>(media, 'VersionView'),
}

export const pageSize = 25

/** Localized name of a configured category, field or option. */
export function localName(names: Record<string, string>, locale: string) {
  return names[locale] ?? names['zh-CN'] ?? Object.values(names)[0] ?? ''
}

/** Convert form text to a configured attribute value; empty means "not provided". */
export function attribute(field: Field, raw: string): Value | undefined {
  if (raw === '') return undefined
  if (field.kind === 'integer') {
    const number = Number(raw)
    if (!Number.isSafeInteger(number)) throw new ApiError('invalid_input')
    return { number }
  }
  return field.kind === 'choice' ? { option: raw } : { text: raw }
}

export function attributeText(field: Field | undefined, value: Value | undefined, locale: string) {
  if (!value) return ''
  if (value.number !== undefined) return new Intl.NumberFormat(locale, { useGrouping: false }).format(value.number)
  if (value.option !== undefined) return localName(field?.options?.find((option) => option.id === value.option)?.names ?? {}, locale) || value.option
  return value.text ?? ''
}

/**
 * Resource and media requests. Writes go through a Mutation by the caller so an
 * unknown outcome is retried only with its original body and key.
 */
export class ResourcesApi {
  constructor(private readonly http: Http) {}

  capabilities(signal?: AbortSignal) {
    return this.http.json('/api/v1/resources/capabilities', parse.capabilities, { signal })
  }

  /** Enabled categories in their configured order. */
  async categories(signal?: AbortSignal): Promise<Category[]> {
    const items: Category[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const result = await this.http.json('/api/v1/resources/categories', parse.categories, { query: { limit: 100, after }, signal })
      items.push(...result.items)
      if (!result.next_cursor || result.next_cursor === after) break
      after = result.next_cursor
    }
    return items.sort((a, b) => a.order - b.order)
  }

  list(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/resources', parse.page, { query: { limit: pageSize, ...query }, signal })
  }

  mine(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/resources/me', parse.page, { query: { limit: pageSize, ...query }, signal })
  }

  item(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/resources/items/${segment(id)}`, parse.resource, { signal })
  }

  /** Resources a membership plan covers; not_found means the plan has no coverage configured. */
  coverage(planID: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/resources/coverage/${segment(planID)}`, parse.coverage, { signal })
  }

  directories(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/resources/directories', parse.directories, { query: { limit: pageSize, ...query }, signal })
  }

  requests(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/resources/requests', parse.receipts, { query: { limit: pageSize, ...query }, signal })
  }

  request(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/resources/requests/${segment(id)}`, parse.receipt, { signal })
  }

  createDraft(body: Schema['DraftWrite'], key: string) {
    return this.http.json('/api/v1/resources', parse.resource, { method: 'POST', body, key })
  }

  updateDraft(id: string, body: Schema['DraftWrite'], key: string) {
    return this.http.json(`/api/v1/resources/items/${segment(id)}`, parse.resource, { method: 'PUT', body, key })
  }

  attachFile(id: string, body: Schema['FileLink'], key: string) {
    return this.http.json(`/api/v1/resources/items/${segment(id)}/file`, parse.resource, { method: 'POST', body, key })
  }

  submit(id: string, body: Schema['Command'], key: string) {
    return this.http.json(`/api/v1/resources/items/${segment(id)}/submit`, parse.resource, { method: 'POST', body, key })
  }

  createRequest(id: string, body: RequestInput, key: string) {
    return this.http.json(`/api/v1/resources/items/${segment(id)}/requests`, parse.receipt, { method: 'POST', body, key })
  }

  retryRequest(id: string, body: Record<string, never>, key: string) {
    return this.http.json(`/api/v1/resources/requests/${segment(id)}/retry`, parse.receipt, { method: 'POST', body, key })
  }

  createPackage(body: Schema['PackageRequest'], key: string) {
    return this.http.json('/api/v1/resources/packages', parse.package, { method: 'POST', body, key })
  }

  async download(id: string, filename: string, size: number, signal?: AbortSignal) {
    // Allow some slack over the recorded size for transfer framing.
    saveBlob(await this.http.blob(`/api/v1/resources/items/${segment(id)}/download`, size + (4 << 20), { signal }), filename)
  }

  async downloadPart(pack: Package, part: number, limit: number, signal?: AbortSignal) {
    saveBlob(await this.http.blob(`/api/v1/resources/packages/${segment(pack.id)}/parts/${part}`, limit + (4 << 20), { signal }), `resources-${part}.zip`)
  }

  createUpload(body: Media['schemas']['UploadRequest'], key: string) {
    return this.http.json('/api/v1/media/uploads', parse.mediaVersion, { method: 'POST', body, key })
  }

  upload(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}`, parse.mediaView, { signal })
  }

  sendContent(id: string, file: Blob, key: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}/content`, parse.mediaVersion, { method: 'PUT', bytes: file, headers: { 'Content-Type': 'application/octet-stream' }, key, signal, timeout: 120_000 })
  }

  cancelUpload(id: string, key: string) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}`, parse.mediaVersion, { method: 'DELETE', key })
  }
}

export function useResourcesApi() {
  return new ResourcesApi(useHttp())
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const readyStates = ['awaiting_approval', 'approved', 'ready']
const finishedStates = ['cancelled', 'expired', 'rejected', 'deleting']

/**
 * One file transfer. Each step keeps its own idempotency key so a retry after a
 * lost response resumes the same upload session instead of starting another.
 * When the server already holds identical content owned by the user, no bytes
 * are sent and the new resource still goes through its own review.
 */
export class Upload {
  version?: MediaVersion
  private readonly createKey = crypto.randomUUID()
  private readonly contentKey = crypto.randomUUID()
  private readonly cancelKey = crypto.randomUUID()
  private request?: Media['schemas']['UploadRequest']
  private stop?: AbortController
  cancelled = false

  constructor(
    private readonly api: ResourcesApi,
    readonly file: File,
    readonly purpose: string,
  ) {}

  async run(): Promise<MediaVersion> {
    this.stop = new AbortController()
    this.request ??= { reuse_existing: true, purpose: this.purpose, filename: this.file.name, content_type: this.file.type || 'application/octet-stream', size: this.file.size, sha256: await sha256(this.file) }
    this.version ??= await this.api.createUpload(this.request, this.createKey)
    if (this.cancelled) return this.cancel()
    // Ask for the current state first: a previous attempt may already have stored the bytes.
    this.version = await this.api.upload(this.version.upload_id)
    if (readyStates.includes(this.version.state)) return this.version
    if (finishedStates.includes(this.version.state)) throw new ApiError('invalid_input')
    if (this.version.reused) throw new ApiError('reuse_pending')
    this.version = await this.api.sendContent(this.version.upload_id, this.file, this.contentKey, this.stop.signal)
    return this.version
  }

  /** Request cancellation. Only a confirmed server state counts as cancelled. */
  async cancel(): Promise<MediaVersion> {
    this.cancelled = true
    this.stop?.abort()
    if (!this.version) throw new ApiError('cancel_pending')
    try {
      this.version = await this.api.cancelUpload(this.version.upload_id, this.cancelKey)
    } catch (error) {
      // The transfer finished before the cancellation arrived; keep the real result.
      if (error instanceof ApiError && error.code === 'conflict') {
        this.version = await this.api.upload(this.version.upload_id)
        this.cancelled = false
        return this.version
      }
      throw error
    }
    return this.version
  }
}
