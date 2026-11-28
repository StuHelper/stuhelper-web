import { describe, expect, it, vi } from 'vitest'
import { Mutation } from './mutation'
import { sessionFetch } from './transport'
import { Http, queryString } from './http'
import { schemaOf } from './schema'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const anything = (value: unknown) => value

describe('HTTP boundary', () => {
  it('calls the transport as a plain function with same-origin credentials and no redirects', async () => {
    const fetcher: typeof fetch = function (this: unknown, _input, init) {
      expect(this).toBeUndefined()
      expect(init?.credentials).toBe('same-origin')
      expect(init?.redirect).toBe('error')
      return Promise.resolve(json({ ok: true }))
    }
    await expect(new Http(fetcher).json('/api/v1/test', anything)).resolves.toEqual({ ok: true })
  })

  it('rejects paths outside the API before sending anything', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(new Http(fetcher).json('https://example.invalid/api', anything)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps the server code, normalises module aliases and hides non-JSON error pages', async () => {
    const respond = (body: BodyInit, status: number) => new Http(async () => new Response(body, { status }))
    await expect(respond(JSON.stringify({ code: 'enrollment_required' }), 403).json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'enrollment_required', uncertain: false })
    await expect(respond(JSON.stringify({ code: 'permission_denied' }), 403).json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(respond(JSON.stringify({ code: 'resources_permission_denied' }), 403).json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(respond('<html>proxy error</html>', 404).json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'not_found' })
    await expect(respond(JSON.stringify({ code: 'Not A Code!' }), 409).json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('shows the specific review rejection returned for a write', async () => {
    for (const subcode of ['origin_mismatch', 'phone_binding_required', 'disclosure_unauthorized']) {
      const http = new Http(async () => json({ code: 'forbidden', subcode }, 403))
      await expect(http.json('/api/v1/reviews', anything, { method: 'POST', body: {} })).rejects.toMatchObject({ code: subcode, uncertain: false })
    }
  })

  it('keeps a well-formed server reopening time on a 409 and drops malformed ones', async () => {
    const respond = (body: object) => new Http(async () => new Response(JSON.stringify(body), { status: 409 }))
    const window = { code: 'conflict', subcode: 'append_window_not_open' }
    for (const time of ['2030-01-01T00:05:00Z', '2028-02-29T01:02:03.123456789+08:00']) {
      await expect(respond({ ...window, retry_at: time }).json('/api/v1/x', anything, { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'append_window_not_open', retryAt: time })
    }
    for (const time of ['soon', '2030-02-31T00:00:00Z', '2030-02-29T00:00:00Z', '2030-01-01T24:00:00Z']) {
      await expect(respond({ ...window, retry_at: time }).json('/api/v1/x', anything, { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'append_window_not_open', retryAt: undefined })
    }
  })

  it('marks a write as uncertain after a lost response or a gateway failure, but not a read', async () => {
    const lost = new Http(async () => { throw new TypeError('connection reset') })
    await expect(lost.json('/api/v1/x', anything, { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'network', uncertain: true })
    await expect(lost.json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'network', uncertain: false })
    const gateway = new Http(async () => new Response('bad gateway', { status: 502 }))
    await expect(gateway.json('/api/v1/x', anything, { method: 'PUT', body: {} })).rejects.toMatchObject({ code: 'unavailable', uncertain: true })
  })

  it('applies the deadline and cancellation to the response body', async () => {
    const stalled = new Http(async () => new Response(new ReadableStream({ start() {} }), { status: 200 }))
    await expect(stalled.json('/api/v1/x', anything, { timeout: 10 })).rejects.toMatchObject({ code: 'timeout', uncertain: false })
    await expect(stalled.json('/api/v1/x', anything, { method: 'POST', body: {}, timeout: 10 })).rejects.toMatchObject({ code: 'timeout', uncertain: true })
    await expect(stalled.blob('/api/v1/x', 10, { timeout: 10 })).rejects.toMatchObject({ code: 'timeout' })
    const controller = new AbortController()
    const pending = stalled.json('/api/v1/x', anything, { signal: controller.signal })
    setTimeout(() => controller.abort(), 5)
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('treats a failure with a recorded operation as a known outcome', async () => {
    const http = new Http(async () => json({ code: 'dependency_unavailable', operation_id: 'a'.repeat(64) }, 503))
    await expect(http.json('/api/v1/x', anything, { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'unavailable', uncertain: false, operationId: 'a'.repeat(64) })
  })

  it('reports account denial so private data can be cleared', async () => {
    const onDenied = vi.fn()
    const http = new Http(async () => new Response('expired', { status: 401 }), { onDenied })
    await expect(http.json('/api/v1/x', anything)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(onDenied).toHaveBeenCalledOnce()
  })

  it('rejects responses that do not match the contract schema', async () => {
    const parse = schemaOf<{ id: string }>({ Item: { type: 'object', required: ['id'], properties: { id: { type: 'string' } }, additionalProperties: false } }, 'Item')
    const http = new Http(async () => json({ id: 'x', secret: 'leak' }))
    await expect(http.json('/api/v1/x', parse)).rejects.toMatchObject({ code: 'incompatible' })
  })

  it('distinguishes cancellation by the caller from a timeout', async () => {
    const hang: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const controller = new AbortController()
    const cancelled = new Http(hang).json('/api/v1/x', anything, { signal: controller.signal })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'cancelled' })
    await expect(new Http(hang).json('/api/v1/x', anything, { timeout: 5 })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('omits empty query values', () => {
    expect(queryString({ a: '1', b: '', c: undefined, d: null, e: 0, f: false })).toBe('?a=1&e=0&f=false')
    expect(queryString({})).toBe('')
    // List items keep their own commas encoded; the separator stays a literal comma.
    expect(queryString({ ids: ['a', 'b,c', 'd e'], kind: 'course' })).toBe('?ids=a,b%2Cc,d%20e&kind=course')
    expect(queryString({ ids: [] })).toBe('')
  })
})

it('keeps a progressing download alive beyond a single timeout interval', async () => {
  vi.useFakeTimers()
  try {
    let sender!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(controller) { sender = controller } })
    const result = new Http(async () => new Response(stream)).blob('/api/v1/file', 3, { timeout: 100 })
    const check = expect(result.then(blob => blob.text())).resolves.toBe('abc')
    for (const char of 'abc') {
      await vi.advanceTimersByTimeAsync(70)
      sender.enqueue(new TextEncoder().encode(char))
    }
    sender.close()
    await check
  } finally { vi.useRealTimers() }
})

it('keeps a completed upload with an unreadable browser receipt from being sent twice', async () => {
  const bytes: Blob[] = []
  class FailedReceipt {
    status = 200
    response = new TextEncoder().encode('malformed').buffer
    upload = {}
    onload?: () => void
    open() {}
    setRequestHeader() {}
    send(body: Blob) {
      bytes.push(body)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', FailedReceipt)
  try {
    const http = new Http(sessionFetch)
    const mutation = new Mutation()
    const file = new Blob(['saved content'])
    const expected = { code: 'write_response_unrecognized', uncertain: true }
    await expect(mutation.run('upload', {}, (_, key) => http.json('/api/v1/test', anything, {
      method: 'PUT', bytes: file, key, onUploadProgress: () => {},
    }))).rejects.toMatchObject(expected)
    await expect(mutation.retry()).rejects.toMatchObject(expected)
    expect(bytes).toEqual([file])
  } finally {
    vi.unstubAllGlobals()
  }
})
