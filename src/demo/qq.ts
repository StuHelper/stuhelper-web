// In-memory QQ binding that follows the qq-binding contract. A bot code is "sent" a few
// seconds after it is generated, so the prototype shows the waiting and success states.
// QQ Connect returns to /me/qq/callback with a state and code, as the real QQ page would.
type Part = 'onebot' | 'official' | 'connect'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code }, status)

// QQ Connect leaves the page, so the prototype keeps its state for the browser tab.
const STORE = 'stuhelper-demo-qq'
function load<T>(key: string, fallback: T): T {
  try { return (JSON.parse(sessionStorage.getItem(`${STORE}-${key}`) ?? 'null') as T) ?? fallback } catch { return fallback }
}
function save() {
  try {
    sessionStorage.setItem(`${STORE}-parts`, JSON.stringify(parts))
    sessionStorage.setItem(`${STORE}-states`, JSON.stringify([...states]))
  } catch { /* Private windows keep the state only until reload. */ }
}
const parts: Record<Part, { bound: boolean; revision: number }> = load('parts', {
  onebot: { bound: true, revision: 1 },
  official: { bound: false, revision: 0 },
  connect: { bound: false, revision: 0 },
})
const states = new Set<string>(load<string[]>('states', []))
const receipts = new Map<string, unknown>()

const status = () => ({
  complete: parts.onebot.bound && parts.official.bound && parts.connect.bound,
  onebot: { ...parts.onebot },
  official: { ...parts.official },
  connect: { ...parts.connect },
  qq_number: parts.onebot.bound ? '2840137956' : '',
})
function bind(kind: Part) {
  parts[kind] = { bound: true, revision: parts[kind].revision + 1 }
  save()
}
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[byte % 32]).join('')

/** Handles /qq-binding requests; returns undefined for other paths. */
export async function qqRoute(p: string, method: string, init: RequestInit | undefined): Promise<Response | undefined> {
  if (!p.startsWith('/qq-binding/')) return undefined
  if (method === 'GET' && p === '/qq-binding/me') return json(status())
  const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
  if (receipts.has(key)) return json(receipts.get(key))
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
  const done = (value: unknown) => { receipts.set(key, value); return json(value) }
  if (p === '/qq-binding/codes') {
    const kind = body.kind as Part
    if (kind !== 'onebot' && kind !== 'official') return nope('qq_binding_invalid_input', 400)
    if (parts[kind].bound) return nope('qq_binding_already_bound', 409)
    setTimeout(() => bind(kind), 6000)
    return done({ code: randomCode(), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), notice_key: 'qq_binding.only_own_code' })
  }
  if (p === '/qq-binding/connect/start') {
    if (parts.connect.bound) return nope('qq_binding_already_bound', 409)
    const state = randomCode()
    states.add(state)
    save()
    return done({ url: `${location.origin}/me/qq/callback?state=${state}&code=demo`, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
  }
  if (p === '/qq-binding/connect/confirm' || p === '/qq-binding/connect/cancel') {
    if (!states.delete(String(body.state))) return nope('qq_binding_invalid_state', 400)
    save()
    if (p.endsWith('/confirm')) bind('connect')
    return done(status())
  }
  const unlink = /^\/qq-binding\/bindings\/(onebot|official|connect)\/unlink$/.exec(p)
  if (unlink) {
    const kind = unlink[1] as Part
    if (body.revision !== parts[kind].revision) return nope('qq_binding_revision_conflict', 409)
    parts[kind] = { bound: false, revision: parts[kind].revision + 1 }
    save()
    return done(status())
  }
  return nope('qq_binding_not_found', 404)
}
