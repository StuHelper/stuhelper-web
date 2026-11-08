import * as d from './data'

// In-memory open platform that follows the open-platform contract: applications wait for
// review, a credential secret appears only on the first response, grants can be withdrawn
// scope by scope, and a consent request returns to the application's exact redirect URI.
type Scope = 'student_status' | 'schools' | 'qq_binding_status' | 'qq_binding_details' | 'profile' | 'schedule' | 'catalog' | 'public_reviews'
type App = { id: string; name: string; purpose: string; redirect_uris: string[]; requested_scopes: Scope[]; approved_scopes: Scope[]; client_type: 'public' | 'confidential'; state: 'pending' | 'changes_requested' | 'active' | 'suspended'; note: string; revision: number; credential_revision: number; policy: { grant_seconds: number; token_seconds: number; daily_quota: number }; created_at: string }

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code }, status)
const policy = { grant_seconds: 180 * 86400, token_seconds: 3600, daily_quota: 1000 }

const apps: App[] = [
  { id: 'app-timetable', name: '航课表小组件', purpose: '在手机桌面显示本人课表。', redirect_uris: ['https://widget.example.invalid/callback'], requested_scopes: ['profile', 'schedule'], approved_scopes: ['profile', 'schedule'], client_type: 'confidential', state: 'active', note: '', revision: 2, credential_revision: 1, policy, created_at: d.ago(60) },
  { id: 'app-export', name: '评价导出工具', purpose: '把公开评价导出为表格。', redirect_uris: ['https://export.example.invalid/cb'], requested_scopes: ['public_reviews', 'qq_binding_details'], approved_scopes: [], client_type: 'public', state: 'changes_requested', note: '请说明为什么需要 QQ 号码。', revision: 1, credential_revision: 0, policy, created_at: d.ago(3) },
]
const grants = [
  { id: 'grant-timetable', app_id: 'app-timetable', app_name: '航课表小组件', subject: 'demo', scopes: ['profile', 'schedule'] as Scope[], state: 'active' as 'active' | 'revoked', expires_at: new Date(Date.now() + 150 * 864e5).toISOString(), revision: 1 },
  { id: 'grant-planner', app_id: 'app-planner', app_name: '选课助手', subject: 'demo', scopes: ['catalog', 'public_reviews', 'student_status'] as Scope[], state: 'active' as 'active' | 'revoked', expires_at: new Date(Date.now() + 40 * 864e5).toISOString(), revision: 3 },
]
const notices = [{ id: 'notice-1', app_id: 'app-timetable', subject: 'user-7f3a', scopes: ['schedule'] as Scope[], reason: 'user_revoked', created_at: d.ago(1), sequence: 1 } as Record<string, unknown>]
const consents = new Map<string, Record<string, unknown>>()
const receipts = new Map<string, unknown>()
let sequence = 0

export async function openPlatformRoute(p: string, method: string, init: RequestInit | undefined): Promise<Response | undefined> {
  if (!p.startsWith('/open-platform/')) return undefined
  const path = p.replace('/open-platform', '')
  if (method === 'GET') {
    if (path === '/apps') return json({ items: apps, next: '' })
    if (path === '/grants') return json({ items: grants, next: '' })
    const notice = /^\/apps\/([^/]+)\/notices$/.exec(path)
    if (notice) return json({ items: notices.filter((item) => item.app_id === notice[1]).map((item) => ({ ...item, seen_at: new Date().toISOString() })), next: '' })
    const consent = /^\/consents\/([^/]+)$/.exec(path)
    if (consent) return consents.has(consent[1]!) ? json(consents.get(consent[1]!)) : nope('not_found', 404)
    const app = apps.find((item) => path === `/apps/${item.id}`)
    return app ? json(app) : nope('not_found', 404)
  }
  const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
  // A replayed credential request never shows the secret again.
  if (receipts.has(key)) {
    const stored = receipts.get(key) as Record<string, unknown>
    return json('client_secret' in stored ? { ...stored, client_secret: undefined, retrievable: false } : stored)
  }
  const done = (value: unknown) => { receipts.set(key, value); return json(value) }

  if (path === '/apps') {
    const app: App = { id: `app-${++sequence}`, name: body.name, purpose: body.purpose, redirect_uris: body.redirect_uris, requested_scopes: body.requested_scopes, approved_scopes: [], client_type: body.client_type, state: 'pending', note: '', revision: 1, credential_revision: 0, policy, created_at: new Date().toISOString() }
    apps.unshift(app)
    return done(app)
  }
  const submit = /^\/apps\/([^/]+)\/submit$/.exec(path)
  if (submit) {
    const app = apps.find((item) => item.id === submit[1])
    if (!app || app.state === 'active') return nope('conflict', 409)
    if (body.revision !== app.revision) return nope('conflict', 409)
    Object.assign(app, { name: body.name, purpose: body.purpose, redirect_uris: body.redirect_uris, requested_scopes: body.requested_scopes, client_type: body.client_type, state: 'pending', note: '', revision: app.revision + 1 })
    return done(app)
  }
  const credential = /^\/apps\/([^/]+)\/credential$/.exec(path)
  if (credential) {
    const app = apps.find((item) => item.id === credential[1])
    if (!app || body.revision !== app.credential_revision) return nope('conflict', 409)
    app.credential_revision++
    return done({ app_id: app.id, revision: app.credential_revision, client_secret: `opsecret_demo${Math.random().toString(16).slice(2, 14)}`, retrievable: true })
  }
  const ack = /^\/apps\/([^/]+)\/notices\/([^/]+)\/ack$/.exec(path)
  if (ack) {
    const notice = notices.find((item) => item.id === ack[2])
    if (!notice) return nope('not_found', 404)
    Object.assign(notice, { acknowledgement: body.status, note: body.note, acknowledged_at: new Date().toISOString() })
    return done(notice)
  }
  const revoke = /^\/grants\/([^/]+)\/revoke$/.exec(path)
  if (revoke) {
    const grant = grants.find((item) => item.id === revoke[1])
    if (!grant || body.revision !== grant.revision) return nope('conflict', 409)
    grant.scopes = grant.scopes.filter((scope) => !body.scopes.includes(scope))
    grant.revision++
    if (!grant.scopes.length) grant.state = 'revoked'
    return done(grant)
  }
  if (path === '/consents') {
    const app = apps.find((item) => item.id === body.client_id && item.state === 'active')
    if (!app || !app.redirect_uris.includes(body.redirect_uri)) return nope('invalid_input', 400)
    const consent = { id: `consent-${++sequence}`, application: app, requested_scopes: (body.scope as Scope[]).filter((scope) => app.approved_scopes.includes(scope)), redirect_uri: body.redirect_uri, state: body.state, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), qq_tiers: [] }
    consents.set(consent.id, consent)
    const { state: _, ...view } = consent
    return done(view)
  }
  const decision = /^\/consents\/([^/]+)\/decision$/.exec(path)
  if (decision) {
    const consent = consents.get(decision[1]!)
    if (!consent) return nope('not_found', 404)
    const target = new URL(String(consent.redirect_uri))
    if (body.decision === 'approve') target.searchParams.set('code', `demo-code-${++sequence}`)
    else target.searchParams.set('error', 'access_denied')
    target.searchParams.set('state', String(consent.state))
    return done({ redirect_uri: target.toString() })
  }
  return nope('not_found', 404)
}
