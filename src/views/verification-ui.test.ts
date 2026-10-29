// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import VerificationView from './VerificationView.vue'
import CameraCapture from '../components/CameraCapture.vue'
const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), write: vi.fn() }))
vi.mock('../api/verification', async importOriginal => ({ ...await importOriginal<typeof import('../api/verification')>(), verification: api }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, d: () => 'date', n: (n: number) => String(n) }) }))
let app: App | undefined
let root: HTMLDivElement
const pending = { id: 'a', school_id: 's101', method: 'school_sso', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, school_challenge: { id: 'challenge', state: 'waiting_sms', expires_at: '2026-10-29T00:00:00Z', masked_phone: '***' } }
const school = (id: string) => ({ id, name: id, methods: ['school_sso'], material_types: [], profile_schema: 'bit.v1', notice_version: 'v1' })
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() } }
async function mount(component: Component) { root = document.createElement('div'); document.body.append(root); app = createApp(component); app.mount(root); await settle() }
function button(key: string) { const node = [...root.querySelectorAll('button')].filter(el => el.textContent?.trim() === key).at(-1); if (!node) throw new Error('missing button '+key); return node }
beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockImplementation(async (kind: string, path: string) => kind === 'School' ? (path.includes('after=') ? [school('s101')] : Array.from({ length: 100 }, (_, i) => school('s'+String(i).padStart(3, '0')))) : kind === 'Application' ? [pending] : [])
  api.get.mockResolvedValue({ campus_eligibility: false, identity_verified: false })
  api.write.mockResolvedValue(pending)
})
afterEach(() => { app?.unmount(); app = undefined; root?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('resumes a later-page student application after identity mode and keeps its school on refresh', async () => {
  await mount(VerificationView)
  button('verification.identityEntry').click(); await settle()
  button('verification.continue').click(); await settle()
  expect(button('verification.studentEntry').getAttribute('aria-pressed')).toBe('true')
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="verification.school"]')?.value).toBe('s101')
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="verification.method"]')?.value).toBe('school_sso')
  button('verification.refresh').click(); await settle()
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="verification.school"]')?.value).toBe('s101')
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="verification.method"]')?.value).toBe('school_sso')
})
it('does not let an older poll replace a successful SMS result', async () => {
  vi.useFakeTimers()
  let finish: ((value: unknown) => void) | undefined
  api.write.mockImplementation((_kind: string, _path: string, body: { action: string }) => body.action === 'poll' ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ ...pending, revision: 2, state: 'approved', school_challenge: { ...pending.school_challenge, state: 'succeeded' } }))
  await mount(VerificationView)
  button('verification.continue').click(); await settle()
  await vi.advanceTimersByTimeAsync(3000)
  const form = root.querySelector('.email-challenge form'); if (!form) throw new Error('missing SMS form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
  expect(root.textContent).toContain('verification.schoolStates.succeeded')
  if (!finish) throw new Error('poll did not start')
  finish(pending); await settle()
  expect(root.textContent).toContain('verification.schoolStates.succeeded')
  expect(root.querySelector('.email-challenge form')).toBeNull()
})
it('serializes camera startup and releases a stream returned after unmount', async () => {
  let finish: ((value: unknown) => void) | undefined
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] }
  const media = vi.fn(() => new Promise<unknown>(resolve => { finish = resolve }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } })
  await mount(CameraCapture)
  const start = button('verification.startCamera'); start.click(); start.click(); await settle()
  expect(media).toHaveBeenCalledTimes(1)
  app?.unmount(); app = undefined
  if (!finish) throw new Error('camera did not start')
  // The fake only implements getTracks, the browser operation used by cancellation.
  finish(stream); await settle()
  expect(stop).toHaveBeenCalledTimes(1)
})
