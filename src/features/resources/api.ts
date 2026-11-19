import { sha256 as sha256Hash } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import mediaContract from '../../../contracts/media.openapi.json'
import resourcesContract from '../../../contracts/resources.openapi.json'
import type { components as Media } from '../../api/media.gen'
import type { components as Resources } from '../../api/resources.gen'
import { httpsUrl } from '../../shared/urls'
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
export type Reference = Schema['Reference']
export type ResourceFile = Schema['File']
export type MediaVersion = Media['schemas']['Version']
export type PreviewKind = 'pdf' | 'image' | 'text'

const resources = resourcesContract.components.schemas
const media = mediaContract.components.schemas
const parse = {
  capabilities: schemaOf<Capabilities>(resources, 'Capabilities'),
  categories: schemaOf<Schema['CategoryPage']>(resources, 'CategoryPage'),
  resource: schemaOf<Resource>(resources, 'Resource'),
  coverage: schemaOf<Coverage>(resources, 'Coverage'),
  page: schemaOf<Schema['ResourcePage']>(resources, 'ResourcePage'),
  ownSummary: schemaOf<Schema['OwnResourceSummary']>(resources, 'OwnResourceSummary'),
  references: schemaOf<Schema['References']>(resources, 'References'),
  directories: schemaOf<Schema['DirectoryPage']>(resources, 'DirectoryPage'),
  package: schemaOf<Package>(resources, 'Package'),
  receipt: schemaOf<Receipt>(resources, 'RequestReceipt'),
  receipts: schemaOf<Schema['RequestPage']>(resources, 'RequestPage'),
  mediaVersion: schemaOf<MediaVersion>(media, 'Version'),
  mediaView: schemaOf<MediaVersion>(media, 'VersionView'),
}

// Nginx limits idle periods to 300 s. Allow a longer total time for large files.
const transferTimeout = 30 * 60_000

export const pageSize = 25
/** Upper bound for inline browser preview so large archives or scans do not exhaust memory. */
export const maxPreviewBytes = 25 * 1024 * 1024

export const typeNames: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'text/csv': 'CSV',
  'application/zip': 'ZIP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
}

const typeExtensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

export function typeLabel(type: string) {
  const clean = type.split(';')[0]?.trim().toLowerCase() ?? ''
  return typeNames[clean] ?? clean.split('/').at(-1)?.toUpperCase() ?? type
}

/** Lowercase extension accepted by the contract's `file_type` query filter. */
export function typeExtension(type: string): string | undefined {
  const clean = type.split(';')[0]?.trim().toLowerCase() ?? ''
  const known = typeExtensions[clean]
  if (known) return known
  const sub = clean.split('/')[1] ?? ''
  return /^[a-z0-9]{1,12}$/.test(sub) && sub !== 'octet-stream' ? sub : undefined
}

/** Determine whether a file can be safely rendered inside an inline preview container. */
export function previewKind(file: Pick<ResourceFile, 'content_type' | 'filename'> | undefined): PreviewKind | undefined {
  if (!file) return undefined
  const mime = file.content_type.split(';')[0]?.trim().toLowerCase() ?? ''
  const ext = file.filename.includes('.') ? file.filename.split('.').pop()?.toLowerCase() ?? '' : ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/csv' || ['txt', 'md', 'csv'].includes(ext)) return 'text'
  return undefined
}

/** Localized name of a configured category, field or option. */
export function localName(names: Record<string, string>, locale: string) {
  return names[locale] ?? names['zh-CN'] ?? Object.values(names)[0] ?? ''
}

