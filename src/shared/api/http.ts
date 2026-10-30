import { ApiError, serverCode } from './errors'
import type { Validator } from './schema'

export type QueryValue = string | number | boolean | undefined | null
export type Query = Record<string, QueryValue>

export interface RequestOptions {
  method?: string
  query?: Query
  /** JSON request body. */
  body?: unknown
  /** Raw request body, sent as application/octet-stream unless a type is given. */
  bytes?: Blob
  headers?: Record<string, string>
  /** Idempotency key. Retrying an unknown outcome must reuse the same key. */
  key?: string
  signal?: AbortSignal
  /** Milliseconds before the request is abandoned. */
  timeout?: number
  /** JSON endpoints never redirect; downloads may follow a signed delivery URL. */
  redirect?: RequestRedirect
}

export interface HttpOptions {
  /** Called when the server rejects the current account (401/403). */
  onDenied?: () => void
}

const jsonLimit = 4 * 1024 * 1024
const errorLimit = 64 * 1024
const readMethods = new Set(['GET', 'HEAD'])

export function queryString(values: Query = {}) {
  const entries = Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null && entry[1] !== '')
    .map(([key, value]) => [key, String(value)])
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''
}

export const segment = (value: string) => encodeURIComponent(value)

/** Read at most `limit` bytes so a broken or hostile response cannot exhaust memory. */
export async function readLimited(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) {
        await reader.cancel()
        throw new ApiError('capacity_exceeded')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes))
}

export class Http {
  constructor(
    private readonly fetcher: typeof fetch,
    private readonly options: HttpOptions = {},
  ) {}

  /** Send a request and return the successful response. Failures become ApiError. */
  async send(path: string, options: RequestOptions = {}): Promise<Response> {
    if (!path.startsWith('/api/')) throw new ApiError('invalid_input')
    const method = (options.method ?? 'GET').toUpperCase()
    const write = !readMethods.has(method)
    const timer = new AbortController()
    const timeout = setTimeout(() => timer.abort(), options.timeout ?? 20_000)
    const signal = options.signal ? AbortSignal.any([options.signal, timer.signal]) : timer.signal
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
    if (options.key) headers['Idempotency-Key'] = options.key
    let body: BodyInit | undefined
    if (options.bytes) {
      body = options.bytes
      headers['Content-Type'] ??= options.bytes.type || 'application/octet-stream'
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers['Content-Type'] = 'application/json'
    }
    let response: Response
    try {
      // Call the transport as a plain function: native fetch rejects a foreign `this`.
      const fetcher = this.fetcher
      response = await fetcher(path + queryString(options.query), { method, headers, body, signal, credentials: 'same-origin', redirect: options.redirect ?? 'error' })
    } catch {
      clearTimeout(timeout)
      if (options.signal?.aborted) throw new ApiError('cancelled', write)
      throw new ApiError(timer.signal.aborted ? 'timeout' : 'network', write)
    }
    clearTimeout(timeout)
    if (response.ok) return response
    let problem: unknown = null
    try {
      problem = parseJson(await readLimited(response, errorLimit))
    } catch {
      // Non-JSON error pages never reach the user; the status decides the code.
    }
    const operation = typeof problem === 'object' && problem !== null && 'operation_id' in problem && typeof problem.operation_id === 'string' && /^[a-f0-9]{64}$/.test(problem.operation_id) ? problem.operation_id : undefined
    if (response.status === 401 || response.status === 403) this.options.onDenied?.()
    // A gateway or server failure without a recorded operation leaves a write's outcome unknown.
    throw new ApiError(serverCode(problem, response.status), write && response.status >= 500 && !operation, response.status, operation)
  }

  /** Send a request and validate the JSON response against the contract. */
  async json<T>(path: string, validate: Validator<T>, options: RequestOptions = {}): Promise<T> {
    const write = !readMethods.has((options.method ?? 'GET').toUpperCase())
    const response = await this.send(path, options)
    let value: unknown
    try {
      value = parseJson(await readLimited(response, jsonLimit))
    } catch {
      throw new ApiError('incompatible', write, response.status)
    }
    try {
      return validate(value)
    } catch {
      throw new ApiError('incompatible', write, response.status)
    }
  }

  /** Download a bounded binary response. */
  async blob(path: string, limit: number, options: RequestOptions = {}): Promise<Blob> {
    const response = await this.send(path, { timeout: 120_000, redirect: 'follow', ...options, headers: { Accept: '*/*', ...options.headers } })
    const bytes = await readLimited(response, limit)
    return new Blob([bytes], { type: response.headers.get('Content-Type') ?? 'application/octet-stream' })
  }
}

/** Offer a downloaded file to the browser while keeping the original file name. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
