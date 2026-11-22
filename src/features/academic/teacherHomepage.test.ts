import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { base64Of, photoLimit, textLimit } from './teacherHomepage'

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