/** Convert form text to a configured attribute value; empty means "not provided". */
export function attribute(field: Field, raw: string): Value | undefined {
  raw = raw.trim()
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

  async capabilities(signal?: AbortSignal) {
    const result = await this.http.json('/api/v1/resources/capabilities', parse.capabilities, { signal })
    if (!httpsUrl(result.terms.url)) throw new ApiError('incompatible')
    return result
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

  /** The viewer's own resource count and how many of them are published. */
  mySummary(signal?: AbortSignal) {
    return this.http.json('/api/v1/resources/me/summary', parse.ownSummary, { signal })
  }

  /** Catalog names referenced by the caller's own uploaded resources, in batches of 100. */
  async myReferences(ids: (string | undefined)[], signal?: AbortSignal): Promise<Map<string, Reference>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))]
    const names = new Map<string, Reference>()
    for (let start = 0; start < unique.length; start += 100) {
      const result = await this.http.json('/api/v1/resources/me/references', parse.references, { query: { ids: unique.slice(start, start + 100).join(',') }, signal })
      for (const item of result.items) names.set(item.id, item)
    }
    return names
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
    saveBlob(await this.http.blob(`/api/v1/resources/items/${segment(id)}/download`, size + (4 << 20), { signal, timeout: transferTimeout }), filename)
  }

  /** Authorized inline bytes for preview, subject to the exact same eligibility and access checks as download. */
  preview(id: string, size: number, signal?: AbortSignal) {
    return this.http.blob(`/api/v1/resources/items/${segment(id)}/preview`, size + (4 << 20), { signal })
  }

  async downloadPart(pack: Package, part: number, limit: number, signal?: AbortSignal) {
    saveBlob(await this.http.blob(`/api/v1/resources/packages/${segment(pack.id)}/parts/${part}`, limit + (4 << 20), { signal, timeout: transferTimeout }), `resources-${part}.zip`)
  }

  createUpload(body: Media['schemas']['UploadRequest'], key: string) {
    return this.http.json('/api/v1/media/uploads', parse.mediaVersion, { method: 'POST', body, key })
  }

  upload(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}`, parse.mediaView, { signal })
  }

  sendContent(id: string, file: Blob, key: string, signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}/content`, parse.mediaVersion, { method: 'PUT', bytes: file, headers: { 'Content-Type': 'application/octet-stream' }, key, signal, timeout: transferTimeout, onUploadProgress: onProgress })
  }

  cancelUpload(id: string, key: string) {
    return this.http.json(`/api/v1/media/uploads/${segment(id)}`, parse.mediaVersion, { method: 'DELETE', key })
  }
}

export function useResourcesApi() {
  return new ResourcesApi(useHttp())
}

async function sha256(file: File, signal: AbortSignal) {
  const hash = sha256Hash.create()
  // A fixed-size slice also bounds memory on browsers that buffer an entire Blob stream.
  const chunkSize = 1 << 20
  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      signal.throwIfAborted()
      const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer()
      hash.update(new Uint8Array(chunk))
    }
    signal.throwIfAborted()
    return bytesToHex(hash.digest())
  } finally { hash.destroy() }
}

export const readyStates = ['awaiting_approval', 'approved', 'ready']
export const finishedStates = ['cancelled', 'expired', 'rejected', 'deleting', 'deleted']

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
  private creating = false
  private stop?: AbortController
  cancelled = false

  constructor(
    private readonly api: ResourcesApi,
    readonly file: File,
    readonly purpose: string,
  ) {}

  async run(onProgress?: (loaded: number, total: number) => void): Promise<MediaVersion> {
    this.stop = new AbortController()
    this.request ??= { reuse_existing: true, purpose: this.purpose, filename: this.file.name, content_type: this.file.type || 'application/octet-stream', size: this.file.size, sha256: await sha256(this.file, this.stop.signal) }
    // Keep a pending creation receipt so concurrent cancellation can name the session.
    if (!this.creating && this.cancelled) throw new ApiError('cancelled')
    this.creating = true
    this.version ??= await this.api.createUpload(this.request, this.createKey)
    if (this.cancelled) return this.cancel()
    // Ask for the current state first: a previous attempt may already have stored the bytes.
    this.version = await this.api.upload(this.version.upload_id, this.stop.signal)
    if (readyStates.includes(this.version.state)) return this.version
    if (finishedStates.includes(this.version.state)) return this.version
    if (this.version.reused) throw new ApiError('reuse_pending')
    if (this.version.state === 'verifying') return this.version
    this.version = await this.api.sendContent(this.version.upload_id, this.file, this.contentKey, this.stop.signal, onProgress)
    return this.version
  }

  /** Request cancellation. Only a confirmed server state counts as cancelled. */
  async cancel(): Promise<MediaVersion> {
    this.cancelled = true
    this.stop?.abort(new ApiError('cancelled'))
    if (!this.version) throw new ApiError(this.creating ? 'cancel_pending' : 'cancelled', this.creating)
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
