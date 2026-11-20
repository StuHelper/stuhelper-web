// A stable colour per identifier (category, department, teacher), so the same thing always
// carries the same colour across pages. The colours are the shared system tones, which adapt
// to light and dark appearance; text drawn on them is mixed toward the label colour for contrast.
const tones = ['var(--c-blue)', 'var(--c-purple)', 'var(--c-orange)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-indigo)', 'var(--c-cyan)', 'var(--c-flame)'] as const

export function hue(id: string): string {
  let sum = 0
  for (const char of id) sum = (sum * 31 + char.codePointAt(0)!) >>> 0
  return tones[sum % tones.length]!
}
