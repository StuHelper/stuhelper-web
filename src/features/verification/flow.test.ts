// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { ApiError } from '../../shared/api/errors'
import CameraCapture from './CameraCapture.vue'
import { useVerificationFlow } from './flow'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), write: vi.fn(), upload: vi.fn(), material: vi.fn() }))
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

it('keeps failed verification inputs and separates action errors from loading errors', async () => {
  const flow = mountFlow()
  await flow.reload()
  await flow.resume({ ...pending, school_challenge: undefined } as never)
  Object.assign(flow.form, { student_id: '20260001', name: 'Synthetic Student', document_number: 'TEST0001' })
  api.write.mockRejectedValue(new ApiError('information_mismatch'))
  await flow.submit()
  expect(flow.error.value).toBe('information_mismatch')
  expect(flow.loadError.value).toBe('')
  expect(flow.form).toMatchObject({ student_id: '20260001', name: 'Synthetic Student', document_number: 'TEST0001' })
  api.list.mockRejectedValue(new ApiError('network'))
  await flow.reload()
  expect(flow.loadError.value).toBe('network')
  expect(flow.form.student_id).toBe('20260001')
})

it('uses only the selected credential time and clears profile context on refresh and failure', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.credentials.value = [{ id: 'a', verified_at: '2026-11-14T00:00:00Z' }, { id: 'b', verified_at: '2025-01-01T00:00:00Z' }] as never
  api.get.mockResolvedValue({ fields: {}, collected_at: '2020-01-01T00:00:00Z' })
  await flow.showProfile('b')
  expect(flow.profileCredential.value?.verified_at).toBe('2025-01-01T00:00:00Z')
  await flow.showProfile('missing')
  expect(flow.profileCredential.value).toBeUndefined()
  api.get.mockRejectedValue(new ApiError('unavailable'))
  await flow.showProfile('a')
  expect(flow.profile.value).toBeUndefined()
  expect(flow.profileCredential.value).toBeUndefined()
  expect(flow.errorTarget.value).toBe('profile')
  await flow.reload()
  expect(flow.profileCredential.value).toBeUndefined()
})

it('uses method capabilities to hide study stage while preserving manual identity selection', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.schools.value.push({ ...school('configured'), enabled: true, opening_date: '', newcomer_days: 90, email_domain: '', revision: 1, methods: ['manual_material_review'], profile_schema: 'custom.v1', method_capabilities: { manual_material_review: { study_stage_required: false, allowed_kinds: ['student', 'alumni'] } } })
  flow.selectedSchool.value = 'configured'
  flow.selectedMethod.value = 'manual_material_review'
  await settle()
  expect(flow.chooseStudy.value).toBe(true)
  expect(flow.chooseStage.value).toBe(false)
  flow.kind.value = 'alumni'
  flow.consent.value = true
  await flow.start()
  expect(api.write).toHaveBeenCalledWith('Application', '/api/v1/verification/applications', expect.objectContaining({ stage: 'unknown', kind: 'alumni' }))
})

it('restored email resend reopens identity inputs without submitting hidden empty values', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.schools.value = [{ ...school('s101'), methods: ['student_email_outbound_otp'] }] as never
  const restored = { ...pending, method: 'student_email_outbound_otp', school_challenge: undefined }
  api.get.mockImplementation(async (kind: string) => kind === 'EmailChallenge' ? { id: 'mail', application_id: restored.id, state: 'delivered' } : {})
  Object.assign(flow.form, { student_id: 'previous-user', name: 'Previous Person' })
  await flow.resume(restored as never)
  expect(flow.form.student_id).toBe('')
  expect(flow.form.name).toBe('')
  expect(flow.email.value?.id).toBe('mail')
  await flow.resendEmail()
  expect(api.write).not.toHaveBeenCalled()
  expect(flow.email.value).toBeUndefined()
  expect(flow.active.value?.id).toBe(restored.id)
  Object.assign(flow.form, { student_id: '20260001', name: 'Synthetic Student' })
  api.write.mockResolvedValue({ id: 'mail-new', application_id: restored.id, state: 'queued' })
  await flow.submit()
  expect(api.write).toHaveBeenCalledWith('EmailChallenge', `/api/v1/verification/applications/${restored.id}/email`, { student_id: '20260001', name: 'Synthetic Student' })
  expect(flow.email.value?.id).toBe('mail-new')
})

