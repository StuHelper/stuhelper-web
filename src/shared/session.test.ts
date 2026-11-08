import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from './api/transport'
import { createSessionStore } from './session'

afterEach(() => vi.unstubAllGlobals())
const session = { authenticated: true, profile: { id: '00000000-0000-4000-8000-000000000001', nickname: 'A', nickname_required: false, bio: '', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true }, revision: 1 }, csrf_token: 'a'.repeat(43), phone_bound: false, administrator: false, expires_at: '2030-01-01T00:00:00Z' }

describe('application session', () => {
  it('clears recent pages on every sign-out path', async () => {
    const removed: string[] = []
    vi.stubGlobal('localStorage', { removeItem: (key: string) => removed.push(key) })
    vi.stubGlobal('window', { location: { assign: () => {} } })
    await createSessionStore(async () => new Response(null, { status: 204 })).signOut(false)
    expect(removed).toEqual(['stuhelper.recent'])
  })

  it('adds the session-bound CSRF value on writes only and stays same-origin', async () => {
    vi.stubGlobal('window', { location: { href: 'https://app.example/', origin: 'https://app.example' } })
    vi.stubGlobal('document', { cookie: 'other=1; stuhelper_csrf=current-csrf' })
    const received: RequestInit[] = []
    vi.stubGlobal('fetch', function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBeUndefined()
      received.push(init ?? {})
      return Promise.resolve(Response.json({}))
    })
    await sessionFetch('/api/v1/profiles/me', { method: 'PUT' })
    await sessionFetch('/api/v1/auth/session')
    expect(new Headers(received[0]?.headers).get('X-CSRF-Token')).toBe('current-csrf')
    expect(new Headers(received[1]?.headers).get('X-CSRF-Token')).toBeNull()
    expect(received[0]?.credentials).toBe('same-origin')
    expect(() => sessionFetch('https://external.example/', { method: 'POST' })).toThrow('session_origin_mismatch')
  })

  it('distinguishes a guest from an unavailable or malformed session', async () => {
    const responses = [Response.json({ code: 'unauthenticated' }, { status: 401 }), Response.json({}, { status: 503 }), Response.json({ ...session, profile: { ...session.profile, revision: '1' } }), Response.json(session)]
    const store = createSessionStore(async () => responses.shift() ?? Response.json({}, { status: 500 }))
    await store.reload()
    expect(store.state.value).toBe('guest')
    await store.reload()
    expect(store.state.value).toBe('error')
    await store.reload()
    expect(store.state.value).toBe('error')
    await store.reload()
    expect(store.state.value).toBe('member')
    expect(store.session.value?.profile.nickname).toBe('A')
  })

  it('updates the profile with an idempotency key and keeps the session in sync', async () => {
    const calls: RequestInit[] = []
    const store = createSessionStore(async (_input, init) => {
      calls.push(init ?? {})
      return init?.method === 'PUT' ? Response.json({ ...session.profile, nickname: 'B', revision: 2 }) : Response.json(session)
    })
    await store.reload()
    await store.saveProfile({ nickname: 'B', revision: 1 }, 'key-1')
    expect(new Headers(calls[1]?.headers).get('Idempotency-Key')).toBe('key-1')
    expect(store.session.value?.profile).toEqual({ ...session.profile, nickname: 'B', revision: 2 })
  })
})
