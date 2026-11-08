import type { components } from '../../api/verification.gen'
import { ApiError, isUncertain } from '../../shared/api/errors'
import { readLimited, segment, type Http } from '../../shared/api/http'
import { useHttp } from '../../shared/session'

export type Schemas = components['schemas']
export type Application = Schemas['Application']
export type School = Schemas['School']
export type Credential = Schemas['Credential']
export type Summary = Schemas['Summary']

/**
 * 已实名时展示的脱敏信息：姓名最后一个字，证件号第一位和最后一位。
 * 脱敏必须由服务端完成，完整姓名和证件号不能下发到客户端。这个字段还没有进入 OpenAPI，
 * 所以在运行时校验。星号数量固定，不暴露姓名和证件号的真实长度。
 */
/** The server-generated identity mask, present on the caller's own verified summary. */
export function maskedIdentity(summary: Summary | undefined) {
  const masked = summary?.identity_verified ? summary.identity_masked : undefined
  return masked ? { name: masked.name, number: masked.document_number } : undefined
}
export type RemovalRequest = Schemas['RemovalRequest']
export type Material = Schemas['Material']
export type EmailChallenge = Schemas['EmailChallenge']
export type StudentProfile = Schemas['StudentProfile']
export type Method = Schemas['Method']
export type Stage = Schemas['Stage']
export type Kind = Schemas['Kind']
export type TeacherForm = Schemas['TeacherForm']
export type TeacherCredential = Schemas['TeacherCredential']
export type TeacherDisclosure = Schemas['TeacherDisclosures'][number]
export const teacherDisclosures: TeacherDisclosure[] = ['real_name', 'teacher', 'gender', 'organization']

type Entity = 'StudentProfile' | 'Application' | 'School' | 'Credential' | 'Summary' | 'IdentityMasked' | 'IdentityInput' | 'VerifyInput' | 'RemovalRequest' | 'Suggestion' | 'EmailChallenge' | 'CaptureSession' | 'Material' | 'Operation' | 'ManualInput' | 'TeacherForm' | 'TeacherCredential'

export const methods = ['real_name_identity_check', 'school_sso', 'student_email_outbound_otp', 'student_email_inbound_challenge', 'manual_material_review'] as const
export const stages = ['bachelor', 'master', 'doctor', 'other', 'unknown'] as const
export const kinds = ['student', 'alumni', 'newcomer', 'unknown'] as const
/** Application and credential kinds; teacher applications use the teacher form and review. */
const recordKinds = [...kinds, 'teacher'] as const