// A school in the shape of the BUAA configuration: no study stage, the school account only for current students.
const buaa = {
  id: 'buaa', name: 'buaa', profile_schema: 'buaa.imported.v1', notice_version: 'v3', material_types: ['student_card'],
  methods: ['real_name_identity_check', 'school_sso', 'student_email_outbound_otp', 'manual_material_review'],
  method_capabilities: {
    real_name_identity_check: { study_stage_required: false, allowed_kinds: ['student', 'alumni'] },
    school_sso: { study_stage_required: false, allowed_kinds: ['student'] },
    student_email_outbound_otp: { study_stage_required: false, allowed_kinds: ['student', 'alumni'] },
    manual_material_review: { study_stage_required: false, allowed_kinds: ['student', 'alumni', 'newcomer'] },
  },
}
const record = (state: string, updated_at: string, values: Record<string, unknown> = {}) => ({ id: `${state}-${updated_at}`, school_id: 'buaa', method: 'manual_material_review', stage: 'unknown', kind: 'student', state, revision: 1, updated_at, ...values })
function serve(values: { applications?: unknown[]; credentials?: unknown[]; eligible?: boolean }) {
  api.list.mockImplementation(async (kind: string) => ({ items: kind === 'School' ? [buaa] : kind === 'Application' ? values.applications ?? [] : kind === 'Credential' ? values.credentials ?? [] : [], next: '' }))
  api.get.mockResolvedValue({ campus_eligibility: values.eligible ?? false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null })
}

it('offers each identity only the methods the school allows it and keeps the choice valid', async () => {
  serve({})
  const flow = mountFlow()
  await flow.reload()
  expect(flow.kindChoices.value).toEqual(['student', 'alumni', 'newcomer'])
  expect(flow.chooseStage.value).toBe(false)
  // A current student may use all four methods.
  expect(flow.availableMethods.value.filter(flow.methodAllowed)).toEqual(buaa.methods)
  flow.chooseMethod('school_sso')
  flow.consent.value = true
  // An alumnus loses the school account; the selection moves to a method that is allowed, and consent is asked again.
  flow.chooseKind('alumni')
  expect(flow.availableMethods.value.filter(flow.methodAllowed)).toEqual(['real_name_identity_check', 'student_email_outbound_otp', 'manual_material_review'])
  expect(flow.selectedMethod.value).toBe('real_name_identity_check')
  expect(flow.consent.value).toBe(false)
  flow.chooseMethod('school_sso')
  expect(flow.selectedMethod.value).toBe('real_name_identity_check')
  // A temporary newcomer exists only in manual review.
  flow.chooseKind('newcomer')
  expect(flow.availableMethods.value.filter(flow.methodAllowed)).toEqual(['manual_material_review'])
  expect(flow.selectedMethod.value).toBe('manual_material_review')
  // The application carries the chosen identity and no study stage; the server decides the rest.
  flow.consent.value = true
  await flow.start()
  expect(api.write).toHaveBeenCalledWith('Application', '/api/v1/verification/applications', expect.objectContaining({ method: 'manual_material_review', kind: 'newcomer', stage: 'unknown', consent: true, notice_version: 'v3' }))
})

