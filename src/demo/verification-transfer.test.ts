import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseEntity, type Schemas } from '../features/verification/api'
import { verification } from './data'
import { verificationRoute } from './verification'

const consentPath = '/email-transfer-consent'
const firstAccepted = '2026-11-22T06:00:00.000Z'

function request(path: string, method = 'GET', body?: unknown) {
  return verificationRoute('/verification' + path, method, body === undefined ? undefined : { body: JSON.stringify(body) }, 'unverified', [])!
}

async function createEmailApplication() {
  const response = request('/applications', 'POST', {
    school_id: verification.school.id, method: 'student_email_outbound_otp', stage: 'unknown', kind: 'student', consent: true,
  })
  const application = parseEntity('Application', await response.json())
  return `/applications/${application.id}/email`
}

async function consentStatus() {
  return parseEntity('EmailTransferConsentStatus', await request(consentPath).json())
}

async function currentChoice(): Promise<Schemas['EmailTransferConsentInput']> {
  const { document_id, version, digest } = (await consentStatus()).document
  return { document_id, version, digest, accepted: true }
}

function sendCode(path: string, studentId: string, choice?: unknown) {
  return request(path, 'POST', { student_id: studentId, name: 'Demo Student', email_transfer_consent: choice })
}

async function expectProblem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(parseEntity('Problem', await response.json()).code).toBe(code)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(firstAccepted))
  // A new persona has no prior demo session state.
  verificationRoute('/verification/schools', 'GET', undefined, 'guest', [])
})

afterEach(() => vi.useRealTimers())

it('requires the current outbound choice and reuses account consent for another recipient and application', async () => {
  const path = await createEmailApplication()
  const initial = await consentStatus()
  expect(initial).toMatchObject({ accepted: false, document: { document_id: 'email-transfer' } })
  expect(initial.accepted_at).toBeUndefined()
  const choice = await currentChoice()

  await expectProblem(sendCode(path, '21A234'), 403, 'email_transfer_consent_required')
  await expectProblem(sendCode(path, '21A234', { ...choice, accepted: false }), 403, 'email_transfer_consent_required')
  await expectProblem(sendCode(path, '21A234', { ...choice, version: 'demo-v0' }), 409, 'email_transfer_consent_changed')
  await expectProblem(sendCode(path, '21A234', { ...choice, digest: 'b'.repeat(64) }), 409, 'email_transfer_consent_changed')
  await expectProblem(sendCode(path, '21A234', { ...choice, digest: 'invalid' }), 400, 'invalid_input')
  await expectProblem(request(path), 404, 'not_found')
  expect(await consentStatus()).toEqual(initial)

  const first = sendCode(path, '21A234', choice)
  expect(first.status).toBe(201)
  const challenge = parseEntity('EmailChallenge', await first.json())
  expect(challenge.state).toBe('queued')
  expect(await consentStatus()).toEqual({ ...initial, accepted: true, accepted_at: firstAccepted })

  vi.setSystemTime(new Date('2026-11-22T06:01:00.000Z'))
  const resend = sendCode(path, ' 21a234 ')
  expect(resend.status).toBe(201)
  expect(parseEntity('EmailChallenge', await resend.json()).id).not.toBe(challenge.id)
  expect((await consentStatus()).accepted_at).toBe(firstAccepted)
  expect(sendCode(await createEmailApplication(), '21A234').status).toBe(201)
  expect(sendCode(path, '22B234').status).toBe(201)
})

it('withdraws outbound receipts, blocks queued delivery and preserves an already sent code', async () => {
  const choice = await currentChoice()
  const delivered = await createEmailApplication()
  expect(sendCode(delivered, '21A234', choice).status).toBe(201)

  vi.setSystemTime(new Date('2026-11-22T06:01:00.000Z'))
  const queued = await createEmailApplication()
  expect(sendCode(queued, '22B234', choice).status).toBe(201)

  const withdrawal = request(consentPath, 'DELETE')
  expect(withdrawal.status).toBe(200)
  expect(parseEntity('EmailTransferWithdrawal', await withdrawal.json()).withdrawn).toBe(true)
  expect(await consentStatus()).toMatchObject({ accepted: false })
  expect((await consentStatus()).accepted_at).toBeUndefined()

  vi.setSystemTime(new Date('2026-11-22T06:02:00.000Z'))
  expect(parseEntity('EmailChallenge', await request(queued).json()).state).toBe('failed')
  await expectProblem(sendCode(queued, '22B234'), 403, 'email_transfer_consent_required')
  await expectProblem(request(queued + '/confirm', 'POST', { code: '123456' }), 409, 'conflict')

  expect(parseEntity('EmailChallenge', await request(delivered).json()).state).toBe('delivered')
  const confirmation = request(delivered + '/confirm', 'POST', { code: '123456' })
  expect(parseEntity('Application', await confirmation.json()).state).toBe('approved')
  expect(sendCode(queued, '22B234', choice).status).toBe(201)
  expect(await consentStatus()).toMatchObject({ accepted: true, accepted_at: '2026-11-22T06:02:00.000Z' })
})
