import * as d from './data'

// In-memory notifications following the notifications contract and its title catalog.
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const review = d.reviews?.[0]?.id ?? 'r1'
const items = [
  { id: 'n3', type: 'interaction', source_module: 'reviews', target: { kind: 'review', id: review }, title_key: 'notifications.interaction.reply', title_params: { content_id: review }, created_at: d.ago(0, 2), read_at: null, target_status: 'accessible', count: 3 },
  { id: 'n2', type: 'business', source_module: 'verification', target: { kind: 'verification_application', id: 'app1' }, title_key: 'notifications.student_verification.approved', title_params: { application_id: 'app1' }, created_at: d.ago(1), read_at: null, target_status: 'accessible', count: 1 },
  { id: 'n1', type: 'business', source_module: 'resources', target: { kind: 'resource', id: 'gone' }, title_key: 'notifications.content.removed', title_params: { content_id: 'gone' }, created_at: d.ago(3), read_at: d.ago(2), target_status: 'inaccessible', count: 1 },
] as Array<Record<string, unknown> & { id: string; read_at: string | null }>
const preferences = { interaction_enabled: true }

export async function notificationsRoute(p: string, method: string, init?: RequestInit): Promise<Response | undefined> {
  if (!p.startsWith('/notifications')) return undefined
  if (p === '/notifications') return json({ items, next_cursor: '' })
  if (p === '/notifications/unread-count') return json({ count: items.filter((item) => !item.read_at).length })
  if (p === '/notifications/read-all') {
    for (const item of items) item.read_at ??= new Date().toISOString()
    return new Response(null, { status: 204 })
  }
  if (p === '/notifications/preferences') {
    if (method === 'PUT') Object.assign(preferences, JSON.parse(String(init?.body ?? '{}')))
    return json(preferences)
  }
  const read = /^\/notifications\/([^/]+)\/read$/.exec(p)
  const item = read && items.find((entry) => entry.id === decodeURIComponent(read[1]!))
  if (item) {
    item.read_at ??= new Date().toISOString()
    return new Response(null, { status: 204 })
  }
  return json({ code: 'not_found' }, 404)
}
