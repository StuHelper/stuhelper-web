import * as d from './data'

// In-memory favorites that follow the favorites contract: one favorite per target, stable
// folder ids, revisions on every write and a default folder that cannot be deleted.
type Kind = 'course' | 'teacher' | 'resource'
type Folder = { id: string; name: string; is_default: boolean; revision: number }
type Item = { id: string; kind: Kind; target_id: string; title: string; folder_id: string; revision: number; created_at: string }

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const nope = (code: string, status: number) => json({ code }, status)

function titleOf(kind: Kind, id: string) {
  if (kind === 'resource') return String(d.resources.find((r) => r.id === id)?.current?.metadata?.title ?? '')
  return String((d.allObjects as { id: string; name?: string }[]).find((o) => o.id === id)?.name ?? '')
}

const folders: Folder[] = [
  { id: 'fd-default', name: '', is_default: true, revision: 1 },
  { id: 'fd-review', name: '期末复习', is_default: false, revision: 1 },
  { id: 'fd-next', name: '下学期选课', is_default: false, revision: 1 },
]
const seeds: [Kind, string, string, number][] = [
  ['course', 'c10', 'fd-next', 2], ['course', 'c4', 'fd-next', 4], ['teacher', 'p3', 'fd-default', 6], ['resource', 'x1', 'fd-review', 1],
  ['course', 'c5', 'fd-review', 3], ['teacher', 'p4', 'fd-next', 5], ['resource', 'x3', 'fd-review', 7],
]
const items: Item[] = seeds.map(([kind, target, folder, days], index) => ({ id: `fv-${index}`, kind, target_id: target, title: titleOf(kind, target), folder_id: folder, revision: 1, created_at: d.ago(days) }))
const receipts = new Map<string, unknown>()
let sequence = 0

const view = (folder: Folder) => ({ ...folder, item_count: items.filter((item) => item.folder_id === folder.id).length })
const nameOf = (folder: Folder) => folder.name || '默认收藏'
const taken = (name: string, except?: string) => folders.some((f) => nameOf(f) === name && f.id !== except)

function list(u: URL) {
  const q = u.searchParams
  let rows = [...items]
  const kind = q.get('kind')
  const targets = q.get('target_ids')
  if (targets && !kind) return nope('invalid_input', 400)
  if (kind) rows = rows.filter((r) => r.kind === kind)
  if (targets) { const set = new Set(targets.split(',')); rows = rows.filter((r) => set.has(r.target_id)) }
  if (q.get('folder_id')) rows = rows.filter((r) => r.folder_id === q.get('folder_id'))
  const text = (q.get('q') ?? '').trim().toLowerCase()
  if (text) rows = rows.filter((r) => r.title.toLowerCase().includes(text))
  rows.sort((a, b) => (q.get('sort') === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : b.created_at.localeCompare(a.created_at)))
  const limit = Number(q.get('limit') || 30)
  const start = Number(q.get('after') || 0)
  return json({ items: rows.slice(start, start + limit), next: start + limit < rows.length ? String(start + limit) : '' })
}

/** Handles /favorites requests; returns undefined for other paths. */
export async function favoritesRoute(p: string, method: string, u: URL, init: RequestInit | undefined, admitted: boolean): Promise<Response | undefined> {
  if (!p.startsWith('/favorites/')) return undefined
  if (method === 'GET' && p === '/favorites/folders') return json({ items: folders.map(view), next: '' })
  if (method === 'GET' && p === '/favorites/items') return list(u)
  const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
  const repeat = receipts.get(key)
  if (repeat) return json(repeat)
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
  const done = (value: unknown) => { receipts.set(key, value); return json(value) }
  const id = decodeURIComponent(p.split('/')[3] ?? '')
  if (p === '/favorites/folders') {
    const name = String(body.name ?? '').trim()
    if (!name || [...name].length > 20) return nope('invalid_input', 400)
    if (taken(name)) return nope('conflict', 409)
    const folder = { id: `fd-${++sequence}`, name, is_default: false, revision: 1 }
    folders.push(folder)
    return done(view(folder))
  }
  if (p.startsWith('/favorites/folders/')) {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return nope('not_found', 404)
    if (body.revision !== folder.revision) return nope('conflict', 409)
    if (p.endsWith('/rename')) {
      const name = String(body.name ?? '').trim()
      if (!name || [...name].length > 20) return nope('invalid_input', 400)
      if (taken(name, folder.id)) return nope('conflict', 409)
      folder.name = name
      folder.revision++
      return done(view(folder))
    }
    if (folder.is_default) return nope('conflict', 409)
    for (const item of items) if (item.folder_id === folder.id) { item.folder_id = 'fd-default'; item.revision++ }
    folders.splice(folders.indexOf(folder), 1)
    return done({ id: folder.id, removed: true })
  }
  if (p === '/favorites/items') {
    // Adding needs content admission; the existing favorite is returned unchanged.
    if (!admitted) return nope('forbidden', 403)
    const existing = items.find((i) => i.kind === body.kind && i.target_id === body.target_id)
    if (existing) return done(existing)
    const folder = folders.find((f) => f.id === (body.folder_id ?? 'fd-default'))
    if (!folder) return nope('not_found', 404)
    const item = { id: `fv-${++sequence}`, kind: body.kind as Kind, target_id: String(body.target_id), title: titleOf(body.kind as Kind, String(body.target_id)), folder_id: folder.id, revision: 1, created_at: new Date().toISOString() }
    items.unshift(item)
    return done(item)
  }
  const item = items.find((i) => i.id === id)
  if (!item) return nope('not_found', 404)
  if (body.revision !== item.revision) return nope('conflict', 409)
  if (p.endsWith('/move')) {
    if (!folders.some((f) => f.id === body.folder_id)) return nope('not_found', 404)
    item.folder_id = body.folder_id
    item.revision++
    return done(item)
  }
  items.splice(items.indexOf(item), 1)
  return done({ id: item.id, removed: true })
}
