import type { components } from '../api/verification.gen'
import * as d from './data'

// 演示用的学生认证后端：北航的学校与方式配置、各演示身份对应的认证状态，以及四种方式的核验流程。
// 数据只在当前页面的内存里，刷新后回到所选演示身份的初始状态。规则写在这里，方便审阅时按提示触发各种结果：
//   学号以 9 开头            → 学籍或邮箱里没有记录
//   姓名填「测试」           → 有记录但信息不匹配
//   学校账号密码填 wrong      → 账号或密码错误；填 locked → 账号已锁定
//   邮箱验证码填 000000       → 验证码错误；其他六位数字通过
//   校友选择学校账号核验      → 该方式仅适用于在读学生
type Row = Record<string, any>
type Schemas = components['schemas']
type TransferReceipt = { acceptedAt: string }
type DemoMail = { sent: number; challenge: Schemas['EmailChallenge']; receipt: TransferReceipt | undefined }
export type VerificationPersona = 'guest' | 'unverified' | 'processing' | 'verified' | 'expired' | 'rejected'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status = 422) => json({ code, request_id: 'demo' }, status)
const now = () => new Date().toISOString()
const read = (init?: RequestInit): Row => { try { return JSON.parse(String(init?.body ?? '{}')) as Row } catch { return {} } }

const school = d.verification.school
const transferDocument: Schemas['EmailTransferDocument'] = {
  document_id: 'email-transfer',
  version: 'demo-v1',
  digest: 'a'.repeat(64),
  url: 'https://example.invalid/legal/email-transfer/demo-v1',
}

const application = (values: Row): Row => ({ school_id: d.SCHOOL, stage: 'unknown', kind: 'student', revision: 1, created_at: d.ago(1), updated_at: d.ago(0, 5), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), credential_id: '', result_code: '', ...values })
const credential = (state: string, values: Row = {}): Row => ({ id: 'cred', school_id: d.SCHOOL, method: 'real_name_identity_check', stage: 'unknown', kind: 'student', state, student_display: '2137****', revision: 1, verified_at: d.ago(50), expires_at: state === 'expired' ? d.ago(3) : null, ...values })

let eligible = false
const applications: Row[] = []
const credentials: Row[] = []
const removalRequests: Row[] = []
const materials = new Map<string, Row[]>()
const mails = new Map<string, DemoMail>()
const transferReceipts = new Map<string, TransferReceipt>()
let sequence = 0
let seeded = ''

// 每个演示身份的初始状态。认证通过后状态留在内存里，切换身份会刷新页面并重新取初始状态。
function seed(who: VerificationPersona) {
  if (seeded === who) return
  seeded = who
  removalRequests.length = 0
  eligible = who === 'verified'
  applications.length = 0
  credentials.length = 0
  mails.clear()
  transferReceipts.clear()
  if (who === 'verified') credentials.push(credential('active'))
  if (who === 'expired') credentials.push(credential('expired'))
  if (who === 'processing') applications.push(application({ id: 'app-review', method: 'manual_material_review', state: 'pending_review', revision: 2 }))
  if (who === 'rejected') applications.push(application({ id: 'app-rejected', method: 'manual_material_review', kind: 'alumni', state: 'rejected', revision: 3, result_code: 'rejected', review_note: '材料照片不清晰，无法辨认学号。请重新拍摄后再提交。' }))
}

function approve(row: Row) {
  eligible = true
  const id = `cred-${++sequence}`
  credentials.unshift(credential('active', { id, method: row.method, kind: row.kind === 'unknown' ? 'student' : row.kind, verified_at: now() }))
  Object.assign(row, { state: 'approved', credential_id: id, revision: row.revision + 1, updated_at: now() })
  return json(row)
}

function mailState(entry: DemoMail) {
  // 邮件先排队，约三秒后送达。
  if (entry.challenge.state === 'queued' && Date.now() - entry.sent >= 3000) entry.challenge.state = 'delivered'
  return entry.challenge
}

