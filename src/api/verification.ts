import { sessionFetch } from './session';
import type { components } from './verification.gen'

type Schemas = components['schemas']
type Entity = 'StudentProfile' | 'Application' | 'School' | 'Credential' | 'Summary' | 'RemovalRequest' | 'Suggestion' | 'EmailChallenge' | 'CaptureSession' | 'Material' | 'Operation' | 'ManualInput' | 'Job'
export type { Schemas }
export class VerificationError extends Error {
  constructor(public readonly code: string, public readonly operationId?: string) { super(code) }
}
const codes = new Set(['invalid_input', 'authentication_required', 'permission_denied', 'not_found', 'conflict', 'identity_owned', 'expired', 'information_mismatch', 'rate_limited', 'dependency_unavailable', 'method_unavailable', 'processing'])
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const number = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const date = (v: unknown): v is string => {
  if (!text(v)) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(v)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0) && Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60 && Number.isFinite(Date.parse(v))
}
const expiry = (v: unknown): boolean => v === null || date(v)
const one = (v: unknown, choices: readonly string[]): boolean => text(v) && choices.includes(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
export const methods = ['real_name_identity_check', 'school_sso', 'student_email_outbound_otp', 'student_email_inbound_challenge', 'manual_material_review'] as const
export const stages = ['bachelor', 'master', 'doctor', 'other', 'unknown'] as const
export const kinds = ['student', 'alumni', 'newcomer', 'unknown'] as const

const challenge = (v: unknown): boolean => object(v) && text(v.id) && one(v.state, ['processing', 'waiting_sms', 'authenticated', 'failed', 'cancelled', 'expired']) && text(v.code) && text(v.masked_phone) && date(v.expires_at)
const fieldSources = (v: unknown): boolean => object(v) && Object.values(v).every(text)

export function parseEntity<K extends Entity>(kind: K, value: unknown): Schemas[K] {
  if (!object(value)) throw new VerificationError('incompatible')
  const v = value
  let valid = false
  switch (kind) {
    case 'StudentProfile': valid = text(v.school_id) && one(v.data_status, ['complete', 'partial', 'reference_only', 'unavailable']) && text(v.schema) && number(v.revision) && expiry(v.collected_at) && text(v.source_revision) && object(v.fields) && Object.keys(v.fields).length <= 64 && fieldSources(v.field_sources) && (v.raw_data === undefined || text(v.raw_data)); break
    case 'School': valid = text(v.id) && text(v.name) && typeof v.enabled === 'boolean' && Array.isArray(v.methods) && v.methods.every(m => one(m, methods)) && text(v.notice_version) && text(v.opening_date) && number(v.newcomer_days) && text(v.email_domain) && strings(v.material_types) && number(v.revision) && (v.profile_schema === undefined || text(v.profile_schema)); break
    case 'Application': valid = text(v.id) && text(v.school_id) && one(v.method, methods) && one(v.stage, stages) && one(v.kind, kinds) && one(v.state, ['in_progress', 'pending_review', 'supplement_required', 'approved', 'rejected', 'expired', 'deleted']) && number(v.revision) && date(v.created_at) && date(v.updated_at) && date(v.expires_at) && text(v.credential_id) && text(v.result_code) && (v.review_note === undefined || text(v.review_note)) && (v.qualification_expires_at === undefined || expiry(v.qualification_expires_at)) && (v.school_challenge === undefined || challenge(v.school_challenge)); break
    case 'Credential': valid = text(v.id) && text(v.school_id) && one(v.method, methods) && one(v.stage, stages) && one(v.kind, kinds) && one(v.state, ['active', 'revoked', 'expired', 'deleted']) && text(v.student_display) && number(v.revision) && date(v.verified_at) && expiry(v.expires_at); break
    case 'Summary': valid = typeof v.campus_eligibility === 'boolean' && typeof v.identity_verified === 'boolean' && date(v.evaluated_at) && number(v.revision) && expiry(v.next_evaluation_at); break
    case 'RemovalRequest': valid = text(v.id) && text(v.credential_id) && text(v.school_id) && one(v.kind, ['revoke', 'delete']) && one(v.state, ['pending', 'approved', 'rejected']) && text(v.reason) && text(v.note) && number(v.revision) && date(v.created_at); break
    case 'Suggestion': valid = text(v.id) && text(v.name) && text(v.website) && one(v.state, ['pending', 'approved', 'rejected']) && text(v.note) && number(v.revision); break
    case 'EmailChallenge': valid = text(v.id) && text(v.application_id) && date(v.expires_at) && one(v.state, ['queued', 'waiting', 'delivered', 'used', 'failed']) && text(v.masked_email) && text(v.target_address); break
    case 'CaptureSession': valid = text(v.token) && /^[A-Za-z0-9_-]{43}$/.test(v.token) && date(v.expires_at); break
    case 'Material': valid = text(v.id) && text(v.application_id) && one(v.content_type, ['image/jpeg', 'image/png', 'application/pdf']) && number(v.size) && date(v.created_at); break
    case 'Operation': valid = text(v.id) && one(v.state, ['processing', 'completed', 'failed']) && text(v.code) && date(v.expires_at); break
    case 'ManualInput': valid = text(v.student_id) && text(v.name) && text(v.department) && text(v.email) && text(v.material_type) && strings(v.material_ids) && number(v.revision); break
    case 'Job': valid = text(v.id) && text(v.school_id) && one(v.kind, ['mail', 'event']) && one(v.state, ['pending', 'running', 'manual', 'done']) && number(v.attempts) && text(v.code); break
  }
  if (!valid) throw new VerificationError('incompatible')
  // Each schema's required fields and enum/date shapes are checked above.
  return value as Schemas[K]
}

export class VerificationClient {
  private keys = new Map<string, string>()
  constructor(private readonly fetcher: typeof fetch = sessionFetch) {}
  private async response(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith('/api/v1/verification/') && !path.startsWith('/api/v1/admin/verification/')) throw new VerificationError('invalid_input')
    try {
      const fetcher = this.fetcher
      return await fetcher(path, { credentials: 'same-origin', redirect: 'error', ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) })
    } catch { throw new VerificationError('network') }
  }
  private async body(response: Response): Promise<unknown> {
    let value: unknown
    try { const raw = await response.text(); if (raw.length > 1 << 20) throw new Error('large'); value = JSON.parse(raw) } catch { throw new VerificationError('incompatible') }
    if (!response.ok) { const operationId = object(value) && text(value.operation_id) && /^[a-f0-9]{64}$/.test(value.operation_id) ? value.operation_id : undefined; throw new VerificationError(object(value) && text(value.code) && codes.has(value.code) ? value.code : 'dependency_unavailable', operationId) }
    return value
  }
  async get<K extends Entity>(kind: K, path: string, signal?: AbortSignal): Promise<Schemas[K]> {
    return parseEntity(kind, await this.body(await this.response(path, { signal })))
  }
  async list<K extends Entity>(kind: K, path: string, signal?: AbortSignal): Promise<Schemas[K][]> {
    const value = await this.body(await this.response(path, { signal }))
    if (!Array.isArray(value) || value.length > 100) throw new VerificationError('incompatible')
    return value.map(v => parseEntity(kind, v))
  }
  async write<K extends Entity>(kind: K, path: string, input?: unknown, method = 'POST', signal?: AbortSignal): Promise<Schemas[K]> {
    const body = input === undefined ? undefined : JSON.stringify(input)
    // The retry map contains a digest, never a password or identity form.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${method}\n${path}\n${body ?? ''}`))
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    let key = this.keys.get(fingerprint)
    if (!key) { key = crypto.randomUUID(); this.keys.set(fingerprint, key) }
    try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await this.response(path, { method, body, signal, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key } })
      const value = await this.body(response)
      if (response.status !== 202) { const result = parseEntity(kind, value); this.keys.delete(fingerprint); return result }
      if (!object(value) || !text(value.operation_id) || !/^[a-f0-9]{64}$/.test(value.operation_id)) throw new VerificationError('incompatible')
      await new Promise(resolve => setTimeout(resolve, 250))
      const operation = await this.get('Operation', `/api/v1/verification/operations/${value.operation_id}`, signal)
      if (operation.state === 'failed') { this.keys.delete(fingerprint); throw new VerificationError(codes.has(operation.code) ? operation.code : 'dependency_unavailable') }
      if (signal?.aborted) throw new VerificationError('network')
    }
    throw new VerificationError('processing')
    } catch (e) {
      if (e instanceof VerificationError && (e.operationId || ['invalid_input', 'authentication_required', 'permission_denied', 'not_found', 'conflict', 'identity_owned', 'expired', 'information_mismatch', 'rate_limited'].includes(e.code))) this.keys.delete(fingerprint)
      throw e
    }
  }
  async upload(token: string, image: Blob): Promise<Schemas['Material']> {
    const response = await this.response('/api/v1/verification/capture', { method: 'POST', body: image, headers: { 'Content-Type': image.type, 'X-Capture-Token': token } })
    return parseEntity('Material', await this.body(response))
  }
  async material(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await this.response(`/api/v1/verification/materials/${encodeURIComponent(id)}`, { signal })
    if (!response.ok) { await this.body(response); throw new VerificationError('dependency_unavailable') }
    const blob = await response.blob()
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type) || blob.size > 16 << 20) throw new VerificationError('incompatible')
    return blob
  }
  async consoleAccess(): Promise<boolean> {
    const value = await this.body(await this.response('/api/v1/admin/verification/access'))
    if (!object(value) || value.allowed !== true) throw new VerificationError('permission_denied')
    return true
  }
}
export const verification = new VerificationClient()
