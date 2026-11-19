import { distribution, periods as periodStarts, teacherLevels, timetable, trend } from './store'
import * as d from './data'
import { favoritesRoute } from './favorites'
import { billingRoute } from './billing'
import { openPlatformRoute } from './open-platform'
import { qqRoute } from './qq'
import { notificationsRoute } from './notifications'
import { teacherApplications, teacherCaptured, teacherMaterialDeleted, teacherRoute } from './teacher'
import { myCoursesEnabled } from '../app/features'
import { studentCaptured, studentMaterialDeleted, verificationRoute } from './verification'


export type Persona = 'guest' | 'unverified' | 'processing' | 'verified' | 'expired' | 'rejected'
const KEY = 'stuhelper-demo-persona'
// Account closure request of the prototype session.
let closure: Record<string, any> | undefined
const demoProfile = { id: '00000000-0000-4000-8000-000000000001', nickname: '小航同学', nickname_required: false, bio: '计算机学院 2023 级，喜欢写代码和拍飞机。', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true }, group_card_consent: { school: false, grade: false, department: false, name: false, student_id: false, gender: false, nickname: false }, revision: 1 }

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
  return json({ object: entry, school: d.school, department: d.departments.find((x) => x.id === entry.department_id) ?? null, categories: isCourse ? d.categories.filter((x) => x.id === entry.category_id) : [], natures: isCourse ? d.natures.filter((x) => x.id === entry.nature_id) : [], course_count: isCourse ? 1 : taught.length, teacher_count: isCourse ? taught.length : 1 })
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

/** Directory rows and facets in the shape of GET /catalog/directory, built from the demo seeds. */
const recommendationOf = (level: number) => (level >= 5 ? 'strongly_recommended' : level === 4 ? 'recommended' : level === 3 ? 'average' : level > 0 ? 'not_recommended' : 'unrated')
const bands = (levels: number[]) => levels.map((level) => ({ level, samples: level ? 6 : 0, courses: 1 }))
function directory(u: URL) {
  const q = u.searchParams
  const kind = q.get('kind') === 'teacher' ? 'teacher' : 'course'
  const text = (q.get('q') ?? '').trim().toLowerCase()
  const dept = q.get('department_id') ?? ''
  const cat = q.get('category_id') ?? ''
  const teacher = q.get('teacher_id') ?? ''
  const reviewCount = (id: string) => [...d.reviews].filter((r) => r.target_id === id || r.teacher_id === id).length
  const deptObj = (id: string) => d.allObjects.find((o) => o.id === id)
  type Row = { object: Record<string, any>; dept: string; cat: string; levels: number[]; heat: number }
  const rows: Row[] = kind === 'course'
    ? d.courseSeeds.map((r) => ({ object: d.allObjects.find((o) => o.id === r[0])!, dept: r[3], cat: r[4], levels: r[8], heat: r[7] }))
    : d.teachers.map((t) => ({ object: t, dept: String((t as Record<string, any>).department_id ?? ''), cat: '', levels: teacherLevels(t.id), heat: Math.max(0, ...d.teachesIn.filter(([, p]) => p === t.id).map(([c]) => d.courseSeeds.find((r) => r[0] === c)?.[7] ?? 0)) }))
  const base = rows.filter((r) => (!text || String(r.object.name).toLowerCase().includes(text)) && (!teacher || d.teachesIn.some(([c, p]) => c === r.object.id && p === teacher)))
  const withDept = base.filter((r) => !dept || r.dept === dept)
  const listed = withDept.filter((r) => !cat || r.cat === cat)
  const sort = q.get('sort')
  listed.sort((a, b) => (sort === 'name' ? String(a.object.name).localeCompare(String(b.object.name), 'zh-CN') : sort === 'reviews' ? reviewCount(b.object.id) - reviewCount(a.object.id) : sort === 'recommend' ? (b.levels[0] ?? 0) - (a.levels[0] ?? 0) : b.heat - a.heat))
  const facet = (list: Row[], key: 'dept' | 'cat') => [...new Set(list.map((r) => r[key]).filter(Boolean))].map((id) => ({ id, name: String(deptObj(id)?.name ?? id), count: list.filter((r) => r[key] === id).length, review_count: list.filter((r) => r[key] === id).reduce((s, r) => s + reviewCount(r.object.id), 0) }))
  const limit = Number(q.get('limit') ?? 20)
  const start = Number(q.get('after') ?? 0)
  const page = listed.slice(start, start + limit)
  return json({
    items: page.map((r) => ({ object: r.object, departments: deptObj(r.dept) ? [deptObj(r.dept)] : [], categories: deptObj(r.cat) ? [deptObj(r.cat)] : [], review_count: reviewCount(r.object.id), recommendation: recommendationOf(r.levels[0] ?? 0), dimensions: bands(r.levels), heat: r.heat })),
    next: start + limit < listed.length ? String(start + limit) : '',
    total: listed.length,
    facet_total: withDept.length,
    category_facets: kind === 'course' ? facet(withDept, 'cat') : [],
    department_facets: facet(listed, 'dept'),
    generated_at: new Date().toISOString(),
  })
}

