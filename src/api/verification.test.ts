import sharedCases from '../../contracts/verification-cases.json'
import { describe, expect, it, vi } from 'vitest'
import { parseEntity, VerificationClient } from './verification'

const application = { id: 'a1', school_id: 'synthetic', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'in_progress', revision: 1, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z', expires_at: '2026-10-28T00:30:00Z', credential_id: '', result_code: '' }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
describe('verification contract boundary', () => {
  it('calls fetch without binding it to the client instance', async () => {
    const fetcher: typeof fetch = function (this: unknown) { expect(this).toBeUndefined(); return Promise.resolve(json(application)) }
    await new VerificationClient(fetcher).get('Application', '/api/v1/verification/applications/a1')
  })
  it('rejects malformed facts and unsupported method/status values', () => {
    expect(() => parseEntity('Summary', { campus_eligibility: true })).toThrow('incompatible')
    expect(() => parseEntity('Application', { ...application, state: 'unexpected' })).toThrow('incompatible')
    expect(() => parseEntity('Application', { ...application, revision: '1' })).toThrow('incompatible')
    expect(parseEntity('Application', application).id).toBe('a1')
  })
  it('retains the idempotency key after a lost response and uses a new one for a new intent', async () => {
    const keys: string[] = []
    let fail = true
    const fetcher: typeof fetch = vi.fn(async (_url, init) => { keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? ''); if (fail) { fail = false; throw new Error('network') } return json(application) })
    const client = new VerificationClient(fetcher)
    await expect(client.write('Application', '/api/v1/verification/applications', { school_id: 'synthetic' })).rejects.toThrow('network')
    await client.write('Application', '/api/v1/verification/applications', { school_id: 'synthetic' })
    await client.write('Application', '/api/v1/verification/applications', { school_id: 'different' })
    expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[0])
  })
  it('starts a fresh attempt only after a known durable failure', async () => {
    const keys: string[] = []
    const fetcher: typeof fetch = vi.fn(async (_url, init) => { keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? ''); return keys.length === 1 ? json({ code: 'dependency_unavailable', operation_id: 'a'.repeat(64) }, 503) : json(application) })
    const client = new VerificationClient(fetcher)
    await expect(client.write('Application', '/api/v1/verification/applications', {})).rejects.toThrow('dependency_unavailable')
    await client.write('Application', '/api/v1/verification/applications', {})
    expect(keys[0]).not.toBe(keys[1])
  })
  it('keeps the same key when a gateway cannot confirm the outcome', async () => {
    const keys: string[] = []
    const fetcher: typeof fetch = vi.fn(async (_url, init) => { keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? ''); return keys.length === 1 ? json({ code: 'dependency_unavailable' }, 503) : json(application) })
    const client = new VerificationClient(fetcher)
    await expect(client.write('Application', '/api/v1/verification/applications', {})).rejects.toThrow('dependency_unavailable')
    await client.write('Application', '/api/v1/verification/applications', {})
    expect(keys[0]).toBe(keys[1])
  })
  it('requires a positive current console authorization and never trusts local role hints', async () => {
    const client = new VerificationClient(vi.fn(async () => json({ allowed: false })))
    await expect(client.consoleAccess()).rejects.toThrow('permission_denied')
  })
})

for (const sample of sharedCases.cases) {
  it(`shared contract: ${sample.name}`, () => {
    if (!['Summary', 'Application', 'School'].includes(sample.kind)) throw new Error('unknown shared fixture schema')
    // The fixture schema name is checked against the supported contract cases above.
    const parse = () => parseEntity(sample.kind as 'Summary' | 'Application' | 'School', sample.body)
    if (sample.accepted) expect(parse).not.toThrow()
    else expect(parse).toThrow('incompatible')
  })
}
