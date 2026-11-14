// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTheme, setTheme, theme } from './theme'

function system(dark: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => undefined }))
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })
  afterEach(() => vi.unstubAllGlobals())

  it('follows the system appearance until a choice is saved', () => {
    system(true)
    installTheme()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applies and remembers an explicit choice', () => {
    system(true)
    installTheme()
    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    system(true)
    installTheme()
    expect(theme.value).toBe('light')
  })

  it('ignores an unknown saved value', () => {
    localStorage.setItem('stuhelper.theme', 'sepia')
    system(false)
    installTheme()
    expect(theme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
