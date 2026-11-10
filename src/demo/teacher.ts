import * as d from './data'

// In-memory teacher verification following the verification contract. A submitted
// form waits for review; the next read after a few seconds "approves" it and binds
// two demo teacher profiles, so the disclosure settings can be tried.
type Application = Record<string, unknown> & { id: string; state: string; revision: number; updated_at: string; review_note?: string }
type Credential = { id: string; school_id: string; teacher_ids: string[]; state: 'active' | 'revoked' | 'expired'; revision: number; verified_at: string; expires_at: string | null; source: string; note: string; disclosures: string[] }

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code }, status)
const now = () => new Date().toISOString()

let sequence = 0
const applications: Application[] = []
const forms = new Map<string, Record<string, unknown>>()
const materials = new Map<string, { id: string; application_id: string; content_type: string; size: number; created_at: string }[]>()
const credentials: Credential[] = []
const submittedAt = new Map<string, number>()

async function read(init?: RequestInit) {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function settle() {
  for (const application of applications) {
    const at = submittedAt.get(application.id)
    if (application.state !== 'pending_review' || at === undefined || Date.now() - at < 3000) continue
    const credential: Credential = { id: `teacher-credential-${++sequence}`, school_id: d.SCHOOL, teacher_ids: ['p2', 'p3'], state: 'active', revision: 1, verified_at: now(), expires_at: null, source: 'manual_material_review', note: '', disclosures: [...((forms.get(application.id)?.disclosures as string[]) ?? [])] }
    credentials.push(credential)
    Object.assign(application, { state: 'approved', revision: application.revision + 1, updated_at: now(), credential_id: credential.id })
  }
}

export async function teacherRoute(p: string, method: string, init?: RequestInit): Promise<Response | undefined> {
  settle()
  if (p === '/verification/teacher-applications' && method === 'POST') {
    const body = await read(init)
    if (body.school_id !== d.SCHOOL || body.consent !== true || body.notice_version !== d.verification.school.notice_version) return nope('invalid_input', 400)
    if (applications.some((item) => ['in_progress', 'pending_review', 'supplement_required'].includes(item.state))) return nope('conflict', 409)
    const application: Application = { ...d.verification.application, id: `teacher-app-${++sequence}`, kind: 'teacher', stage: 'unknown', state: 'in_progress', revision: 1, created_at: now(), updated_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }
    applications.push(application)
    return json(application, 201)
  }
  if (p === '/verification/teacher-credentials') return json(credentials)
  const disclosure = /^\/verification\/teacher-credentials\/([^/]+)\/disclosures$/.exec(p)
  if (disclosure && method === 'PUT') {
    const credential = credentials.find((item) => item.id === decodeURIComponent(disclosure[1]!))
    if (!credential) return nope('not_found', 404)
    const body = await read(init)
    if (body.revision !== credential.revision) return nope('conflict', 409)
    Object.assign(credential, { disclosures: body.disclosures, revision: credential.revision + 1 })
    return json(credential)
  }
  const owned = /^\/verification\/applications\/([^/]+)\/(teacher-form|materials|capture)$/.exec(p)
  const application = owned && applications.find((item) => item.id === decodeURIComponent(owned[1]!))
  if (owned && application) {
    if (owned[2] === 'materials') return json(materials.get(application.id) ?? [])
    if (owned[2] === 'capture') return json({ token: 'c'.repeat(43), expires_at: new Date(Date.now() + 6e5).toISOString() })
    if (method === 'GET') return forms.has(application.id) ? json(forms.get(application.id)) : nope('not_found', 404)
    const body = await read(init)
    if (body.revision !== application.revision) return nope('conflict', 409)
    forms.set(application.id, { ...body, revision: application.revision + 1 })
    Object.assign(application, { state: 'pending_review', revision: application.revision + 1, updated_at: now(), review_note: undefined })
    submittedAt.set(application.id, Date.now())
    return json(application)
  }
  return undefined
}

/** Applications of the demo user that the student list should also show. */
export const teacherApplications = () => applications

/** A captured demo photo becomes a material of the most recent open teacher application. */
export function teacherCaptured(size: number) {
  const open = [...applications].reverse().find((item) => item.state === 'in_progress' || item.state === 'supplement_required')
  if (!open) return undefined
  const material = { id: `teacher-material-${++sequence}`, application_id: open.id, content_type: 'image/jpeg', size, created_at: now() }
  materials.set(open.id, [...(materials.get(open.id) ?? []), material])
  return material
}

export function teacherMaterialDeleted(id: string) {
  for (const [key, list] of materials) {
    const kept = list.filter((item) => item.id !== id)
    const removed = list.find((item) => item.id === id)
    if (removed) {
      materials.set(key, kept)
      return removed
    }
  }
  return undefined
}
