import { teacherLevels } from './store'
import * as d from './data'
import { favoritesRoute } from './favorites'
import { billingRoute } from './billing'
import { openPlatformRoute } from './open-platform'
import { qqRoute } from './qq'

export type Persona = 'guest' | 'unverified' | 'processing' | 'verified' | 'expired'
const KEY = 'stuhelper-demo-persona'
// Account closure request of the prototype session.
let closure: Record<string, any> | undefined
const demoProfile = { id: '00000000-0000-4000-8000-000000000001', nickname: '小航同学', nickname_required: false, bio: '计算机学院 2023 级，喜欢写代码和拍飞机。', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true }, revision: 1 }

export function persona(): Persona {
  try { return (localStorage.getItem(KEY) as Persona) || 'verified' } catch { return 'verified' }
}
export function setPersona(value: Persona) {
  try { localStorage.setItem(KEY, value) } catch { /* 隐私窗口下只影响演示切换 */ }
}

const realFetch = window.fetch.bind(window)
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code, request_id: 'demo' }, status)
const nid = (prefix: string) => `${prefix}-${Date.now().toString(36)}`
const result = (id: string, state = 'published', revision = 1) => json({ id, state, revision })

// 演示期间的修改保存在内存中，刷新页面后恢复初始数据。
const reviews = [...d.reviews] as Record<string, any>[]
const replies = [...d.replies] as Record<string, any>[]
const drafts = [...d.drafts] as Record<string, any>[]
const tasks = [...d.tasks] as Record<string, any>[]
const resources = [...d.resources] as Record<string, any>[]

function catalog(u: URL) {
  const q = u.searchParams
  let items = [...(d.catalogByKind[q.get('kind') ?? ''] ?? [])] as Record<string, any>[]
  const text = (q.get('q') ?? '').trim().toLowerCase()
  if (text) items = items.filter((o) => [o.name, o.code, ...o.aliases].some((v) => String(v ?? '').toLowerCase().includes(text)))
  for (const key of ['department_id', 'category_id', 'nature_id', 'course_id', 'term_id', 'term_course_id', 'class_id'] as const) {
    const value = q.get(key)
    if (!value || q.get('kind') === 'teacher' || q.get('kind') === 'schedule' && key !== 'class_id') continue
    items = items.filter((o) => o[key] === value)
  }
  if (q.get('kind') === 'schedule' && q.get('class_id')) items = items.filter((o) => o.class_id === q.get('class_id'))
  const teacher = q.get('teacher_id')
  if (teacher && q.get('kind') === 'course') items = items.filter((o) => d.teachesIn.some(([c, p]) => c === o.id && p === teacher))
  if (teacher && q.get('kind') === 'term_course') items = items.filter((o) => d.teachesIn.some(([c, p]) => c === o.course_id && p === teacher))
  if (teacher && q.get('kind') === 'class') items = items.filter((o) => o.teacher_id === teacher)
  const dept = q.get('department_id')
  if (q.get('kind') === 'teacher') {
    if (dept) items = items.filter((o) => o.department_id === dept)
    const course = q.get('course_id')
    if (course) items = items.filter((o) => d.teachesIn.some(([c, p]) => c === course && p === o.id))
    const klass = q.get('class_id')
    if (klass) { const k = d.classes.find((c) => c.id === klass) as Record<string, any> | undefined; items = items.filter((o) => o.id === k?.teacher_id) }
  }
  const limit = Number(q.get('limit') || 20)
  const start = Number(q.get('after') || 0)
  return json({ items: items.slice(start, start + limit), next: start + limit < items.length ? String(start + limit) : '' })
}

function summary(id: string) {
  const entry = d.allObjects.find((o) => o.id === id) as Record<string, any> | undefined
  if (!entry) return nope('not_found', 404)
  const isCourse = entry.kind === 'course'
  const taught = d.teachesIn.filter(([c, p]) => (isCourse ? c === id : p === id))
  return json({ object: entry, school: d.school, department: d.departments.find((x) => x.id === entry.department_id) ?? null, categories: isCourse ? d.categories.filter((x) => x.id === entry.category_id) : [], natures: isCourse ? d.natures.filter((x) => x.id === entry.nature_id) : [], course_count: isCourse ? 1 : taught.length, teacher_count: isCourse ? taught.length : 1, offering_count: taught.length * d.terms.length })
}

function reviewList(u: URL) {
  const q = u.searchParams
  let items = q.get('kind') === 'reply' ? replies.filter((r) => r.root_id === q.get('root_id')) : reviews.filter((r) => !q.get('kind') || r.kind === q.get('kind'))
  for (const [param, field] of [['target_id', 'target_id'], ['teacher_id', 'teacher_id'], ['term_id', 'term_id']] as const) {
    const value = q.get(param)
    if (value) items = items.filter((r) => r[field] === value)
  }
  items = [...items].sort((a, b) => (q.get('sort') === 'oldest' ? 1 : -1) * a.published_at.localeCompare(b.published_at))
  return json({ items, next: '' })
}

