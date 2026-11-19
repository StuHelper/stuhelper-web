import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { Http } from '../../shared/api/http'
import { Mutation } from '../../shared/api/mutation'
import { attribute, attributeText, previewKind, ResourcesApi, typeExtension, Upload, type Field, type MediaVersion } from './api'

const resource = { id: 'resource', revision: 1, state: 'draft', download_allowed: false, access_reason: 'not_published', owned: true }
const media: MediaVersion = { id: 'version', file_id: 'file', number: 1, revision: 1, upload_id: 'upload', filename: 'lecture.txt', content_type: 'text/plain', size: 5, sha256: 'a'.repeat(64), state: 'created', approved: false, upload_expires_at: '2030-01-01T00:00:00Z', retain_until: '2030-01-02T00:00:00Z', cleanup_complete: false, error_code: '' }
const view = (changes: Partial<MediaVersion> = {}) => Response.json({ ...media, healthy: 1, desired: 3, storage_state: 'pending', ...changes })
const draft = { revision: 0, metadata: { title: 't', description: '', tags: [], category_id: 'c', category_revision: 1, attributes: { year: { number: 2025 } }, associations: { school_id: 's' }, access: 'public' as const, origin: { kind: 'unknown' as const } } }
afterEach(() => vi.unstubAllGlobals())

it('retries unknown writes with the frozen nested payload and original key', async () => {
  const calls: RequestInit[] = []
  const api = new ResourcesApi(new Http(async (_url, init) => {
    calls.push(init ?? {})
    if (calls.length === 1) throw new TypeError('lost response')
    return Response.json(resource)
  }))
  const mutation = new Mutation()
  const input = reactive(structuredClone(draft))
  await expect(mutation.run('create', input, (body, key) => api.createDraft(body, key))).rejects.toMatchObject({ uncertain: true })
  input.metadata.attributes.year = { number: 2026 }
  await expect(mutation.run('other', input, (body, key) => api.createDraft(body, key))).rejects.toMatchObject({ code: 'retry_required' })
  await mutation.run('create', input, (body, key) => api.createDraft(body, key))
  expect(calls[0]?.body).toBe(calls[1]?.body)
  expect(calls[0]?.headers).toEqual(calls[1]?.headers)
  expect(mutation.uncertain).toBe(false)
})

it('releases a known rejected mutation and clears private state even for non-JSON denial', async () => {
  const clear = vi.fn()
  const api = new ResourcesApi(new Http(async () => new Response('login expired', { status: 401 }), { onDenied: clear }))
  const mutation = new Mutation()
  await expect(mutation.run('create', draft, (body, key) => api.createDraft(body, key))).rejects.toMatchObject({ code: 'unauthenticated', uncertain: false })
  expect(clear).toHaveBeenCalledOnce()
  expect(mutation.uncertain).toBe(false)
})

it.each(['malformed', JSON.stringify({ ...resource, revision: 'wrong' }), 'x'.repeat((4 << 20) + 1)])('keeps an acknowledged write with an unreadable receipt from being sent again', async (receipt) => {
  const send = vi.fn(async () => new Response(receipt, { status: 201 }))
  const api = new ResourcesApi(new Http(send))
  const mutation = new Mutation()
  const error = { code: 'write_response_unrecognized', uncertain: true, status: 201 }
  await expect(mutation.run('create', draft, (body, key) => api.createDraft(body, key))).rejects.toMatchObject(error)
  await expect(mutation.retry()).rejects.toMatchObject(error)
  expect(mutation.uncertain).toBe(true)
  expect(send).toHaveBeenCalledTimes(1)
})

it('passes current host credentials and cancellation on every request', async () => {
  let credential = 'first'
  const seen: string[] = []
  const signals: AbortSignal[] = []
  const api = new ResourcesApi(new Http(async (_input, init) => {
    seen.push(credential)
    if (init?.signal) signals.push(init.signal)
    return Response.json(resource)
  }))
  const controller = new AbortController()
  await api.item('resource', controller.signal)
  credential = 'second'
  await api.item('resource', controller.signal)
  expect(seen).toEqual(['first', 'second'])
  controller.abort()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
})

