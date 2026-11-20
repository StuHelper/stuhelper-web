import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Colour pairs that carry small text are measured from the real tokens in base.css with the
// WCAG 2.2 formula (normal text needs 4.5:1). Backgrounds with transparency are composited first.
const css = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8')
function token(name: string): [string, string] {
  const found = new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(css)
  if (!found) throw new Error(`token --${name} is not a light-dark pair of hex colours`)
  return [found[1]!, found[2]!]
}
type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb
const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((v, i) => v * share + b[i]! * (1 - share)) as Rgb
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (c: Rgb) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2])
function ratio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const surfaces = { light: rgb('#ffffff'), dark: rgb('#161617') }
const tones = ['blue', 'purple', 'orange', 'green', 'pink', 'indigo', 'cyan', 'flame']

describe.each([0, 1] as const)('appearance %i (0 light, 1 dark)', (side) => {
  const surface = side ? surfaces.dark : surfaces.light
  const label = rgb(token('label')[side])
  // Hovered course rows lay --accent-soft over the card; plain rows and link hover are covered too.
  const hoverRow = mix(rgb(side ? '#6e8cff' : '#2d5bff'), surface, side ? 0.18 : 0.1)

  it.each(tones)('a %s category tag stays readable on cards, hovered rows and when hovered', (tone) => {
    const hue = rgb(token(`c-${tone}`)[side])
    const text = mix(hue, label, 0.5)
    for (const [base, wash] of [[surface, 0.14], [hoverRow, 0.14], [surface, 0.22]] as const) {
      expect(ratio(text, mix(hue, base, wash))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('verdict words keep 4.5:1 on cards and hovered rows', () => {
    for (const name of ['success', 'warning', 'danger']) {
      const text = rgb(token(name)[side])
      expect(ratio(text, surface)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(text, hoverRow)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('a pressed filter chip keeps white text readable, also on hover', () => {
    for (const name of ['chip-on', 'chip-on-hover']) expect(ratio(rgb('#ffffff'), rgb(token(name)[side]))).toBeGreaterThanOrEqual(4.5)
  })
})
