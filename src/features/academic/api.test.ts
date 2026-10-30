import { describe, expect, it, vi } from 'vitest'
import { Http } from '../../shared/api/http'
import { AcademicApi, knownCredits } from './api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('academic boundary', () => {
  it('rejects unexpected identity fields in catalog responses', async () => {
    const api = new AcademicApi(new Http(async () => json({ items: [], next: '', subject: 'secret' })))
    await expect(api.objects({})).rejects.toMatchObject({ code: 'incompatible' })
  })

  it('keeps an eligibility rejection distinct from an unavailable service', async () => {
    const api = new AcademicApi(new Http(async () => json({ code: 'enrollment_required' }, 403)))
    await expect(api.publish({ kind: 'course', target_id: 'c', title: 't', body: 'b', ratings: [0, 0, 0, 0, 0], signed: false }, 'key')).rejects.toMatchObject({ code: 'enrollment_required', uncertain: false })
  })

  it('loads selection lists past the first page without losing the filter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ items: [], next: 'page-two' })).mockResolvedValueOnce(json({ items: [], next: '' }))
    await new AcademicApi(new Http(fetcher)).options({ kind: 'teacher', course_id: 'course' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const second = new URL(String(fetcher.mock.calls[1]?.[0]), 'https://example.test')
    expect(second.searchParams.get('after')).toBe('page-two')
    expect(second.searchParams.get('course_id')).toBe('course')
  })

  it('rejects a repeated selection cursor instead of looping', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ items: [], next: 'same' }))
    await expect(new AcademicApi(new Http(fetcher)).options({ kind: 'category' })).rejects.toMatchObject({ code: 'incompatible' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('looks up names in batches of at most 100 identifiers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ items: [], missing_ids: [] }))
    await new AcademicApi(new Http(fetcher)).lookup([...Array.from({ length: 150 }, (_, index) => `id-${index}`), 'id-1', undefined])
    expect(fetcher).toHaveBeenCalledTimes(2)
    const first = new URL(String(fetcher.mock.calls[0]?.[0]), 'https://example.test')
    expect(first.searchParams.get('ids')?.split(',')).toHaveLength(100)
  })

  it('treats missing credits as unknown and zero credits as a value', () => {
    expect(knownCredits({ credits: null as unknown as number })).toBeUndefined()
    expect(knownCredits({ credits: 0 })).toBe(0)
  })
})
