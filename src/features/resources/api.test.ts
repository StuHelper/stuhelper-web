import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { Http } from '../../shared/api/http'
import { Mutation } from '../../shared/api/mutation'
import { attribute, attributeText, ResourcesApi, Upload, type Field, type MediaVersion } from './api'

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

it('rejects incompatible response shapes and retains unknown write outcomes', async () => {
  const api = new ResourcesApi(new Http(async () => Response.json({ ...resource, revision: 'wrong' })))
  const mutation = new Mutation()
  await expect(mutation.run('create', draft, (body, key) => api.createDraft(body, key))).rejects.toMatchObject({ code: 'incompatible', uncertain: true })
  expect(mutation.uncertain).toBe(true)
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