/** Rating summaries in the shape of GET /reviews/summaries, from the demo levels. */
function summaries(u: URL) {
  const kind = u.searchParams.get('kind') === 'teacher' ? 'teacher' : 'course'
  const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean)
  const charts = u.searchParams.get('include_charts') === 'true'
  return json({
    items: ids.map((id) => {
      const levels = kind === 'course' ? (d.courseSeeds.find((r) => r[0] === id)?.[8] ?? [0, 0, 0, 0, 0]) : teacherLevels(id)
      const dist = distribution(id, levels[0] ?? 0)
      const max = Math.max(1, ...dist)
      return {
        target_id: id, kind, review_count: dist.reduce((a, b) => a + b, 0), dimensions: bands(levels), recommendation: recommendationOf(levels[0] ?? 0),
        ...(charts ? {
          distribution: levels.map(() => ({ samples: dist.reduce((a, b) => a + b, 0), weights: dist.map((n) => Math.round((n / max) * 20)) })),
          terms: trend(id, levels[0] ?? 0).map((row, i) => ({ term_id: `t${i}`, term_name: row.term, review_count: row.samples, dimensions: bands(levels), recommendation: recommendationOf(row.level) })),
        } : {}),
      }
    }),
    policy: { status: 'Accepted', minimum_samples: 3, strongly_recommended_at: 4.5, recommended_at: 3.5, average_at: 2.5 },
    generated_at: new Date().toISOString(),
  })
}

/** Courses the demo viewer has opened recently, newest first. */
const recentCourses = ['c3', 'c1', 'c2', 'c5', 'c10']

async function body(init?: RequestInit) {
  try { return JSON.parse(String(init?.body ?? '{}')) as Record<string, any> } catch { return {} }
}