function transferConsent(method: string) {
  if (method === 'GET') {
    const last = [...transferReceipts.values()].at(-1)
    const status: Schemas['EmailTransferConsentStatus'] = {
      document: transferDocument,
      accepted: last !== undefined,
      ...(last ? { accepted_at: last.acceptedAt } : {}),
    }
    return json(status)
  }
  if (method === 'DELETE') {
    for (const entry of mails.values()) {
      if (entry.receipt && mailState(entry).state === 'queued') entry.challenge.state = 'failed'
    }
    transferReceipts.clear()
    const withdrawal: Schemas['EmailTransferWithdrawal'] = { withdrawn: true }
    return json(withdrawal)
  }
  return undefined
}

function checkTransferChoice(input: unknown) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return nope('invalid_input', 400)
  const { document_id, version, digest, accepted } = input as Record<string, unknown>
  if (accepted == null || accepted === false) return nope('email_transfer_consent_required', 403)
  if (accepted !== true || document_id !== transferDocument.document_id || typeof version !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
    return nope('invalid_input', 400)
  }
  if (version !== transferDocument.version || digest !== transferDocument.digest) return nope('email_transfer_consent_changed', 409)
  return undefined
}

function beginEmail(applicationId: string, outbound: boolean, body: Row) {
  const choice: unknown = body.email_transfer_consent
  const studentId = typeof body.student_id === 'string' ? body.student_id.trim().toLowerCase() : ''
  if (outbound && (!studentId || /\s/.test(studentId) || [...studentId].length > 64)) return nope('invalid_input', 400)
  const scope = JSON.stringify([applicationId, studentId])
  let receipt = transferReceipts.get(scope)
  if (outbound && choice != null) {
    const problem = checkTransferChoice(choice)
    if (problem) return problem
  } else if (outbound) {
    // 只能沿用该申请上一次发码对应的凭证。
    if (!receipt || mails.get(applicationId)?.receipt !== receipt) return nope('email_transfer_consent_required', 403)
  } else if (choice != null) {
    return nope('invalid_input', 400)
  }
  if ((outbound ? studentId : String(body.student_id ?? '')).startsWith('9')) return nope('email_identity_no_record')
  if (String(body.name ?? '').trim() === '测试') return nope('email_identity_mismatch')
  if (outbound && !receipt) {
    receipt = { acceptedAt: now() }
    transferReceipts.set(scope, receipt)
  }
  const sent = Date.now()
  const challenge: Schemas['EmailChallenge'] = {
    id: `mail-${++sequence}`,
    application_id: applicationId,
    expires_at: new Date(sent + 5 * 60_000).toISOString(),
    state: 'queued',
    masked_email: '21****34@buaa.edu.cn',
    target_address: '',
  }
  mails.set(applicationId, { sent, challenge, receipt })
  return json(challenge, 201)
}

function confirmEmail(row: Row, code: unknown) {
  if (row.method !== 'student_email_outbound_otp') return code === '000000' ? nope('information_mismatch') : approve(row)
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return nope('invalid_input', 400)
  const entry = mails.get(row.id)
  if (!entry) return nope('not_found', 404)
  const challenge = mailState(entry)
  if (Date.parse(challenge.expires_at) <= Date.now()) return nope('expired', 410)
  if (challenge.state !== 'delivered') return nope('conflict', 409)
  if (code === '000000') return nope('information_mismatch')
  challenge.state = 'used'
  return approve(row)
}

/** 手机或当前设备拍到的照片，记到最近一份填写中的人工审核申请上。 */
export function studentCaptured(size: number) {
  const open = [...applications].reverse().find((row) => row.method === 'manual_material_review' && ['in_progress', 'supplement_required'].includes(row.state))
  if (!open) return undefined
  const material = { id: `material-${++sequence}`, application_id: open.id, content_type: 'image/jpeg', size, created_at: now() }
  materials.set(open.id, [...(materials.get(open.id) ?? []), material])
  return material
}
export function studentMaterialDeleted(id: string) {
  for (const [key, list] of materials) {
    const removed = list.find((item) => item.id === id)
    if (removed) { materials.set(key, list.filter((item) => item.id !== id)); return removed }
  }
  return undefined
}

