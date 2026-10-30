// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import CameraCapture from './CameraCapture.vue'
import { useVerificationFlow } from './flow'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), write: vi.fn(), upload: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), useVerification: () => api }))

const pending = { id: 'a', school_id: 's101', method: 'school_sso', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, school_challenge: { id: 'challenge', state: 'waiting_sms', code: '', expires_at: '2026-10-29T00:00:00Z', masked_phone: '***' } }
const school = (id: string) => ({ id, name: id, methods: ['school_sso'], material_types: [], profile_schema: 'bit.v1', notice_version: 'v1' })
let app: App | undefined

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mountFlow() {
  let flow: ReturnType<typeof useVerificationFlow> | undefined
  app = createApp({ setup() { flow = useVerificationFlow(); return () => h('div') } })
  app.mount(document.createElement('div'))
  if (!flow) throw new Error('flow not mounted')
  return flow
}

beforeEach(() => {
  vi.clearAllMocks()
  // The first school page is full, so the application's school is on the next page.
  api.list.mockImplementation(async (kind: string, _path: string, options: { after?: string } = {}) => {
    if (kind === 'School') return options.after ? { items: [school('s101')], next: '' } : { items: Array.from({ length: 100 }, (_, i) => school(`s${String(i).padStart(3, '0')}`)), next: 's099' }
    if (kind === 'Application') return { items: [pending], next: '' }
    return { items: [], next: '' }
  })
  api.get.mockResolvedValue({ campus_eligibility: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null })
  api.write.mockResolvedValue(pending)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('resumes a later-page student application after identity mode and keeps its school on refresh', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.selectMode('identity')
  await flow.resume(pending as never)
  expect(flow.mode.value).toBe('student')
  expect(flow.selectedSchool.value).toBe('s101')
  expect(flow.selectedMethod.value).toBe('school_sso')
  await flow.reload()
  expect(flow.selectedSchool.value).toBe('s101')
  expect(flow.selectedMethod.value).toBe('school_sso')
})

it('does not let an older poll replace a successful SMS result', async () => {
  vi.useFakeTimers()
  let finish: ((value: unknown) => void) | undefined
  api.write.mockImplementation((_kind: string, _path: string, body: { action: string }) => (body.action === 'poll' ? new Promise((resolve) => { finish = resolve }) : Promise.resolve({ ...pending, revision: 2, state: 'approved', school_challenge: { ...pending.school_challenge, state: 'authenticated' } })))
  const flow = mountFlow()
  await flow.reload()
  await flow.resume(pending as never)
  await settle()
  await vi.advanceTimersByTimeAsync(3000)
  if (!finish) throw new Error('poll did not start')
  flow.smsCode.value = '1234'
  await flow.continueSchool('submit_sms')
  expect(flow.active.value?.state).toBe('approved')
  finish(pending)
  await settle()
  expect(flow.active.value?.state).toBe('approved')
})

it('clears passwords after every submission attempt', async () => {
  api.write.mockRejectedValue(Object.assign(new Error('information_mismatch'), { code: 'information_mismatch' }))
  const flow = mountFlow()
  await flow.reload()
  await flow.resume(pending as never)
  flow.form.password = 'secret'
  await flow.submit()
  expect(flow.form.password).toBe('')
})

it('serializes camera startup and releases a stream returned after unmount', async () => {
  let finish: ((value: unknown) => void) | undefined
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] }
  const media = vi.fn(() => new Promise<unknown>((resolve) => { finish = resolve }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } })
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', missingWarn: false, fallbackWarn: false, messages: { 'zh-CN': {} } })
  const root = document.createElement('div')
  app = createApp(CameraCapture).use(i18n)
  app.mount(root)
  await settle()
  const start = [...root.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'verification.capture.start')
  if (!start) throw new Error('missing start button')
  start.click()
  start.click()
  await settle()
  expect(media).toHaveBeenCalledTimes(1)
  app.unmount()
  app = undefined
  if (!finish) throw new Error('camera did not start')
  // The fake only implements getTracks, the browser operation used by cancellation.
  finish(stream)
  await settle()
  expect(stop).toHaveBeenCalledTimes(1)
})