async function route(u: URL, method: string, init?: RequestInit): Promise<Response> {
  const p = u.pathname.replace('/api/v1', '')
  const who = persona()
  if (p === '/auth/session') return who === 'guest' ? nope('unauthenticated', 401) : json({ authenticated: true, content_school_id: d.SCHOOL, profile: demoProfile, csrf_token: 'a'.repeat(43), phone_bound: true, administrator: false, expires_at: '2030-01-01T00:00:00Z' })
  if (p === '/auth/logout' || p === '/auth/logout-all') { setPersona('guest'); return new Response(null, { status: 204 }) }
  if (p === '/profiles/me' && method === 'PUT') {
    const b = await body(init)
    if (b.revision !== demoProfile.revision) return json({ code: 'conflict', current: demoProfile }, 409)
    Object.assign(demoProfile, { nickname: b.nickname, bio: b.bio ?? demoProfile.bio, visibility: b.visibility ?? demoProfile.visibility, group_card_consent: b.group_card_consent ?? demoProfile.group_card_consent, revision: demoProfile.revision + 1 })
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
  // 原型为这些可选模块提供了模拟接口，对应页面和入口随之开放。群组和会员没有模拟接口，保持关闭。
  if (p === '/system/capabilities') return json({ api_version: 1, capabilities: ['platform.status', 'favorites.manage', 'billing.wallet', 'billing.resource-unlock', 'notifications.inbox', 'open-platform.data', 'qq-binding.manage', 'search.query'] })
  if (who === 'guest' && !p.startsWith('/verification/schools')) return nope('unauthenticated', 401)
  const favorite = await favoritesRoute(p, method, u, init, who === 'verified')
  if (favorite) return favorite
  const qq = await qqRoute(p, method, init)
  if (qq) return qq
  const billing = await billingRoute(p, method, u, init)
  if (billing) return billing
  const platform = await openPlatformRoute(p, method, init)
  if (platform) return platform

  const notifications = await notificationsRoute(p, method, init)
  if (notifications) return notifications
  const teacher = await teacherRoute(p, method, init)
  if (teacher) return teacher

  if (p.startsWith('/verification')) {
    if (p === '/verification/capture' && method === 'POST') {
      const size = init?.body instanceof Blob ? init.body.size : 1
      const material = teacherCaptured(size) ?? studentCaptured(size)
      return material ? json(material, 201) : nope('not_found', 404)
    }
    if (p.startsWith('/verification/materials/') && method === 'DELETE') {
      const id = decodeURIComponent(p.slice('/verification/materials/'.length))
      const removed = teacherMaterialDeleted(id) ?? studentMaterialDeleted(id)
      return removed ? json(removed) : nope('not_found', 404)
    }
    const student = verificationRoute(p, method, init, who, teacherApplications())
    if (student) return student
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
  if (p === '/catalog/directory') return directory(u)
  if (p === '/catalog/me/next-class-day') return json(myCoursesEnabled ? nextClassDay() : { state: 'unavailable', reason: 'enrollment_display_not_granted', date: '', time_zone: 'Asia/Shanghai', items: [] })
  if (p === '/catalog/me/recent-courses' && method === 'DELETE') { recentCourses.length = 0; return json({ cleared: true }) }
  if (p === '/catalog/me/recent-courses') return json({ resources_state: 'available', items: recentCourses.map((id, i) => ({ course: d.allObjects.find((o) => o.id === id), visited_at: new Date(Date.now() - i * 36e5).toISOString(), resource_count: resources.filter((r) => r.current?.metadata.associations.course_id === id).length })) })
  if (p === '/catalog/objects/lookup') {
    const ids = (u.searchParams.get('ids') ?? '').split(',')
    const items = d.allObjects.filter((o) => ids.includes(o.id))
    return json({ items, missing_ids: ids.filter((id) => !items.some((o) => o.id === id)) })
  }
  if (p.endsWith('/summary') && p.startsWith('/catalog/objects/')) return summary(decodeURIComponent(p.split('/').at(-2)!))
  if (p.startsWith('/catalog/objects/')) { const o = d.allObjects.find((x) => x.id === decodeURIComponent(p.split('/').at(-1)!)); return o ? json(o) : nope('not_found', 404) }
  if (p === '/catalog/me/enrollments') return json(d.enrollments)
  if (p === '/catalog/me/schedule') return json({ items: schedule(u.searchParams.get('term_id') ?? ''), next: '' })
  // 只有当前学期带结构化时间和作息。其余学期只有时间原文，按规格返回 schedule_incomplete。
  if (p === '/catalog/me/schedule/calendar') return u.searchParams.get('term_id') === CURRENT_TERM ? new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//StuHelper Demo//EN\r\nEND:VCALENDAR\r\n', { headers: { 'content-type': 'text/calendar' } }) : nope('schedule_incomplete', 422)

  if (p === '/reviews/presentation') return json({ effective: { school_id: d.SCHOOL, revision: 0, rating_texts: {} }, configured: null, source: 'default' })
  if (p === '/reviews/statistics') return statistics(u)
  if (p === '/reviews/summaries') return summaries(u)
  if (p === '/reviews/me/overview') return json({ review_count: reviews.filter((r) => r.mine).length, draft_count: drafts.length, pending_courses: myCoursesEnabled ? pendingCourses() : { state: 'unavailable', reason: 'enrollment_display_not_granted', count: null, items: [] } })
  if (p === '/search' || p === '/search/popular') return json({ items: search(u, p === '/search/popular'), next_cursor: '' })
  if (p === '/search/my-votes') return json({ items: d.reviews.slice(0, 3).map((r, i) => ({ target: { source: 'reviews', id: r.id, kind: 'review' }, choice: i === 1 ? 'down' : 'up' })), next_cursor: '' })
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
  if (p === '/reviews/me/votes') {
    const after = u.searchParams.get('after') ?? ''
    const limit = Number(u.searchParams.get('limit') || 20)
    const votes = [...reviews, ...replies].filter(row => row.my_vote && row.id > after)
      .sort((a, b) => a.id < b.id ? -1 : 1).slice(0, limit)
    return json(votes.map(({ id, root_id, school_id, kind, target_id, term_id, my_vote }) =>
      ({ id, root_id, school_id, kind, target_id, term_id: term_id ?? '', my_vote })))
  }
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
  if (p === '/resources/me/summary') return json({ resource_count: resources.filter((r) => r.owned).length, published_count: resources.filter((r) => r.owned && r.current).length })
  if (p === '/resources/me') {
    const items = resources.filter((r) => r.owned)
    return json({ items, next_cursor: '', total: items.length })
  }
  if (p === '/resources/packages') return json({ id: 'pack', parts: [{ number: 1, bytes: 1000, files: [(resources[0]!.current as any).file] }], expires_at: '2030-01-01T00:00:00Z' })
  if (p === '/resources' && method === 'GET') {
    const q = u.searchParams
    const text = (q.get('query') ?? '').trim()
    const items = resources.filter((r) => { const v = r.current; if (!v) return false; const m = v.metadata; return (!q.get('course_id') || m.associations.course_id === q.get('course_id')) && (!q.get('category_id') || m.category_id === q.get('category_id')) && (!text || m.title.includes(text)) })
    return json({ items, next_cursor: '', total: items.length })
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

const CURRENT_TERM = 't-26f'
// 每节 45 分钟。
const plus45 = (time: string) => { const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 45; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }

// 以下两项只在演示开关打开「我的课程」时使用，数据来自演示周课表和演示选课记录。
/** 下一个上课日：今天还有课就是今天，否则是之后最近的有课日期。时间按北京时间给出。 */
function nextClassDay() {
  const today = new Date(Date.now() + 8 * 36e5)
  const weekday = today.getUTCDay() || 7
  const offset = [0, 1, 2, 3, 4, 5, 6].find((days) => timetable.some((row) => row.day === ((weekday - 1 + days) % 7) + 1)) ?? 0
  const date = new Date(today.getTime() + offset * 864e5).toISOString().slice(0, 10)
  const day = ((weekday - 1 + offset) % 7) + 1
  const items = timetable.filter((row) => row.day === day).sort((a, b) => a.start - b.start).map((row) => ({
    course_id: row.course, course_name: row.name, teachers: d.teachers.filter((t) => t.name === row.teacher), location: row.place,
    starts_at: `${date}T${periodStarts[row.start - 1]}:00+08:00`, ends_at: `${date}T${plus45(periodStarts[row.end - 1]!)}:00+08:00`, start_period: row.start, end_period: row.end,
  }))
  return { state: items.length ? 'available' : 'empty', reason: '', date, time_zone: 'Asia/Shanghai', items }
}
/** 上学期修过、本人还没有评价的课程。 */
function pendingCourses() {
  const mine = new Set(reviews.filter((r) => r.mine).map((r) => r.target_id))
  const items = d.enrollments.filter((e) => e.term_id !== CURRENT_TERM && !mine.has(e.course_id)).map((e) => ({ course_id: e.course_id, course_name: String(d.allObjects.find((o) => o.id === e.course_id)?.name ?? e.course_id), term_id: e.term_id, term_name: String(d.terms.find((t) => t.id === e.term_id)?.name ?? e.term_id) }))
  return { state: 'available', reason: '', count: items.length, items }
}

// 本人课表：当前学期按演示周课表生成结构化时间，往期学期只有原文时间。
function schedule(term: string) {
  const range = (text: string) => { const [a, b] = text.replace(/[^\d-]/g, '').split('-').map(Number); return Array.from({ length: b! - a! + 1 }, (_, i) => a! + i) }
  const periods = periodStarts.map((start, i) => ({ number: i + 1, start, end: plus45(start) }))
  return d.enrollments.filter((e) => e.term_id === term).map((e) => {
    const rows = timetable.filter((row) => row.course === e.course_id)
    const meetings = term === CURRENT_TERM
      ? rows.map((row, i) => ({ id: `${e.id}-m${i}`, time_text: `周${'一二三四五六日'[row.day - 1]} 第${row.start}-${row.end}节 第${row.weeks.replace(' 周', '')}周`, location: row.place, schedule_time: { weekday: row.day, start_period: row.start, end_period: row.end, weeks: range(row.weeks) } }))
      : [{ id: `${e.id}-m0`, time_text: '周三 下午', location: '' }]
    return { enrollment: { ...e, fetched_at: d.ago(0, 6) }, course_name: d.allObjects.find((o) => o.id === e.course_id)?.name ?? e.course_id, meetings, ...(term === CURRENT_TERM ? { timetable: { school_id: d.SCHOOL, term_id: term, revision: 1, week_one_start: '2026-09-07', timezone: 'Asia/Shanghai', periods } } : {}) }
  })
}

// 搜索与热门：按名称或标题匹配课程、教师和评价；热门按评价数排序。
function search(u: URL, popular: boolean) {
  const kind = u.searchParams.get('kind') ?? ''
  const q = (u.searchParams.get('q') ?? '').trim().toLowerCase()
  const objects = d.allObjects.filter((o) => (o.kind === 'course' || o.kind === 'teacher') && (!kind || o.kind === kind))
  if (popular) {
    const count = (id: string) => d.reviews.filter((r) => r.target_id === id || ('teacher_id' in r && r.teacher_id === id)).length
    return objects.sort((a, b) => count(b.id) - count(a.id)).slice(0, 20).map((o) => ({ target: { source: 'catalog', id: o.id, kind: o.kind }, title: o.name, school_id: d.SCHOOL }))
  }
  const found = objects.filter((o) => o.name.toLowerCase().includes(q)).map((o) => ({ target: { source: 'catalog', id: o.id, kind: o.kind }, title: o.name, school_id: d.SCHOOL }))
  const reviews = !kind || kind === 'review' ? d.reviews.filter((r) => r.title.toLowerCase().includes(q)).map((r) => ({ target: { source: 'reviews', id: r.id, kind: 'review' }, title: r.title, school_id: d.SCHOOL })) : []
  return [...found, ...reviews].slice(0, Number(u.searchParams.get('limit') ?? 20))
}