it('derives one standing from the summary, the applications and the credentials', async () => {
  const flow = mountFlow()
  const standing = async (values: Parameters<typeof serve>[0]) => { serve(values); await flow.reload(); return flow.standing.value }
  expect(flow.standing.value).toBe('unknown')
  expect(await standing({})).toBe('none')
  expect(await standing({ eligible: true, applications: [record('rejected', '2026-11-02T00:00:00Z')] })).toBe('verified')
  expect(await standing({ applications: [record('rejected', '2026-11-02T00:00:00Z'), record('pending_review', '2026-11-01T00:00:00Z')] })).toBe('review')
  expect(await standing({ applications: [record('supplement_required', '2026-11-01T00:00:00Z'), record('in_progress', '2026-11-02T00:00:00Z')] })).toBe('supplement')
  expect(await standing({ applications: [record('in_progress', '2026-11-01T00:00:00Z')] })).toBe('draft')
  // Only the latest outcome counts as a rejection; an older one followed by an expiry does not.
  expect(await standing({ applications: [record('rejected', '2026-11-02T00:00:00Z', { review_note: 'blurred' }), record('expired', '2026-11-01T00:00:00Z')] })).toBe('rejected')
  expect(flow.standingApplication.value?.review_note).toBe('blurred')
  expect(await standing({ applications: [record('rejected', '2026-11-01T00:00:00Z'), record('expired', '2026-11-02T00:00:00Z')], credentials: [{ id: 'c', school_id: 'buaa', state: 'expired' }] })).toBe('lapsed')
  // A teacher application never changes the student standing.
  expect(await standing({ applications: [record('pending_review', '2026-11-03T00:00:00Z', { kind: 'teacher' })] })).toBe('none')
})

it('moves a created inbound email challenge to step three, where its one-time address is shown', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.schools.value = [{ ...school('s101'), methods: ['student_email_inbound_challenge'] }] as never
  const inbound = { ...pending, method: 'student_email_inbound_challenge', school_challenge: undefined }
  api.get.mockImplementation(async (kind: string) => { if (kind === 'EmailChallenge') throw new ApiError('not_found'); return {} })
  await flow.resume(inbound as never)
  expect(flow.step.value).toBe(2)
  Object.assign(flow.form, { student_id: '20260001', name: 'Synthetic Student' })
  api.write.mockResolvedValue({ id: 'mail', application_id: inbound.id, state: 'waiting', masked_email: '20****01@example.edu', target_address: 'verify-1@example.edu' })
  await flow.submit()
  expect(flow.email.value?.target_address).toBe('verify-1@example.edu')
  expect(flow.writable.value).toBe(true)
  expect(flow.step.value).toBe(3)
})

it('holds step three only while the school login waits and returns to the form after it ends', async () => {
  const flow = mountFlow()
  await flow.reload()
  await flow.resume(pending as never)
  expect(flow.step.value).toBe(3)
  flow.active.value = { ...pending, school_challenge: { ...pending.school_challenge, state: 'processing' } } as never
  expect(flow.step.value).toBe(3)
  for (const state of ['failed', 'cancelled', 'expired']) {
    flow.active.value = { ...pending, school_challenge: { ...pending.school_challenge, state, code: 'school_credentials_rejected' } } as never
    expect(flow.writable.value).toBe(true)
    expect(flow.step.value).toBe(2)
  }
  // Continuing the same application from the records also opens the form for another try.
  flow.backToMethod()
  await flow.resume({ ...pending, school_challenge: { ...pending.school_challenge, state: 'expired' } } as never)
  expect(flow.step.value).toBe(2)
  // An application that left the form waits on step three whatever its challenge.
  flow.active.value = { ...pending, state: 'pending_review', school_challenge: { ...pending.school_challenge, state: 'failed' } } as never
  expect(flow.step.value).toBe(3)
})

it('keeps a failed profile request on the credential that asked for it', async () => {
  const flow = mountFlow()
  await flow.reload()
  flow.credentials.value = [{ id: 'a', verified_at: '2026-11-14T00:00:00Z' }, { id: 'b', verified_at: '2025-01-01T00:00:00Z' }] as never
  api.get.mockRejectedValue(new ApiError('unavailable'))
  await flow.showProfile('b')
  expect(flow.errorTarget.value).toBe('profile')
  expect(flow.error.value).toBe('unavailable')
  expect(flow.profileRequestId.value).toBe('b')
  expect(flow.profileCredential.value).toBeUndefined()
  api.get.mockResolvedValue({ fields: {}, collected_at: '2020-01-01T00:00:00Z' })
  await flow.showProfile('a')
  expect(flow.profileRequestId.value).toBe('a')
  expect(flow.error.value).toBe('')
  await flow.reload()
  expect(flow.profileRequestId.value).toBe('')
})
