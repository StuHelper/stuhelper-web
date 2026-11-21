import { beforeEach, expect, it } from 'vitest'
import { Http } from '../../shared/api/http'
import { FavoritesApi, type Favorite } from './api'
import { favoriteFailed, favoriteOf, requestFavorite, resetFavorites } from './state'

const item = (target: string, kind: Favorite['kind'] = 'course'): Favorite => ({ id: `fv-${target}`, kind, target_id: target, title: target, folder_id: 'default', revision: 1, created_at: '2026-11-01T00:00:00Z' })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(resetFavorites)

it('loads every folder page before calculating the personal favorite total', async () => {
  const cursors: string[] = []
  const api = new FavoritesApi(new Http(async (input) => {
    const cursor = new URL(String(input), 'http://localhost').searchParams.get('after') ?? ''
    cursors.push(cursor)
    const folder = (id: string, count: number) => ({ id, name: id, is_default: false, revision: 1, item_count: count, kind_counts: { course: count, teacher: 0, resource: 0 } })
    return Response.json(cursor ? { items: [folder('last', 7)], next: '' } : {
      items: Array.from({ length: 100 }, (_, index) => folder(`folder-${index}`, 2)), next: 'second',
    })
  }))
  const folders = await api.allFolders()
  expect(cursors).toEqual(['', 'second'])
  expect(folders.reduce((sum, folder) => sum + folder.item_count, 0)).toBe(207)
})

it('looks up favorites of many targets with one request per 100 targets', async () => {
  const urls: URL[] = []
  const api = new FavoritesApi(new Http(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    urls.push(url)
    const ids = url.searchParams.get('target_ids')!.split(',')
    return Response.json({ items: ids.filter((id) => id.endsWith('0')).map((id) => item(id)), next: '' })
  }))
  const targets = Array.from({ length: 150 }, (_, index) => `c${index}`)
  const found = await api.lookup('course', [...targets, 'c1'])
  expect(urls).toHaveLength(2)
  expect(urls[0]!.searchParams.get('kind')).toBe('course')
  expect(urls[0]!.searchParams.get('target_ids')!.split(',')).toHaveLength(100)
  expect(urls[1]!.searchParams.get('target_ids')!.split(',')).toHaveLength(50)
  expect(found.size).toBe(15)
  expect(found.get('c10')?.id).toBe('fv-c10')
})

it('sends target ids separated by literal commas, each id percent-encoded', async () => {
  const raw: string[] = []
  const api = new FavoritesApi(new Http(async (input) => {
    raw.push(new URL(String(input), 'http://localhost').search)
    return Response.json({ items: [], next: '' })
  }))
  await api.lookup('course', ['a', 'b,c'])
  // The provider splits on unencoded commas only, so "b,c" stays one id.
  expect(raw[0]).toContain('target_ids=a,b%2Cc')
})

it('buttons rendered together share one lookup per kind', async () => {
  const urls: URL[] = []
  const api = new FavoritesApi(new Http(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    urls.push(url)
    return Response.json({ items: url.searchParams.get('kind') === 'course' ? [item('a')] : [], next: '' })
  }))
  requestFavorite(api, 'course', 'a')
  requestFavorite(api, 'course', 'b')
  requestFavorite(api, 'teacher', 'p')
  await settle()
  expect(urls.map((url) => url.searchParams.get('kind')).sort()).toEqual(['course', 'teacher'])
  expect(favoriteOf('course', 'a')?.id).toBe('fv-a')
  expect(favoriteOf('course', 'b')).toBeNull()
  expect(favoriteOf('teacher', 'p')).toBeNull()
  // A known state is not requested again.
  requestFavorite(api, 'course', 'a')
  await settle()
  expect(urls).toHaveLength(2)
})

it('keeps the state unknown when the lookup fails, and treats a signed-out viewer as not saved', async () => {
  let status = 503
  const api = new FavoritesApi(new Http(async () => Response.json({ code: status === 401 ? 'unauthenticated' : 'unavailable' }, { status })))
  requestFavorite(api, 'course', 'a')
  await settle()
  expect(favoriteOf('course', 'a')).toBeUndefined()
  expect(favoriteFailed('course', 'a')).toBe(true)
  status = 401
  requestFavorite(api, 'course', 'b')
  await settle()
  expect(favoriteOf('course', 'b')).toBeNull()
})
