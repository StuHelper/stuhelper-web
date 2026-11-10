import { describe, expect, it, vi } from 'vitest'
import sharedCases from '../../../contracts/verification-cases.json'
import { Http } from '../../shared/api/http'
import { parseEntity, VerificationApi, maskedIdentity } from './api'

const application = { id: 'a1', school_id: 'synthetic', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z', expires_at: '2026-10-28T00:30:00Z', credential_id: '', result_code: '' }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const client = (fetcher: typeof fetch) => new VerificationApi(new Http(fetcher))
const keyOf = (init?: RequestInit) => new Headers(init?.headers).get('Idempotency-Key') ?? ''

describe('verification contract boundary', () => {
  it('rejects malformed facts and unsupported method or state values', () => {
    expect(() => parseEntity('Summary', { campus_eligibility: true })).toThrow('incompatible')
    expect(() => parseEntity('Application', { ...application, state: 'unexpected' })).toThrow('incompatible')
    expect(() => parseEntity('Application', { ...application, revision: '1' })).toThrow('incompatible')
    expect(() => parseEntity('Application', { ...application, created_at: '2026-02-30T00:00:00Z' })).toThrow('incompatible')
    expect(parseEntity('Application', application).id).toBe('a1')
  })

  it('accepts teacher records only with known, distinct disclosure choices', () => {
    const credential = { id: 'tc', school_id: 'synthetic', teacher_ids: ['p1'], state: 'active', revision: 1, verified_at: '2026-10-28T00:00:00Z', expires_at: null, source: 'manual_material_review', note: '', disclosures: ['teacher'] }
    expect(parseEntity('TeacherCredential', credential).teacher_ids).toEqual(['p1'])
    expect(() => parseEntity('TeacherCredential', { ...credential, disclosures: ['teacher', 'teacher'] })).toThrow('incompatible')
    expect(() => parseEntity('TeacherCredential', { ...credential, disclosures: ['phone'] })).toThrow('incompatible')
    expect(() => parseEntity('TeacherCredential', { ...credential, state: 'pending' })).toThrow('incompatible')
    const form = { name: 'Lin', organization: 'School', email: 'lin@example.invalid', material_type: 'staff_card', material_ids: ['m1'], disclosures: [], revision: 1 }
    expect(parseEntity('TeacherForm', form).disclosures).toEqual([])
    expect(() => parseEntity('TeacherForm', { ...form, material_ids: ['1', '2', '3', '4', '5', '6'] })).toThrow('incompatible')
  })

  it('retains the idempotency key after a lost response and uses a new one for a new intent', async () => {
    const keys: string[] = []
    let fail = true
    const api = client(vi.fn(async (_url, init) => {
      keys.push(keyOf(init))
      if (fail) {
        fail = false
        throw new Error('network')
      }
      return json(application)
    }))
    await expect(api.write('Application', '/api/v1/verification/applications', { school_id: 'synthetic' })).rejects.toMatchObject({ code: 'network' })
    await api.write('Application', '/api/v1/verification/applications', { school_id: 'synthetic' })
    await api.write('Application', '/api/v1/verification/applications', { school_id: 'different' })
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('starts a fresh attempt only after a known durable failure', async () => {
    const keys: string[] = []
    const api = client(vi.fn(async (_url, init) => {
      keys.push(keyOf(init))
      return keys.length === 1 ? json({ code: 'dependency_unavailable', operation_id: 'a'.repeat(64) }, 503) : json(application)
    }))
    await expect(api.write('Application', '/api/v1/verification/applications', {})).rejects.toMatchObject({ code: 'unavailable', uncertain: false })
    await api.write('Application', '/api/v1/verification/applications', {})
    expect(keys[0]).not.toBe(keys[1])
  })

  it('keeps the same key when a gateway cannot confirm the outcome', async () => {
    const keys: string[] = []
    const api = client(vi.fn(async (_url, init) => {
      keys.push(keyOf(init))
      return keys.length === 1 ? json({ code: 'dependency_unavailable' }, 503) : json(application)
    }))
    await expect(api.write('Application', '/api/v1/verification/applications', {})).rejects.toMatchObject({ uncertain: true })
    await api.write('Application', '/api/v1/verification/applications', {})
    expect(keys[0]).toBe(keys[1])
  })

  it('follows a processing operation and resends the same request until it completes', async () => {
    const calls: string[] = []
    const api = client(vi.fn(async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`)
      if (String(url).includes('/operations/')) return json({ id: 'op', state: 'processing', code: '', expires_at: '2030-01-01T00:00:00Z' })
      return calls.length === 1 ? json({ operation_id: 'b'.repeat(64) }, 202) : json(application)
    }))
    await expect(api.write('Application', '/api/v1/verification/applications', {})).resolves.toMatchObject({ id: 'a1' })
    expect(calls).toEqual(['POST /api/v1/verification/applications', `GET /api/v1/verification/operations/${'b'.repeat(64)}`, 'POST /api/v1/verification/applications'])
  })

  it('reads list pages with the last id as the next cursor', async () => {
    const api = client(async () => json(Array.from({ length: 25 }, (_, index) => ({ ...application, id: `a${index}` }))))
    await expect(api.list('Application', '/api/v1/verification/applications')).resolves.toMatchObject({ next: 'a24' })
  })
})

for (const sample of sharedCases.cases) {
  it(`shared contract: ${sample.name}`, () => {
    if (!['Summary', 'Application', 'School', 'IdentityMasked', 'IdentityInput', 'VerifyInput'].includes(sample.kind)) throw new Error('unknown shared fixture schema')
    // The fixture schema name is checked against the supported contract cases above.
    const parse = () => parseEntity(sample.kind as 'Summary' | 'Application' | 'School' | 'IdentityMasked' | 'IdentityInput' | 'VerifyInput', sample.body)
    if (sample.accepted) expect(parse).not.toThrow()
    else expect(parse).toThrow('incompatible')
  })
}

describe('maskedIdentity', () => {
  const base = { campus_eligibility: true, teacher_verified: false, identity_verified: true, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null }
  it('shows the server mask, whose star count follows the hidden code points', () => {
    const summary = parseEntity('Summary', { ...base, identity_masked: { name: '**航', document_number: `1${'*'.repeat(16)}X` } })
    expect(maskedIdentity(summary)).toEqual({ name: '**航', number: `1${'*'.repeat(16)}X` })
  })
  it('rejects unmasked values and masks on an unverified summary', () => {
    expect(() => parseEntity('Summary', { ...base, identity_masked: { name: '小航', document_number: '1108' } })).toThrow('incompatible')
    expect(() => parseEntity('Summary', { ...base, identity_verified: false, identity_masked: { name: '*航', document_number: '1**8' } })).toThrow('incompatible')
    expect(maskedIdentity(parseEntity('Summary', base))).toBeUndefined()
  })
})
