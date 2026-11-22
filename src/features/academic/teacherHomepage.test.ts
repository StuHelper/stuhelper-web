import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { Http } from '../../shared/api/http'
import { base64Of, photoLimit, TeacherHomepageApi, textLimit } from './teacherHomepage'

describe('teacher homepage requests', () => {
  it('applies the character limit for the selected text field or labelled item', () => {
    expect(textLimit('name', false)).toBe(256)
    expect(textLimit('office_location', false)).toBe(512)
    expect(textLimit('biography', false)).toBe(16_000)
    expect(textLimit('research', false)).toBe(16_000)
    expect(textLimit('fields', true)).toBe(1024)
    expect(textLimit('sections', true)).toBe(16_000)
    expect(textLimit('fields', false)).toBe(512)
    expect(textLimit('sections', false)).toBe(512)
  })

  it('encodes empty and binary photo content as standard padded base64', async () => {
    expect(await base64Of(new Blob([]))).toBe('')
    expect(await base64Of(new Blob([Uint8Array.of(0xfb, 0xff)]))).toBe('+/8=')
    expect(await base64Of(new Blob([Uint8Array.of(0)]))).toBe('AA==')
  })

  it('preserves every byte of a photo at the two MiB limit', async () => {
    const bytes = Uint8Array.from({ length: photoLimit }, (_, index) => index % 251)
    const encoded = await base64Of(new Blob([bytes]))
    expect(encoded).toBe(Buffer.from(bytes).toString('base64'))
  })
})

describe('teacher homepage media', () => {
  it('reads copied images with the session, rejects redirects and enforces the 20 MiB stream limit', async () => {
    const url = `/api/v1/catalog/objects/teacher-a/teacher-homepage/images/${'a'.repeat(64)}`
    const chunk = new Uint8Array(1024 * 1024)
    function imageResponse(extraByte: boolean) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let index = 0; index < 20; index++) controller.enqueue(chunk)
          if (extraByte) controller.enqueue(Uint8Array.of(0))
          controller.close()
        },
      })
      return new Response(body, { headers: { 'Content-Type': 'image/png' } })
    }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse(false))
      .mockResolvedValueOnce(imageResponse(true))
    const api = new TeacherHomepageApi(new Http(fetcher))
    const image = await api.bodyImage(url)
    expect(image.size).toBe(20 * 1024 * 1024)
    expect(image.type).toBe('image/png')
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: 'same-origin', redirect: 'error' }))
    await expect(api.bodyImage(url)).rejects.toMatchObject({ code: 'capacity_exceeded' })
  })
})