it('keeps a resource upload active throughout the proxy wait', async () => {
  vi.useFakeTimers()
  try {
    const api = new ResourcesApi(new Http(async (_url, init) => {
      await new Promise(resolve => setTimeout(resolve, 300_000))
      init?.signal?.throwIfAborted()
      return Response.json(media)
    }))
    const result = expect(api.sendContent('upload', new Blob(['hello']), 'key')).resolves.toMatchObject({ id: media.id })
    await Promise.all([result, vi.advanceTimersByTimeAsync(300_000)])
  } finally {
    vi.useRealTimers()
  }
})

it('resolves a lost upload response by querying state without sending bytes again', async () => {
  vi.stubGlobal('crypto', webcrypto)
  let sent = 0
  let state = 'created'
  const keys: string[] = []
  const api = new ResourcesApi(new Http(async (_input, init) => {
    if (init?.method === 'POST') return Response.json(media)
    if (init?.method === 'PUT') {
      sent++
      keys.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
      state = 'awaiting_approval'
      throw new TypeError('lost completion')
    }
    return view({ state })
  }))
  const upload = new Upload(api, new File(['hello'], 'lecture.txt', { type: 'text/plain' }), 'custom-purpose')
  await expect(upload.run()).rejects.toMatchObject({ uncertain: true })
  expect((await upload.run()).state).toBe('awaiting_approval')
  expect(sent).toBe(1)
  expect(keys[0]).toBeTruthy()
})

it('keeps cancellation pending until the server confirms it', async () => {
  let deletes = 0
  const api = new ResourcesApi(new Http(async (_input, init) => {
    if (init?.method === 'DELETE') {
      deletes++
      if (deletes === 1) throw new TypeError('lost cancel')
      return Response.json({ ...media, state: 'cancelled' })
    }
    return Response.json(media)
  }))
  const upload = new Upload(api, new File(['hello'], 'lecture.txt'), 'purpose')
  upload.version = media
  await expect(upload.cancel()).rejects.toMatchObject({ uncertain: true })
  expect(upload.version.state).toBe('created')
  expect((await upload.cancel()).state).toBe('cancelled')
})

it('preserves a completed upload when cancellation is rejected', async () => {
  const api = new ResourcesApi(new Http(async (_input, init) => (init?.method === 'DELETE' ? Response.json({}, { status: 409 }) : view({ state: 'awaiting_approval' }))))
  const upload = new Upload(api, new File(['hello'], 'lecture.txt'), 'purpose')
  upload.version = media
  expect((await upload.cancel()).state).toBe('awaiting_approval')
  expect(upload.cancelled).toBe(false)
})

it('uses configured fields without category-name branches and preserves missing values', () => {
  const field: Field = { key: 'edition', names: { 'zh-CN': '版次' }, kind: 'integer', required: false, filterable: true, groupable: true, min: 1900, max: 2100 }
  expect(attribute(field, '')).toBeUndefined()
  expect(attribute(field, '2025')).toEqual({ number: 2025 })
  expect(() => attribute(field, '2025.5')).toThrow()
  expect(attributeText(field, { number: 2025 }, 'en-US')).toBe('2025')
  expect(attributeText(field, undefined, 'en-US')).toBe('')
})

it('requests safe reuse and never sends bytes for reused or still pending content', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const methods: string[] = []
  let done = false
  let payload: unknown
  const api = new ResourcesApi(new Http(async (_input, init) => {
    methods.push(init?.method ?? 'GET')
    if (init?.method === 'POST') {
      payload = JSON.parse(String(init.body))
      return Response.json({ ...media, reused: true, state: 'verifying' })
    }
    return view({ reused: true, state: done ? 'awaiting_approval' : 'verifying' })
  }))
  const upload = new Upload(api, new File(['hello'], 'lecture.txt', { type: 'text/plain' }), 'purpose')
  await expect(upload.run()).rejects.toMatchObject({ code: 'reuse_pending', uncertain: false })
  expect(payload).toMatchObject({ reuse_existing: true })
  done = true
  const result = await upload.run()
  expect(result.reused).toBe(true)
  expect(methods).toEqual(['POST', 'GET', 'GET'])
})

