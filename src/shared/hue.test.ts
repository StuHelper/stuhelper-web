import { describe, expect, it } from 'vitest'
import { hue } from './hue'

describe('hue', () => {
  it('gives the same identifier the same tone and spreads different ones', () => {
    expect(hue('dept-06')).toBe(hue('dept-06'))
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(hue))
    expect(seen.size).toBeGreaterThan(3)
    for (const tone of seen) expect(tone).toMatch(/^var\(--c-[a-z]+\)$/)
  })
})