function statistics(u: URL) {
  const seed = d.courseSeeds.find((row) => row[0] === u.searchParams.get('target_id'))
  const rating = seed?.[8] ?? teacherLevels(u.searchParams.get('target_id') ?? '')
  const dimensions = d.statDims(rating)
  const related = d.teachesIn.filter(([, p]) => p === u.searchParams.get('target_id')).map(([c]) => ({ course_id: c, dimensions: d.statDims(d.courseSeeds.find((row) => row[0] === c)![8]) }))
  return json({ dimensions, courses: seed ? [{ course_id: seed[0], dimensions }] : related, next: '', from: u.searchParams.get('from'), until: u.searchParams.get('until') })
}

async function body(init?: RequestInit) {
  try { return JSON.parse(String(init?.body ?? '{}')) as Record<string, any> } catch { return {} }
}

async function route(u: URL, method: string, init?: RequestInit): Promise<Response> {
  const p = u.pathname.replace('/api/v1', '')
  const who = persona()
  if (p === '/auth/session') return who === 'guest' ? nope('unauthenticated', 401) : json({ authenticated: true, profile: demoProfile, csrf_token: 'a'.repeat(43), phone_bound: true, administrator: false, expires_at: '2030-01-01T00:00:00Z' })
  if (p === '/auth/logout' || p === '/auth/logout-all') { setPersona('guest'); return new Response(null, { status: 204 }) }
  if (p === '/profiles/me' && method === 'PUT') {
    const b = await body(init)
    if (b.revision !== demoProfile.revision) return nope('conflict', 409)
    Object.assign(demoProfile, { nickname: b.nickname, bio: b.bio ?? demoProfile.bio, visibility: b.visibility ?? demoProfile.visibility, revision: demoProfile.revision + 1 })
    return json(demoProfile)
  }
  if (p === '/profiles/me') return json(demoProfile)
  if (p === `/profiles/${demoProfile.id}`) {
    const v = demoProfile.visibility
    const affiliation = { ...(v.school ? { school_name: d.school.name } : {}), ...(v.department ? { department: '计算机学院' } : {}), ...(v.grade ? { grade: '2023 级' } : {}), ...(v.badge ? { badge: 'student' } : {}) }
    return json({ id: demoProfile.id, nickname: demoProfile.nickname, bio: demoProfile.bio, visibility: v, affiliations: Object.keys(affiliation).length ? [affiliation] : [], facts_state: 'available' })
  }
  if (p === '/profiles/me/closure' && method === 'GET') return closure ? json(closure) : nope('not_found', 404)
  if (p === '/profiles/me/closure') { closure = { id: '00000000-0000-4000-8000-0000000000c1', state: 'cooling', revision: 1, requested_at: new Date().toISOString(), cooling_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), completed_steps: [], blocker: '', points_policy: 'forfeit_all_points_and_pending_deductions', profile_id: demoProfile.id }; return json(closure) }
  if (p.startsWith('/profiles/me/closure/') && p.endsWith('/cancel') && closure) { closure = { ...closure, state: 'cancelled', revision: closure.revision + 1 }; return json(closure) }
  if (p === '/system/capabilities') return json({ api_version: 1, capabilities: ['platform.status'] })
  if (who === 'guest' && !p.startsWith('/verification/schools')) return nope('unauthenticated', 401)
  const favorite = await favoritesRoute(p, method, u, init, who === 'verified')
  if (favorite) return favorite
  const qq = await qqRoute(p, method, init)
  if (qq) return qq
  const billing = await billingRoute(p, method, u, init)
  if (billing) return billing
  const platform = await openPlatformRoute(p, method, init)
  if (platform) return platform

  if (p.startsWith('/verification')) {
    const eligible = who === 'verified'
    if (p === '/verification/summary') return json({ campus_eligibility: eligible, teacher_verified: false, identity_verified: eligible, ...(eligible ? { identity_masked: { name: '**航', document_number: `1${'*'.repeat(16)}8` } } : {}), evaluated_at: d.ago(0, 1), revision: 1, next_evaluation_at: null })
    if (p === '/verification/schools') return json([d.verification.school])
    if (p === '/verification/credentials') return json(eligible ? [d.verification.credential('active')] : who === 'expired' ? [d.verification.credential('expired')] : [])
    if (p === '/verification/applications' && method === 'GET') return json(who === 'processing' ? [d.verification.application] : [])
    if (p === '/verification/applications') return json({ ...d.verification.application, state: 'in_progress' }, 201)
    if (p === '/verification/identity') return json({ code: 'pending' }, 400)
    return json([])
  }
  // Own-record names need only a session, so they stay readable after content admission lapses.
  if (p === '/reviews/me/references') {
    const ids = (u.searchParams.get('ids') ?? '').split(',')
    const items = d.allObjects.filter((o) => ids.includes(o.id)).map((o) => ({ id: o.id, kind: o.kind, name: o.name }))
    return json({ items, missing_ids: ids.filter((id) => !items.some((o) => o.id === id)) })
  }
  if (who !== 'verified' && !p.startsWith('/storage')) return nope('verification_required', 403)

  if (p === '/catalog/objects') return catalog(u)
  if (p === '/catalog/objects/lookup') {
    const ids = (u.searchParams.get('ids') ?? '').split(',')
    const items = d.allObjects.filter((o) => ids.includes(o.id))
    return json({ items, missing_ids: ids.filter((id) => !items.some((o) => o.id === id)) })
  }
  if (p.endsWith('/summary') && p.startsWith('/catalog/objects/')) return summary(decodeURIComponent(p.split('/').at(-2)!))
  if (p.startsWith('/catalog/objects/')) { const o = d.allObjects.find((x) => x.id === decodeURIComponent(p.split('/').at(-1)!)); return o ? json(o) : nope('not_found', 404) }
  if (p === '/catalog/me/enrollments') return json(d.enrollments)

  if (p === '/reviews/presentation') return json({ effective: { school_id: d.SCHOOL, revision: 0, rating_texts: {} }, configured: null, source: 'default' })
  if (p === '/reviews/statistics') return statistics(u)
  if (p === '/reviews/compose') {
    const kind = u.searchParams.get('kind')
    const term = u.searchParams.get('term_id')
    const course = u.searchParams.get('target_id')
    const needs = kind === 'course' && !term
    return json({ allowed: !needs, state: needs ? 'choose_term' : 'ready', requirements: [{ key: 'login', state: 'satisfied' }, { key: 'campus_eligibility', state: 'satisfied' }, { key: 'phone_bound', state: 'satisfied' }], teacher_ids: kind === 'course' && term ? d.teachesIn.filter(([c]) => c === course).map(([, t]) => t) : [], identity: 'choice', rule_version: 'demo' })
  }
  if (p === '/reviews' && method === 'GET') return reviewList(u)
  if (p === '/reviews') {
    const input = await body(init)
    const id = nid('r')
    reviews.unshift({ ...input, id, root_id: id, school_id: d.SCHOOL, author: { anonymous: !input.signed, handle: input.signed ? '小航同学' : '匿名同学' }, revision: 1, published_at: new Date().toISOString(), upvotes: 0, downvotes: 0, my_vote: 0, mine: true, can_edit: true, state: 'published' })
    return result(id)
  }
  if (p === '/reviews/me/entries') return json({ items: reviews.filter((r) => r.mine), next: '' })
  if (p.startsWith('/reviews/me/entries/')) { const r = reviews.find((x) => x.id === p.split('/').at(-1)); return r ? json(r) : nope('not_found', 404) }
  if (p === '/reviews/me/votes') return json(reviews.filter((r) => r.my_vote))
  if (p === '/reviews/me/drafts' && method === 'GET') return json(drafts)
  if (p === '/reviews/me/drafts') { const b = await body(init); const id = b.id || nid('dr'); const at = drafts.findIndex((x) => x.id === id); const row = { id, revision: (b.revision ?? 0) + 1, input: b.input, withdrawn: false, reference_ids: [b.input.target_id, b.input.term_id, b.input.teacher_id].filter(Boolean), reference_state: 'verified' }; if (at >= 0) drafts[at] = row; else drafts.unshift(row); return result(id, 'draft', row.revision) }
  if (p.startsWith('/reviews/me/drafts/')) {
    const id = p.split('/')[4]!
    const at = drafts.findIndex((x) => x.id === id)
    if (p.endsWith('/publish')) { drafts.splice(at, 1); return result(nid('r')) }
    if (method === 'DELETE') { drafts.splice(at, 1); return result(id, 'deleted') }
    return at >= 0 ? json(drafts[at]) : nope('not_found', 404)
  }
  if (/^\/reviews\/[^/]+\/replies$/.test(p)) {
    const parent = p.split('/')[2]!
    const input = await body(init)
    const id = nid('reply')
    replies.push({ ...input, id, root_id: parent, parent_id: parent, school_id: d.SCHOOL, author: { anonymous: !input.signed, handle: input.signed ? '小航同学' : '匿名同学' }, revision: 1, published_at: new Date().toISOString(), upvotes: 0, downvotes: 0, my_vote: 0, mine: true, can_edit: true, state: 'published' })
    return result(id)
  }
  if (/^\/reviews\/[^/]+\/actions$/.test(p)) {
    const row = [...reviews, ...replies].find((r) => r.id === p.split('/')[2])
    const b = await body(init)
    if (row && (b.action === 'upvote' || b.action === 'downvote' || b.action === 'clear_vote' || 'vote' in b)) {
      const next = b.action === 'upvote' ? 1 : b.action === 'downvote' ? -1 : Number(b.vote ?? 0)
      if (row.my_vote === 1) row.upvotes--
      if (row.my_vote === -1) row.downvotes--
      if (next === 1) row.upvotes++
      if (next === -1) row.downvotes++
      row.my_vote = next
    }
    return result(row?.id ?? 'x')
  }
  if (p.startsWith('/reviews/')) { const r = [...reviews, ...replies].find((x) => x.id === p.split('/').at(-1)); return r ? json(r) : nope('not_found', 404) }
  if (p === '/moderation/tasks' && method === 'GET') return json(tasks)
  if (p === '/moderation/tasks') { const b = await body(init); const row = { id: nid('tk'), school_id: d.SCHOOL, content_kind: 'review', submission: { evidence: [], ...b }, object_revision: 1, revision: 1, state: 'waiting', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; tasks.unshift(row); return json(row) }

  if (p === '/resources/capabilities') return json(d.capabilities)
  if (p === '/resources/categories') return json({ items: d.resCategories, next_cursor: '' })
  if (p === '/resources/directories') return json({ items: d.directories.filter((x) => !u.searchParams.get('course_id') || x.course_id === u.searchParams.get('course_id')), next_cursor: '' })
  if (p === '/resources/requests' && method === 'GET') return json({ items: d.receipts, next_cursor: '' })
  if (p.startsWith('/resources/requests/')) return json(d.receipts[0])
  if (p === '/resources/me') return json({ items: resources.filter((r) => r.owned), next_cursor: '' })
  if (p === '/resources/packages') return json({ id: 'pack', parts: [{ number: 1, bytes: 1000, files: [(resources[0]!.current as any).file] }], expires_at: '2030-01-01T00:00:00Z' })
  if (p === '/resources' && method === 'GET') {
    const q = u.searchParams
    const text = (q.get('query') ?? '').trim()
    return json({ items: resources.filter((r) => { const v = r.current; if (!v) return false; const m = v.metadata; return (!q.get('course_id') || m.associations.course_id === q.get('course_id')) && (!q.get('category_id') || m.category_id === q.get('category_id')) && (!text || m.title.includes(text)) }), next_cursor: '' })
  }
  if (p === '/resources') { const b = await body(init); const row = { id: nid('x'), revision: 1, state: 'draft', proposal: { id: nid('v'), number: 1, metadata: b.metadata ?? b, category: d.resCategories[0], state: 'draft', created_at: new Date().toISOString() }, download_allowed: false, access_reason: 'allowed', owned: true }; resources.unshift(row); return json(row, 201) }
  if (p.startsWith('/resources/items/')) {
    const id = p.split('/')[3]!
    const row = resources.find((r) => r.id === id)
    if (!row) return nope('not_found', 404)
    if (p.endsWith('/download')) return new Response(new Blob(['演示文件内容']), { status: 200 })
    if (p.endsWith('/requests')) return json({ ...d.receipts[0], id: nid('q'), resource_id: id, state: 'submitted', kind: (await body(init)).kind }, 202)
    if (p.endsWith('/submit')) { row.state = 'draft'; return json(row, 202) }
    return json(row)
  }
  if (p.startsWith('/media/')) return nope('demo_upload_disabled', 503)

  if (p.startsWith('/storage-contributions')) {
    if (p.endsWith('/policy')) return json(d.contribution.policy)
    if (p.endsWith('/statistics')) return json(d.contribution.statistics)
    if (p.endsWith('/options')) return json(d.contribution.options)
    if (p === '/storage-contributions' && method === 'GET') return json({ items: [d.contribution.item], next_cursor: '' })
    if (p.endsWith('/operations')) return json({ items: [d.contribution.item], next_cursor: '' })
    return json(d.contribution.item, 202)
  }
  if (p.startsWith('/storage/custody')) {
    if (p.endsWith('/policy')) return json(d.custody.policy)
    if (method === 'GET') return json({ items: d.custody.items, next_cursor: '' })
    return json(d.custody.items[0], 202)
  }
  return nope('not_found', 404)
}

export function installDemoFetch() {
  window.fetch = async (input, init) => {
    const u = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (!u.pathname.startsWith('/api/')) return realFetch(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    // 一小段延迟让加载状态和过渡动画可以被看到。
    await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180))
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const response = await route(u, method, init)
    if (response.status >= 400 && import.meta.env.DEV) console.warn('[demo]', method, u.pathname, response.status)
    return response
  }
}