/** 学生认证接口。others 是教师认证演示里同一账号的申请，学生列表也要显示。 */
export function verificationRoute(p: string, method: string, init: RequestInit | undefined, who: VerificationPersona, others: Row[]): Response | undefined {
  if (!p.startsWith('/verification')) return undefined
  seed(who)
  if (p === '/verification/schools') return json([school])
  if (p === '/verification/email-transfer-consent') return transferConsent(method)
  if (p === '/verification/summary') return json({ campus_eligibility: eligible, teacher_verified: false, identity_verified: eligible, ...(eligible ? { identity_masked: { name: '**航', document_number: `1${'*'.repeat(16)}8`, document_type: 'cn_resident_id_card' } } : {}), evaluated_at: d.ago(0, 1), revision: 1, next_evaluation_at: null })
  if (p === '/verification/credentials') return json(credentials)
  if (p === '/verification/requests') return json(removalRequests)
  if (p === '/verification/suggestions' && method === 'POST') {
    const { name, website } = read(init)
    return json({ id: `suggestion-${++sequence}`, name, website, state: 'pending', note: '', revision: 1 })
  }
  const removal = /^\/verification\/credentials\/([^/]+)\/requests$/.exec(p)
  if (removal && method === 'POST') {
    const credential = credentials.find(item => item.id === decodeURIComponent(removal[1]!))
    if (!credential) return nope('not_found', 404)
    const { kind, reason } = read(init)
    const record = { id: `request-${++sequence}`, school_id: credential.school_id, credential_id: credential.id, kind, reason, state: 'pending', note: '', revision: 1, created_at: now() }
    removalRequests.push(record)
    return json(record)
  }
  if (p === '/verification/applications' && method === 'GET') return json([...applications, ...others])
  if (p === '/verification/applications') {
    const body = read(init)
    if (body.school_id !== d.SCHOOL || body.consent !== true) return nope('invalid_input', 400)
    const row = application({ id: `app-${++sequence}`, method: body.method, kind: body.kind, stage: body.stage, state: 'in_progress', created_at: now(), updated_at: now() })
    applications.unshift(row)
    return json(row, 201)
  }
  const profile = /^\/verification\/credentials\/([^/]+)\/profile$/.exec(p)
  // 学校个人资料只投影学号、姓名、学院三项。
  if (profile) return json({ school_id: d.SCHOOL, data_status: 'complete', schema: 'buaa.imported.v1', revision: 1, collected_at: d.ago(50), source_revision: '1', fields: { student_id: '21371234', name: '小航', department: '计算机学院' }, field_sources: { student_id: 'oracle_students', name: 'oracle_students', department: 'oracle_departments' } })
  const owned = /^\/verification\/applications\/([^/]+)(?:\/(.+))?$/.exec(p)
  const row = owned && applications.find((item) => item.id === decodeURIComponent(owned[1]!))
  if (!owned || !row) return undefined
  const step = owned[2] ?? ''
  if (!step) return json(row)
  if (step === 'materials') return json(materials.get(row.id) ?? [])
  if (step === 'capture') return json({ token: 'c'.repeat(43), expires_at: new Date(Date.now() + 6e5).toISOString() })
  if (step === 'form') return nope('not_found', 404)
  const body = read(init)
  const noRecord = String(body.student_id ?? '').startsWith('9')
  const mismatch = String(body.name ?? '').trim() === '测试'
  if (step === 'verify') {
    if (row.method === 'school_sso') {
      if (row.kind !== 'student') return nope('method_identity_not_allowed')
      if (body.password === 'wrong') return nope('school_credentials_rejected')
      if (body.password === 'locked') return nope('school_account_locked')
      return approve(row)
    }
    if (noRecord) return nope('real_name_no_record')
    if (mismatch) return nope('real_name_mismatch')
    return approve(row)
  }
  if (step === 'manual') {
    Object.assign(row, { state: 'pending_review', revision: row.revision + 1, updated_at: now() })
    return json(row)
  }
  if (step === 'email' && method === 'POST') return beginEmail(row.id, row.method === 'student_email_outbound_otp', body)
  if (step === 'email') {
    const entry = mails.get(row.id)
    return entry ? json(mailState(entry)) : nope('not_found', 404)
  }
  if (step === 'email/confirm') return confirmEmail(row, body.code)
  return undefined
}
