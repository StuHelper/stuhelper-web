import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hue } from './hue'

const css = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8')

describe('hue', () => {
  it('gives an identifier one colour everywhere and spreads different identifiers', () => {
    expect(hue('dept-06')).toBe(hue('dept-06'))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => hue(`category-${i}`)))
    expect(seen.size).toBeGreaterThanOrEqual(6)
    // Every tone it hands out must be a defined light/dark token, or the colour silently disappears.
    for (const tone of seen) {
      const name = /^var\((--c-[a-z]+)\)$/.exec(tone)?.[1]
      expect(name && new RegExp(`${name}:\\s*light-dark\\(`).test(css)).toBe(true)
    }
  })
})
