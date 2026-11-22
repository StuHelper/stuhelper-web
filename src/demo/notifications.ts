import * as d from './data'

// In-memory notifications following the notifications contract and its title catalog.
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const review = d.reviews?.[0]?.id ?? 'r1'
// 按时间从新到旧，覆盖消息中心的四个分类。
const items = [
  { id: 'n3', type: 'interaction', source_module: 'reviews', target: { kind: 'review', id: review }, title_key: 'notifications.interaction.reply', title_params: { content_id: review }, created_at: d.ago(0, 2), read_at: null, target_status: 'accessible', count: 3 },
  { id: 'n2', type: 'business', source_module: 'verification', target: { kind: 'verification_application', id: 'app1' }, title_key: 'notifications.student_verification.approved', title_params: { application_id: 'app1' }, created_at: d.ago(1), read_at: null, target_status: 'accessible', count: 1 },
  { id: 'n1', type: 'business', source_module: 'resources', target: { kind: 'resource', id: 'gone' }, title_key: 'notifications.content.removed', title_params: { content_id: 'gone' }, created_at: d.ago(3), read_at: d.ago(2), target_status: 'inaccessible', count: 1 },
  { id: 'n6', type: 'interaction', source_module: 'reviews', target: { kind: 'review', id: review }, title_key: 'notifications.interaction.like', title_params: { content_id: review }, created_at: d.ago(0, 5), read_at: null, target_status: 'accessible', count: 12 },
  { id: 'n5', type: 'security', source_module: 'platform', target: { kind: 'verification_operation', id: 'sec-1' }, title_key: 'notifications.system.security', title_params: { reference_id: 'sec-1' }, created_at: d.ago(0, 8), read_at: null, target_status: 'accessible', count: 1 },
  { id: 'n4', type: 'business', source_module: 'platform', target: { kind: 'verification_operation', id: 'ntc-7' }, title_key: 'notifications.system.notice', title_params: { reference_id: 'ntc-7' }, created_at: d.ago(2), read_at: d.ago(1), target_status: 'accessible', count: 1 },
] as Array<Record<string, unknown> & { id: string; read_at: string | null }>
const preferences = { reply_enabled: true, like_enabled: true }
const boxNames = ['interaction', 'review', 'verification', 'system'] as const
// Mirrors the server's BoxForTitleKey.
function boxOf(key: string) {
  const subject = key.slice('notifications.'.length).split('.')[0] ?? ''
  if (subject === 'interaction') return 'interaction'
  if (['content', 'resource_removal', 'report', 'appeal', 'teacher_homepage_request'].includes(subject)) return 'review'
  if (subject.endsWith('_verification') || subject.startsWith('verification_')) return 'verification'
  return 'system'
}
const inBox = (box: string | null) => items.filter((item) => !box || boxOf(String(item.title_key)) === box)

export async function notificationsRoute(p: string, method: string, init?: RequestInit, query = new URLSearchParams()): Promise<Response | undefined> {
  if (!p.startsWith('/notifications')) return undefined
  if (p === '/notifications') return json({ items: inBox(query.get('box')), next_cursor: '' })
  if (p === '/notifications/unread-count') {
    const unread = items.filter((item) => !item.read_at)
    const by_box = Object.fromEntries(boxNames.map((box) => [box, unread.filter((item) => boxOf(String(item.title_key)) === box).length]))
    const by_type = Object.fromEntries(['interaction', 'business', 'security', 'account'].map((type) => [type, unread.filter((item) => item.type === type).length]))
    return json({ count: unread.length, by_box, by_type })
  }
  if (p === '/notifications/read-all') {
    for (const item of inBox(query.get('box'))) item.read_at ??= new Date().toISOString()
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
