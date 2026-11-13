// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from './api/transport'
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import SessionNotice from './ui/SessionNotice.vue';
import { createSessionStore, sessionKey } from './session'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const session = { authenticated: true, content_school_id: 'school', profile: { id: '00000000-0000-4000-8000-000000000001', nickname: 'A', nickname_required: false, bio: '', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true }, group_card_consent: { school: false, grade: false, department: false, name: false, student_id: false, gender: false, nickname: false }, revision: 1 }, csrf_token: 'a'.repeat(43), phone_bound: false, administrator: false, expires_at: '2030-01-01T00:00:00Z' }

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
    vi.useFakeTimers();
    const responses = [Response.json({ code: 'unauthenticated' }, { status: 401 }), Response.json({}, { status: 503 }), Response.json({ ...session, profile: { ...session.profile, revision: '1' } }), Response.json(session)]
    const store = createSessionStore(async () => responses.shift() ?? Response.json({}, { status: 500 }))
    await Promise.all([store.reload(), vi.advanceTimersByTimeAsync(8000)])
    expect(store.state.value).toBe('guest')
    await Promise.all([store.reload(), vi.advanceTimersByTimeAsync(8000)])
    expect(store.state.value).toBe('error')
    await Promise.all([store.reload(), vi.advanceTimersByTimeAsync(8000)])
    expect(store.state.value).toBe('error')
    await Promise.all([store.reload(), vi.advanceTimersByTimeAsync(8000)])
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


describe('session availability backoff', () => {
  it('coalesces 25 failures, waits with bounded backoff and preserves the signed-in snapshot', async () => {
    vi.useFakeTimers();
    let unavailable = false;
    const fetcher = vi.fn(async () => unavailable ? Response.json({}, { status: 503 }) : Response.json(session));
    const store = createSessionStore(fetcher);
    await store.reload();
    unavailable = true;
    await Promise.all(Array.from({ length: 25 }, () => store.reload()));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.unavailable.value).toBe(true);
    expect(store.state.value).toBe('member');
    expect(store.session.value?.profile.nickname).toBe('A');
    for (const delay of [1000, 2000, 4000, 8000, 8000]) {
      const before = fetcher.mock.calls.length;
      const pending = Array.from({ length: 25 }, () => store.reload());
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetcher).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all(pending);
      expect(fetcher).toHaveBeenCalledTimes(before + 1);
    }
    unavailable = false;
    const recovered = store.reload();
    await vi.advanceTimersByTimeAsync(8000);
    await recovered;
    expect(store.unavailable.value).toBe(false);
    expect(store.state.value).toBe('member');
  });

  it('clears the snapshot after an explicit rejection even after an outage', async () => {
    vi.useFakeTimers();
    const replies = [Response.json(session), Response.json({}, { status: 503 }), Response.json({}, { status: 401 })];
    const store = createSessionStore(async () => replies.shift() ?? Response.json({}, { status: 401 }));
    await store.reload();
    await store.reload();
    const rejected = store.reload();
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(store.session.value).toBeNull();
    expect(store.state.value).toBe('guest');
  });
});


it('the retry component backs off and leaves an in-progress form mounted', async () => {
  vi.useFakeTimers();
  let unavailable = false;
  const fetcher = vi.fn(async () => unavailable ? Response.json({}, { status: 503 }) : Response.json(session));
  const store = createSessionStore(fetcher);
  await store.reload();
  const app = createApp({ setup() {
    const draft = ref('unsaved input');
    return () => h('div', [store.state.value === 'member' ? h('input', { value: draft.value, onInput: (event: Event) => { if (event.target instanceof HTMLInputElement) draft.value = event.target.value; } }) : null, h(SessionNotice)]);
  } });
  app.provide(sessionKey, store);
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { account: { unavailable: 'Account unavailable' }, common: { retry: 'Retry' }, page: { session: { unavailable: 'Account unavailable' }, common: { retry: 'Retry' } } } } }));
  const root = document.createElement('div');
  app.mount(root);
  try {
    const input = root.querySelector('input');
    unavailable = true;
    await store.reload();
    await nextTick();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Account unavailable');
    expect(root.querySelector('input')).toBe(input);
    expect(input?.value).toBe('unsaved input');
    for (let i = 0; i < 25; i++) root.querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    unavailable = false;
    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('input')).toBe(input);
  } finally { app.unmount(); }
});
