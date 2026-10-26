import catalogContract from '../../contracts/catalog.openapi.json'
import reviewContract from '../../contracts/reviews.openapi.json'
import moderationContract from '../../contracts/moderation.openapi.json'
import type { components as Catalog } from '../api/catalog.gen'
import type { components as Reviews } from '../api/reviews.gen'
import type { components as Moderation } from '../api/moderation.gen'

export type AcademicObject = Catalog['schemas']['Object']
export type ObjectPage = Catalog['schemas']['Page']
export type Enrollment = Catalog['schemas']['Enrollment']
export type Review = Reviews['schemas']['View']
export type ReviewInput = Reviews['schemas']['Input']
export type ReviewPage = Reviews['schemas']['Page']
export type Statistics = Reviews['schemas']['Statistics']
export type Draft = Reviews['schemas']['DraftView']
export type Result = Reviews['schemas']['Result']
export type Task = Moderation['schemas']['TaskView']
export class AcademicError extends Error {
  constructor(public readonly code: string, public readonly uncertain = false) { super(code) }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
// The shipped OpenAPI schema validates unknown JSON before the generated type assertion.
export function validates(value: unknown, schema: unknown, schemas: Record<string, unknown>, depth = 0): boolean {
  if (!record(schema) || depth > 24) return false
  if (schema.nullable === true && value === null) return true
  if (typeof schema.$ref === 'string') return validates(value, schemas[schema.$ref.split('/').at(-1) ?? ''], schemas, depth + 1)
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false
  if (schema.type === 'string') return typeof value === 'string' && (typeof schema.maxLength !== 'number' || [...value].length <= schema.maxLength)
  if (schema.type === 'boolean') return typeof value === 'boolean'
  if (schema.type === 'integer' || schema.type === 'number') return typeof value === 'number' && Number.isFinite(value) && (schema.type !== 'integer' || Number.isInteger(value)) && (typeof schema.minimum !== 'number' || value >= schema.minimum) && (typeof schema.maximum !== 'number' || value <= schema.maximum)
  if (schema.type === 'array') return Array.isArray(value) && value.length <= 1000 && (typeof schema.minItems !== 'number' || value.length >= schema.minItems) && (typeof schema.maxItems !== 'number' || value.length <= schema.maxItems) && value.every(item => validates(item, schema.items, schemas, depth + 1))
  if (schema.type === 'object') {
    if (!record(value) || !record(schema.properties)) return false
    const properties = schema.properties
    if (Array.isArray(schema.required) && schema.required.some(key => typeof key !== 'string' || !(key in value))) return false
    return Object.entries(value).every(([key, item]) => key in properties ? validates(item, properties[key], schemas, depth + 1) : schema.additionalProperties !== false)
  }
  return false
}
const contracts = { catalog: catalogContract, reviews: reviewContract, moderation: moderationContract }
type Module = keyof typeof contracts
export async function call<T>(module: Module, path: string, schema: string, options: { signal?: AbortSignal; body?: unknown; key?: string; method?: string; array?: boolean } = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetcher(`/api/v1/${module}${path}`, { signal, credentials: 'same-origin', method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': options.key ?? '' }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
    const body = await response.text()
    if (body.length > 4 * 1024 * 1024) throw new AcademicError('incompatible', options.body !== undefined)
    let value: unknown
    try { value = JSON.parse(body) } catch { throw new AcademicError('incompatible', options.body !== undefined) }
    if (!response.ok) {
      const codes = ['unauthenticated', 'forbidden', 'enrollment_required', 'edit_window_closed', 'conflict', 'not_found', 'invalid_input', 'unavailable']
      const code = record(value) && typeof value.code === 'string' && codes.includes(value.code) ? value.code : 'unavailable'
      throw new AcademicError(code, response.status >= 500 && options.body !== undefined)
    }
    const schemas: Record<string, unknown> = contracts[module].components.schemas
    const shape = schema === 'string' ? { type: 'string' } : schemas[schema]
    if (!validates(value, options.array ? { type: 'array', items: shape } : shape, schemas)) throw new AcademicError('incompatible', options.body !== undefined)
    return value as T
  } catch (error) {
    if (error instanceof AcademicError) throw error
    if (options.signal?.aborted) throw error
    throw new AcademicError('network', options.body !== undefined)
  } finally { clearTimeout(timeout) }
}
export function query(values: Record<string, string | undefined>) { return '?' + new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => !!entry[1])).toString() }
export const objects = (values: Record<string, string | undefined>, signal?: AbortSignal) => call<ObjectPage>('catalog', '/objects' + query(values), 'Page', { signal })
export const object = (id: string, signal?: AbortSignal) => call<AcademicObject>('catalog', '/objects/' + encodeURIComponent(id), 'Object', { signal })

// Selection lists must not silently drop options after the first server page.
export async function objectOptions(values: Record<string, string | undefined>, signal?: AbortSignal): Promise<ObjectPage> {
  const items: AcademicObject[] = []
  const seen = new Set<string>()
  let after = ''
  for (let page = 0; page < 10; page++) {
    const result = await objects({ ...values, limit: '100', after }, signal)
    items.push(...result.items)
    if (!result.next) return { items, next: '' }
    if (seen.has(result.next)) throw new AcademicError('incompatible')
    seen.add(result.next)
    after = result.next
  }
  throw new AcademicError('unavailable')
}

// A retry after an unknown response must send the exact same body and key.
export class Mutation {
  private pending?: { module: Module; path: string; schema: string; body: unknown; key: string; method?: string }
  get uncertain() { return this.pending !== undefined }
  async run<T>(module: Module, path: string, schema: string, body: unknown, method?: string): Promise<T> {
    if (!this.pending) this.pending = { module, path, schema, body: JSON.parse(JSON.stringify(body)) as unknown, key: crypto.randomUUID(), method }
    const request = this.pending
    try {
      const value = await call<T>(request.module, request.path, request.schema, request)
      this.pending = undefined
      return value
    } catch (error) {
      if (!(error instanceof AcademicError) || !error.uncertain) this.pending = undefined
      throw error
    }
  }
}