it('detects inline previewable files, resolves own references and reports upload byte progress', async () => {
  vi.stubGlobal('crypto', webcrypto)
  expect(previewKind({ filename: 'exam.pdf', content_type: 'application/pdf' })).toBe('pdf')
  expect(previewKind({ filename: 'scan.png', content_type: 'image/png' })).toBe('image')
  expect(previewKind({ filename: 'notes.txt', content_type: 'text/plain; charset=utf-8' })).toBe('text')
  expect(previewKind({ filename: 'bundle.zip', content_type: 'application/zip' })).toBeUndefined()
  expect(typeExtension('application/pdf')).toBe('pdf')
  expect(typeExtension('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')

  const seenPaths: string[] = []
  const api = new ResourcesApi(new Http(async (input, init) => {
    const url = String(input)
    seenPaths.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.startsWith('/api/v1/resources/me/references')) {
      return Response.json({ items: [{ id: 'course-1', kind: 'course', name: 'Calculus' }], missing_ids: [] })
    }
    if (url.endsWith('/preview')) {
      return new Response('preview-body', { headers: { 'Content-Type': 'text/plain' } })
    }
    if (init?.method === 'POST') return Response.json(media)
    if (init?.method === 'PUT') return Response.json({ ...media, state: 'awaiting_approval' })
    return view({ state: 'created' })
  }))

  const refs = await api.myReferences(['course-1', 'course-1', undefined])
  expect(refs.get('course-1')?.name).toBe('Calculus')
  const blob = await api.preview('res-1', 12)
  expect(await blob.text()).toBe('preview-body')

  const progress: [number, number][] = []
  const upload = new Upload(api, new File(['hello'], 'lecture.txt', { type: 'text/plain' }), 'purpose')
  const version = await upload.run((loaded, total) => progress.push([loaded, total]))
  expect(version.state).toBe('awaiting_approval')
  expect(progress).toEqual([[0, 5], [5, 5]])
  expect(seenPaths).toContain('GET /api/v1/resources/items/res-1/preview')
})

it('hashes a file incrementally and submits the digest of all its bytes', async () => {
  const file = new File([new Uint8Array(3 << 20), 'end'], 'sample.bin')
  const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', await file.arrayBuffer())).toString('hex')
  const wholeFile = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('whole-file allocation'))
  let digest = ''
  const api = new ResourcesApi(new Http(async (_url, init) => {
    if (init?.method === 'POST') {
      digest = JSON.parse(String(init.body)).sha256
      return Response.json(media)
    }
    return view({ state: 'ready' })
  }))
  await new Upload(api, file, 'purpose').run()
  expect(wholeFile).not.toHaveBeenCalled()
  expect(digest).toBe(expected)
})

it('waits for server verification without resending file content', async () => {
  const methods: string[] = []
  const received: string[] = []
  let state: MediaVersion['state'] = 'created'
  const api = new ResourcesApi(new Http(async (_path, init) => {
    methods.push(init?.method ?? 'GET')
    if (init?.method === 'POST') return Response.json(media)
    if (init?.method === 'PUT' && init.body instanceof Blob) {
      received.push(await init.body.text())
      state = 'verifying'
      if (received.length === 1) throw new TypeError('lost upload response')
      return Response.json({ ...media, state })
    }
    return view({ state })
  }))
  const upload = new Upload(api, new File(['hello'], 'lecture.txt'), 'purpose')
  await expect(upload.run()).rejects.toMatchObject({ uncertain: true })
  expect((await upload.run()).state).toBe('verifying')
  state = 'ready'
  expect((await upload.run()).state).toBe('ready')
  expect(methods).toEqual(['POST', 'GET', 'PUT', 'GET', 'GET'])
  expect(received).toEqual(['hello'])
})

it('cancels during hashing without creating a media session', async () => {
  const send = vi.fn<typeof fetch>(async () => Response.json(media))
  const upload = new Upload(new ResourcesApi(new Http(send)), new File(['hello'], 'lecture.txt'), 'purpose')
  const transfer = upload.run()
  const stopped = expect(transfer).rejects.toMatchObject({ code: 'cancelled' })
  await expect(upload.cancel()).rejects.toMatchObject({ code: 'cancelled', uncertain: false })
  await stopped
  expect(send).not.toHaveBeenCalled()
})