// The verification contract is YAML and private-provider owned, so its
// response shapes are checked here field by field. The provider's shared cases
// (contracts/verification-cases.json) run against these checks.
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
/** Lengths in Unicode code points, matching the provider's limits. */
const points = (v: string) => [...v].length
const sized = (v: unknown, min: number, max: number): v is string => text(v) && points(v) >= min && points(v) <= max
const masked = (v: unknown) => object(v) && Object.keys(v).length === 2 && sized(v.name, 2, 100) && /^\*+[^*]$/u.test(v.name) && sized(v.document_number, 3, 32) && /^[^*]\*+[^*]$/u.test(v.document_number)
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const instant = (v: unknown): v is string => {
  if (!text(v)) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(v)
  if (!match) return false
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0) && hour < 24 && minute < 60 && second < 60 && Number.isFinite(Date.parse(v))
}
const optionalInstant = (v: unknown) => v === null || instant(v)
const oneOf = (v: unknown, choices: readonly string[]) => text(v) && choices.includes(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const disclosures = (v: unknown) => Array.isArray(v) && v.length <= 4 && new Set(v).size === v.length && v.every((item) => oneOf(item, ['real_name', 'teacher', 'gender', 'organization']))
const challenge = (v: unknown) => object(v) && text(v.id) && oneOf(v.state, ['processing', 'waiting_sms', 'authenticated', 'failed', 'cancelled', 'expired']) && text(v.code) && text(v.masked_phone) && instant(v.expires_at)

const checks: Record<Entity, (v: Record<string, unknown>) => boolean> = {
  StudentProfile: (v) => text(v.school_id) && oneOf(v.data_status, ['complete', 'partial', 'reference_only', 'unavailable']) && text(v.schema) && count(v.revision) && optionalInstant(v.collected_at) && text(v.source_revision) && object(v.fields) && Object.keys(v.fields).length <= 64 && object(v.field_sources) && Object.values(v.field_sources).every(text) && (v.raw_data === undefined || text(v.raw_data)),
  School: (v) => text(v.id) && text(v.name) && typeof v.enabled === 'boolean' && Array.isArray(v.methods) && v.methods.every((m) => oneOf(m, methods)) && text(v.notice_version) && text(v.opening_date) && count(v.newcomer_days) && text(v.email_domain) && strings(v.material_types) && count(v.revision) && (v.profile_schema === undefined || text(v.profile_schema)),
  Application: (v) => text(v.id) && text(v.school_id) && oneOf(v.method, methods) && oneOf(v.stage, stages) && oneOf(v.kind, recordKinds) && oneOf(v.state, ['in_progress', 'pending_review', 'supplement_required', 'approved', 'rejected', 'expired', 'deleted']) && count(v.revision) && instant(v.created_at) && instant(v.updated_at) && instant(v.expires_at) && text(v.credential_id) && text(v.result_code) && (v.review_note === undefined || text(v.review_note)) && (v.qualification_expires_at === undefined || optionalInstant(v.qualification_expires_at)) && (v.school_challenge === undefined || challenge(v.school_challenge)),
  Credential: (v) => text(v.id) && text(v.school_id) && oneOf(v.method, methods) && oneOf(v.stage, stages) && oneOf(v.kind, recordKinds) && oneOf(v.state, ['active', 'revoked', 'expired', 'deleted']) && text(v.student_display) && count(v.revision) && instant(v.verified_at) && optionalInstant(v.expires_at),
  Summary: (v) => typeof v.campus_eligibility === 'boolean' && typeof v.teacher_verified === 'boolean' && typeof v.identity_verified === 'boolean' && (v.identity_masked === undefined ? true : v.identity_verified === true && masked(v.identity_masked)) && instant(v.evaluated_at) && count(v.revision) && optionalInstant(v.next_evaluation_at),
  IdentityMasked: masked,
  IdentityInput: (v) => sized(v.student_id, 1, 64) && sized(v.name, 2, 100) && sized(v.document_number, 3, 32) && v.password === '' && sized(v.school_id, 0, 64) && sized(v.notice_version, 0, 64) && v.consent === true,
  // Real-name matching sends name and document number; school SSO sends only a password.
  VerifyInput: (v) => sized(v.student_id, 1, 64) && sized(v.name, 0, 100) && sized(v.document_number, 0, 32) && sized(v.password, 0, 256)
    && ((points(v.name as string) >= 2 && points(v.document_number as string) >= 3 && v.password === '') || (v.name === '' && v.document_number === '' && points(v.password as string) >= 1)),
  RemovalRequest: (v) => text(v.id) && text(v.credential_id) && text(v.school_id) && oneOf(v.kind, ['revoke', 'delete']) && oneOf(v.state, ['pending', 'approved', 'rejected']) && text(v.reason) && text(v.note) && count(v.revision) && instant(v.created_at),
  Suggestion: (v) => text(v.id) && text(v.name) && text(v.website) && oneOf(v.state, ['pending', 'approved', 'rejected']) && text(v.note) && count(v.revision),
  EmailChallenge: (v) => text(v.id) && text(v.application_id) && instant(v.expires_at) && oneOf(v.state, ['queued', 'waiting', 'delivered', 'used', 'failed']) && text(v.masked_email) && text(v.target_address),
  CaptureSession: (v) => text(v.token) && /^[A-Za-z0-9_-]{43}$/.test(v.token) && instant(v.expires_at),
  Material: (v) => text(v.id) && text(v.application_id) && oneOf(v.content_type, ['image/jpeg', 'image/png', 'application/pdf']) && count(v.size) && instant(v.created_at),
  Operation: (v) => text(v.id) && oneOf(v.state, ['processing', 'completed', 'failed']) && text(v.code) && instant(v.expires_at),
  TeacherForm: (v) => sized(v.name, 0, 100) && sized(v.organization, 0, 100) && (v.gender === undefined || sized(v.gender, 0, 32)) && sized(v.email, 0, 254) && sized(v.material_type, 0, 64) && strings(v.material_ids) && v.material_ids.length <= 5 && disclosures(v.disclosures) && count(v.revision),
  TeacherCredential: (v) => text(v.id) && text(v.school_id) && strings(v.teacher_ids) && oneOf(v.state, ['active', 'revoked', 'expired']) && count(v.revision) && instant(v.verified_at) && optionalInstant(v.expires_at) && text(v.source) && text(v.note) && disclosures(v.disclosures),
  ManualInput: (v) => text(v.student_id) && text(v.name) && text(v.department) && text(v.email) && text(v.material_type) && strings(v.material_ids) && count(v.revision),
}

export function parseEntity<K extends Entity>(kind: K, value: unknown): Schemas[K] {
  if (!object(value) || !checks[kind](value)) throw new ApiError('incompatible')
  // Required fields, enumerations and instants of this schema were checked above.
  return value as Schemas[K]
}

const pageSize = 25
const operationId = /^[a-f0-9]{64}$/

async function fingerprint(method: string, path: string, body: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${method}\n${path}\n${body}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Student verification requests. A write keeps its idempotency key until the
 * outcome is known: resending the same intent after a lost response reuses the
 * key, and a new intent or a known result starts fresh. The key map stores a
 * digest of the request, never the password or identity form itself.
 */
export class VerificationApi {
  private readonly keys = new Map<string, string>()

  constructor(private readonly http: Http) {}

  private async body(response: Response) {
    try {
      return JSON.parse(new TextDecoder().decode(await readLimited(response, 1 << 20))) as unknown
    } catch {
      throw new ApiError('incompatible', true, response.status)
    }
  }

  async get<K extends Entity>(kind: K, path: string, signal?: AbortSignal): Promise<Schemas[K]> {
    return this.http.json(path, (value) => parseEntity(kind, value), { signal, timeout: 25_000 })
  }

  /** A page of a list endpoint. The cursor is the last id when the page is full. */
  async list<K extends Entity>(kind: K, path: string, options: { after?: string; limit?: number; signal?: AbortSignal } = {}): Promise<{ items: Schemas[K][]; next: string }> {
    const limit = options.limit ?? pageSize
    const items = await this.http.json(path, (value) => {
      if (!Array.isArray(value) || value.length > 100) throw new ApiError('incompatible')
      return value.map((item) => parseEntity(kind, item))
    }, { query: { limit, after: options.after }, signal: options.signal, timeout: 25_000 })
    const last = items.at(-1)
    return { items, next: items.length === limit && last && 'id' in last ? String(last.id) : '' }
  }

  async write<K extends Entity>(kind: K, path: string, input?: unknown, method = 'POST', signal?: AbortSignal): Promise<Schemas[K]> {
    const serialized = input === undefined ? '' : JSON.stringify(input)
    const print = await fingerprint(method, path, serialized)
    let key = this.keys.get(print)
    if (!key) {
      key = crypto.randomUUID()
      this.keys.set(print, key)
    }
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await this.http.send(path, { method, body: input, key, signal, timeout: 25_000 })
        const value = await this.body(response)
        if (response.status !== 202) {
          const result = parseEntity(kind, value)
          this.keys.delete(print)
          return result
        }
        // 202: the provider is still working; ask for the operation and send the same request again.
        if (!object(value) || !text(value.operation_id) || !operationId.test(value.operation_id)) throw new ApiError('incompatible', true)
        await new Promise((resolve) => setTimeout(resolve, 250))
        const operation = await this.get('Operation', `/api/v1/verification/operations/${value.operation_id}`, signal)
        if (operation.state === 'failed') throw new ApiError(operation.code || 'unavailable')
        if (signal?.aborted) throw new ApiError('cancelled', true)
      }
      throw new ApiError('processing', true)
    } catch (error) {
      if (!isUncertain(error)) this.keys.delete(print)
      throw error
    }
  }

  /** Upload a captured image with a single-use capture token. */
  async upload(token: string, image: Blob): Promise<Material> {
    return this.http.json('/api/v1/verification/capture', (value) => parseEntity('Material', value), { method: 'POST', bytes: image, headers: { 'X-Capture-Token': token }, timeout: 60_000 })
  }

  async material(id: string, signal?: AbortSignal): Promise<Blob> {
    const blob = await this.http.blob(`/api/v1/verification/materials/${segment(id)}`, 16 << 20, { signal })
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type)) throw new ApiError('incompatible')
    return blob
  }
}

export function useVerification() {
  return new VerificationApi(useHttp())
}
